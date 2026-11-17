import { Router } from "express";
import mongoose, { Schema, model, type Types } from "mongoose";
import { HttpStatus, ProductStatus, type ProductSummary } from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { authenticate } from "../../middleware/authenticate";
import { toSummary } from "../catalog/catalog.mappers";
import { Product } from "../catalog/product.model";

interface WishlistShape {
  user: Types.ObjectId;
  product: Types.ObjectId;
  addedAt: Date;
}

const wishlistSchema = new Schema<WishlistShape>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  addedAt: { type: Date, default: Date.now },
});
// one row per (user, product): adding twice is harmless
wishlistSchema.index({ user: 1, product: 1 }, { unique: true });

export const Wishlist = model<WishlistShape>("Wishlist", wishlistSchema);

export const wishlistRouter = Router();
wishlistRouter.use(authenticate);

wishlistRouter.get("/", async (req, res) => {
  const rows = await Wishlist.find({ user: req.user!.id }).sort({ addedAt: -1 }).lean();
  const products = await Product.find({
    _id: { $in: rows.map((r) => r.product) },
    status: ProductStatus.ACTIVE,
  })
    .select(
      "title slug images variants.price variants.mrp inStock ratingAvg ratingCount category model3d",
    )
    .populate("category", "slug")
    .lean();

  const byId = new Map(products.map((p) => [String(p._id), p]));
  const items: ProductSummary[] = rows
    .map((r) => byId.get(String(r.product)))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => toSummary(p as never));
  res.json({ items });
});

// just the ids, so product cards can show a filled heart without loading everything
wishlistRouter.get("/ids", async (req, res) => {
  const rows = await Wishlist.find({ user: req.user!.id }).select("product").lean();
  res.json({ ids: rows.map((r) => String(r.product)) });
});

wishlistRouter.put("/:productId", async (req, res) => {
  const id = String(req.params.productId);
  if (
    !mongoose.isValidObjectId(id) ||
    !(await Product.exists({ _id: id, status: ProductStatus.ACTIVE }))
  ) {
    throw AppError.notFound("We couldn't find that product.");
  }
  await Wishlist.updateOne(
    { user: req.user!.id, product: id },
    { $setOnInsert: { addedAt: new Date() } },
    { upsert: true },
  );
  res.status(HttpStatus.NO_CONTENT).end();
});

wishlistRouter.delete("/:productId", async (req, res) => {
  await Wishlist.deleteOne({ user: req.user!.id, product: String(req.params.productId) });
  res.status(HttpStatus.NO_CONTENT).end();
});
