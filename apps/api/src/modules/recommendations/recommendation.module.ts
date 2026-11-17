import { Router } from "express";
import mongoose, { type Types } from "mongoose";
import { z } from "zod";
import { OrderStatus, ProductStatus, type ProductSummary } from "@lofticore/shared";
import { parsedQuery, validateQuery } from "../../middleware/validate";
import { toSummary } from "../catalog/catalog.mappers";
import { Product } from "../catalog/product.model";
import { Order } from "../orders/order.model";
import { Wishlist } from "../wishlist/wishlist.module";

// Suggestions without any machine-learning service: what people actually buy
// together, and what's similar to what you've looked at, wished for or bought.

const SUMMARY_FIELDS =
  "title slug images variants.price variants.mrp inStock ratingAvg ratingCount category model3d";
const oid = (id: string | Types.ObjectId) => new mongoose.Types.ObjectId(String(id));
const validIds = (csv?: string) =>
  (csv ?? "")
    .split(",")
    .filter((id) => mongoose.isValidObjectId(id))
    .slice(0, 20);

async function summaries(ids: (string | Types.ObjectId)[]): Promise<ProductSummary[]> {
  if (ids.length === 0) return [];
  const docs = await Product.find({
    _id: { $in: ids },
    status: ProductStatus.ACTIVE,
    inStock: true,
  })
    .select(SUMMARY_FIELDS)
    .populate("category", "slug")
    .lean();
  const order = new Map(ids.map((id, i) => [String(id), i]));
  docs.sort((a, b) => order.get(String(a._id))! - order.get(String(b._id))!);
  return docs.map((d) => toSummary(d as never));
}

