import { Router } from "express";
import mongoose, { Schema, model, type Types } from "mongoose";
import {
  ErrorCode,
  HttpStatus,
  ProductStatus,
  ShipmentStatus,
  reviewQuerySchema,
  reviewSchema,
  type ReviewDTO,
  type ReviewEligibility,
  type ReviewSummary,
} from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { authenticate } from "../../middleware/authenticate";
import { parsedQuery, validate, validateQuery } from "../../middleware/validate";
import { Product } from "../catalog/product.model";
import { notify } from "../notifications/notification.module";
import { Order } from "../orders/order.model";
import { User } from "../users/user.model";

interface ReviewShape {
  product: Types.ObjectId;
  user: Types.ObjectId;
  authorName: string;
  rating: number;
  title?: string;
  body: string;
  visible: boolean;
  helpfulBy: Types.ObjectId[];
  createdAt: Date;
}

const reviewModelSchema = new Schema<ReviewShape>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: String,
    body: { type: String, required: true },
    visible: { type: Boolean, default: true },
    helpfulBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);
// one review per person per product
reviewModelSchema.index({ user: 1, product: 1 }, { unique: true });

export const Review = model<ReviewShape>("Review", reviewModelSchema);

// "Maya Iyer" -> "Maya I." - enough to feel real, not enough to identify someone
const publicName = (full: string) => {
  const [first = "Customer", last] = full.trim().split(/\s+/);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
};

const toDTO = (r: ReviewShape & { _id: Types.ObjectId }, viewerId?: string): ReviewDTO => ({
  id: String(r._id),
  rating: r.rating,
  title: r.title ?? undefined,
  body: r.body,
  author: publicName(r.authorName),
  createdAt: r.createdAt.toISOString(),
  helpfulCount: r.helpfulBy.length,
  helpfulByMe: viewerId ? r.helpfulBy.some((u) => String(u) === viewerId) : false,
  mine: viewerId ? String(r.user) === viewerId : false,
  visible: r.visible,
});

// The product's star rating always comes from the real, visible reviews.
export async function recomputeRating(productId: Types.ObjectId | string) {
  const [agg] = await Review.aggregate<{ avg: number; n: number }>([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), visible: true } },
    { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId },
    { ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.n ?? 0 },
  );
}

// Only people who received the product can review it.
const hasReceived = (userId: string, productId: string) =>
  Order.exists({
    user: userId,
    shipments: { $elemMatch: { status: ShipmentStatus.DELIVERED, "items.product": productId } },
  });

async function activeProduct(slug: string) {
  const p = await Product.findOne({
    slug,
    status: { $in: [ProductStatus.ACTIVE, ProductStatus.SUSPENDED] },
  }).select("title seller slug");
  if (!p) throw AppError.notFound("We couldn't find that product.");
  return p;
}

// Reads the signed-in user if there is one, without failing for guests.
async function optionalUserId(req: { header: (n: string) => string | undefined }) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  try {
    const { verifyAccessToken } = await import("../../lib/tokens");
    return (await verifyAccessToken(header.slice(7))).userId;
  } catch {
    return undefined;
  }
}

export const reviewRouter = Router();