// Products that show up in the same orders as these ones, most often first.
export async function boughtTogether(seedIds: string[], limit: number): Promise<string[]> {
  if (seedIds.length === 0) return [];
  const seeds = seedIds.map(oid);
  const rows = await Order.aggregate<{ _id: Types.ObjectId; n: number }>([
    {
      $match: {
        status: { $nin: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] },
        "shipments.items.product": { $in: seeds },
      },
    },
    { $unwind: "$shipments" },
    { $unwind: "$shipments.items" },
    { $group: { _id: "$_id", products: { $addToSet: "$shipments.items.product" } } },
    { $match: { products: { $in: seeds } } },
    { $unwind: "$products" },
    { $match: { products: { $nin: seeds } } },
    { $group: { _id: "$products", n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
    { $limit: limit * 2 },
  ]);
  return rows.map((r) => String(r._id));
}

// Similar to the seeds: same categories first, then shared tags.
async function similarTo(seedIds: string[], exclude: string[], limit: number): Promise<string[]> {
  if (seedIds.length === 0) return [];
  const seeds = await Product.find({ _id: { $in: seedIds } })
    .select("category tags")
    .lean();
  const categories = [...new Set(seeds.map((s) => String(s.category)))].map(oid);
  const tags = [...new Set(seeds.flatMap((s) => s.tags))];

  const ranked = await Product.aggregate<{ _id: Types.ObjectId }>([
    {
      $match: {
        status: ProductStatus.ACTIVE,
        inStock: true,
        _id: { $nin: exclude.map(oid) },
        $or: [{ category: { $in: categories } }, { tags: { $in: tags } }],
      },
    },
    {
      $addFields: {
        score: {
          $add: [
            { $cond: [{ $in: ["$category", categories] }, 3, 0] },
            { $multiply: [{ $size: { $setIntersection: ["$tags", tags] } }, 2] },
            { $divide: ["$ratingAvg", 5] },
          ],
        },
      },
    },
    { $sort: { score: -1, soldCount: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);
  return ranked.map((r) => String(r._id));
}

async function trending(limit: number, exclude: string[] = []) {
  const docs = await Product.find({
    status: ProductStatus.ACTIVE,
    inStock: true,
    _id: { $nin: exclude },
  })
    .sort({ trendScore: -1, soldCount: -1, _id: 1 })
    .limit(limit)
    .select("_id")
    .lean();
  return docs.map((d) => String(d._id));
}

/* -------------------------------------------------------------- trending job */

// Rank = recent demand, lifted by good ratings. Run on a timer: cheap enough to run
// often, and it keeps the home page's best sellers fresh without a query per visit.
export async function refreshTrending(days = 30) {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const sold = await Order.aggregate<{ _id: Types.ObjectId; units: number }>([
    {
      $match: {
        createdAt: { $gte: since },
        status: { $nin: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] },
      },
    },
    { $unwind: "$shipments" },
    { $match: { "shipments.status": { $ne: "cancelled" } } },
    { $unwind: "$shipments.items" },
    { $group: { _id: "$shipments.items.product", units: { $sum: "$shipments.items.qty" } } },
  ]);
  const units = new Map(sold.map((s) => [String(s._id), s.units]));

  // a gentle Bayesian rating, so one 5-star review doesn't outrank a hundred 4.6s
  const PRIOR = 4,
    WEIGHT = 5;
  const products = await Product.find({ status: ProductStatus.ACTIVE })
    .select("ratingAvg ratingCount soldCount")
    .lean();
  await Product.bulkWrite(
    products.map((p) => {
      const bayes = (WEIGHT * PRIOR + p.ratingAvg * p.ratingCount) / (WEIGHT + p.ratingCount);
      const recent = units.get(String(p._id)) ?? 0;
      // lifetime sales are only a tie-breaker, so what is selling now ranks first
      const score = recent * 10 + p.soldCount * 0.1 + bayes * 5;
      return {
        updateOne: {
          filter: { _id: p._id },
          update: { trendScore: Math.round(score * 100) / 100 },
        },
      };
    }),
  );
  return products.length;
}

/* ------------------------------------------------------------------- routes */

export const recommendationRouter = Router();

const query = z.object({
  ids: z.string().optional(),
  viewed: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

// Product page and cart: "customers also bought"
recommendationRouter.get("/bought-together", validateQuery(query), async (_req, res) => {
  const { ids, limit } = parsedQuery(res, query);
  const seeds = validIds(ids);
  const together = await boughtTogether(seeds, limit);
  // thin purchase history (a young shop) is topped up with similar products
  const filler =
    together.length < limit
      ? await similarTo(seeds, [...seeds, ...together], limit - together.length)
      : [];
  res.json({ items: await summaries([...together, ...filler].slice(0, limit)) });
});

// Home page: tailored when we know something about you, popular when we don't
recommendationRouter.get("/for-you", validateQuery(query), async (req, res) => {
  const { viewed, limit } = parsedQuery(res, query);

  let userId: string | undefined;
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      userId = (await (await import("../../lib/tokens")).verifyAccessToken(header.slice(7))).userId;
    } catch {
      /* a guest, or an expired token: fine */
    }
  }

  const seeds = new Set(validIds(viewed));
  const owned = new Set<string>();
  if (userId) {
    const [wished, orders] = await Promise.all([
      Wishlist.find({ user: userId }).select("product").limit(20).lean(),
      Order.find({ user: userId, status: { $ne: OrderStatus.CANCELLED } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("shipments.items.product")
        .lean(),
    ]);
    wished.forEach((w) => seeds.add(String(w.product)));
    for (const o of orders)
      for (const s of o.shipments)
        for (const i of s.items) {
          seeds.add(String(i.product));
          owned.add(String(i.product));
        }
  }

  const seedList = [...seeds];
  const personal = seedList.length ? await similarTo(seedList, [...seedList, ...owned], limit) : [];
  // fill any gap (and serve strangers) with what's popular
  const popular =
    personal.length < limit
      ? await trending(limit - personal.length, [...personal, ...seedList])
      : [];
  res.json({
    items: await summaries([...personal, ...popular]),
    personalised: personal.length > 0,
  });
});

// Recently viewed: the browser remembers the ids, we turn them into cards
recommendationRouter.get("/by-ids", validateQuery(query), async (_req, res) => {
  const { ids } = parsedQuery(res, query);
  res.json({ items: await summaries(validIds(ids)) });
});