reviewRouter.get("/products/:slug/reviews", validateQuery(reviewQuerySchema), async (req, res) => {
  const product = await activeProduct(String(req.params.slug));
  const viewerId = await optionalUserId(req);
  const { sort, page } = parsedQuery(res, reviewQuerySchema);
  const limit = 8;

  const sorts = {
    newest: { createdAt: -1 },
    helpful: { helpfulCount: -1, createdAt: -1 },
    highest: { rating: -1, createdAt: -1 },
    lowest: { rating: 1, createdAt: -1 },
  } as const;

  const filter = { product: product._id, visible: true };
  const [rows, total, dist] = await Promise.all([
    Review.aggregate<ReviewShape & { _id: Types.ObjectId }>([
      { $match: filter },
      { $addFields: { helpfulCount: { $size: "$helpfulBy" } } },
      { $sort: sorts[sort] },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    Review.countDocuments(filter),
    Review.aggregate<{ _id: number; n: number }>([
      { $match: filter },
      { $group: { _id: "$rating", n: { $sum: 1 } } },
    ]),
  ]);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewSummary["distribution"];
  let sum = 0;
  for (const d of dist) {
    distribution[d._id as 1 | 2 | 3 | 4 | 5] = d.n;
    sum += d._id * d.n;
  }
  const summary: ReviewSummary = {
    average: total ? Math.round((sum / total) * 10) / 10 : 0,
    count: total,
    distribution,
  };

  res.json({
    items: rows.map((r) => toDTO(r, viewerId)),
    summary,
    page,
    pages: Math.ceil(total / limit),
  });
});

reviewRouter.get("/products/:slug/review-eligibility", authenticate, async (req, res) => {
  const product = await activeProduct(String(req.params.slug));
  const mine = await Review.findOne({ product: product._id, user: req.user!.id });
  const body: ReviewEligibility = {
    eligible: Boolean(await hasReceived(req.user!.id, String(product._id))),
    alreadyReviewed: Boolean(mine),
    myReview: mine ? toDTO(mine, req.user!.id) : undefined,
  };
  res.json(body);
});

reviewRouter.post(
  "/products/:slug/reviews",
  authenticate,
  validate(reviewSchema),
  async (req, res) => {
    const product = await activeProduct(String(req.params.slug));
    const userId = req.user!.id;

    if (!(await hasReceived(userId, String(product._id)))) {
      throw new AppError(
        HttpStatus.FORBIDDEN,
        ErrorCode.REVIEW_NOT_ELIGIBLE,
        "You can review a product once it has been delivered to you.",
      );
    }
    const user = await User.findById(userId).select("name");

    try {
      const review = await Review.create({
        ...req.body,
        product: product._id,
        user: userId,
        authorName: user?.name ?? "Customer",
      });
      await recomputeRating(product._id);
      await notify(product.seller, {
        type: "review.new",
        title: `New ${req.body.rating}-star review`,
        body: `Someone reviewed ${product.title}.`,
        link: `/product/${product.slug}`,
      });
      res.status(HttpStatus.CREATED).json({ review: toDTO(review, userId) });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw AppError.conflict(
          ErrorCode.REVIEW_ALREADY_EXISTS,
          "You've already reviewed this product. You can edit your review instead.",
        );
      }
      throw err;
    }
  },
);

reviewRouter.patch("/reviews/:id", authenticate, validate(reviewSchema), async (req, res) => {
  const review = await ownReview(req.user!.id, String(req.params.id));
  review.set(req.body);
  await review.save();
  await recomputeRating(review.product);
  res.json({ review: toDTO(review, req.user!.id) });
});

reviewRouter.delete("/reviews/:id", authenticate, async (req, res) => {
  const review = await ownReview(req.user!.id, String(req.params.id));
  await review.deleteOne();
  await recomputeRating(review.product);
  res.status(HttpStatus.NO_CONTENT).end();
});

// "Was this helpful?" - tapping again takes the vote back
reviewRouter.post("/reviews/:id/helpful", authenticate, async (req, res) => {
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) throw AppError.notFound();
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const review = await Review.findOne({ _id: id, visible: true });
  if (!review) throw AppError.notFound("We couldn't find that review.");
  if (String(review.user) === req.user!.id)
    throw AppError.badRequest("You can't vote on your own review.");

  const voted = review.helpfulBy.some((u) => u.equals(userId));
  await Review.updateOne(
    { _id: id },
    voted ? { $pull: { helpfulBy: userId } } : { $addToSet: { helpfulBy: userId } },
  );
  res.json({ helpful: !voted, count: review.helpfulBy.length + (voted ? -1 : 1) });
});

async function ownReview(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) throw AppError.notFound();
  const r = await Review.findOne({ _id: id, user: userId });
  if (!r) throw AppError.notFound("We couldn't find that review.");
  return r;
}
