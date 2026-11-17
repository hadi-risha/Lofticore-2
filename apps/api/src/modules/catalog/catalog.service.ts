import { searchIds } from "../../lib/search";
import { Types, type FilterQuery, type SortOrder } from "mongoose";
import {
  ProductSort,
  ProductStatus,
  type Facets,
  type ProductListResponse,
  type ProductQuery,
  type ProductSummary,
  type Suggestion,
} from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { Category } from "./category.model";
import { categoryIdsWithDescendants } from "./category.service";
import { toDetail, toSummary } from "./catalog.mappers";
import { Product, type ProductShape } from "./product.model";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactCI = (values: string[]) => values.map((v) => new RegExp(`^${escapeRegex(v)}$`, "i"));

const SUMMARY_FIELDS =
  "title slug images variants.price variants.mrp inStock ratingAvg ratingCount category model3d";

/* ------------------------------------------------------------------ filters */

// Filters that narrow what you can see. Material and colour are kept apart so the
// facet counts can ignore them (otherwise picking "oak" hides every other material).
async function baseFilter(q: ProductQuery): Promise<FilterQuery<ProductShape> | null> {
  const filter: FilterQuery<ProductShape> = { status: ProductStatus.ACTIVE };

  if (q.category) {
    const ids = await categoryIdsWithDescendants(q.category);
    if (ids.length === 0) return null; // unknown category: nothing matches
    // real ObjectIds, because the facet aggregation below doesn't cast strings
    // the way find() does
    filter.category = { $in: ids.map((id) => new Types.ObjectId(id)) };
  }
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.minPrice = {
      ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}),
      ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}),
    };
  }
  if (q.inStock) filter.inStock = true;
  if (q.rating) filter.ratingAvg = { $gte: q.rating };
  return filter;
}

function variantFilter(q: ProductQuery): FilterQuery<ProductShape>[] {
  const parts: FilterQuery<ProductShape>[] = [];
  if (q.material?.length) {
    const rx = exactCI(q.material);
    parts.push({ $or: [{ material: { $in: rx } }, { "variants.material": { $in: rx } }] });
  }
  if (q.color?.length) parts.push({ "variants.color": { $in: exactCI(q.color) } });
  return parts;
}

const SORTS: Record<Exclude<ProductSort, "relevance">, Record<string, SortOrder>> = {
  newest: { createdAt: -1 },
  price_asc: { minPrice: 1 },
  price_desc: { minPrice: -1 },
  rating: { ratingAvg: -1, ratingCount: -1 },
  popular: { soldCount: -1, ratingAvg: -1 },
};

/* ------------------------------------------------------------------ listing */

async function getFacets(base: FilterQuery<ProductShape>): Promise<Facets> {
  const count = (field: string) => [
    { $unwind: "$variants" },
    { $match: { [field]: { $nin: [null, ""] } } },
    // count each product once per value, however many variants share it
    { $group: { _id: { value: `$${field}`, product: "$_id" } } },
    { $group: { _id: "$_id.value", count: { $sum: 1 } } },
    { $sort: { count: -1 as const, _id: 1 as const } },
    { $limit: 20 },
  ];

  const [res] = await Product.aggregate([
    { $match: base },
    {
      $facet: {
        price: [{ $group: { _id: null, min: { $min: "$minPrice" }, max: { $max: "$minPrice" } } }],
        materials: count("variants.material"),
        colors: count("variants.color"),
      },
    },
  ]);

  return {
    price: { min: res?.price[0]?.min ?? 0, max: res?.price[0]?.max ?? 0 },
    materials: (res?.materials ?? []).map((m: { _id: string; count: number }) => ({
      value: m._id,
      count: m.count,
    })),
    colors: (res?.colors ?? []).map((m: { _id: string; count: number }) => ({
      value: m._id,
      count: m.count,
    })),
  };
}

export async function listProducts(q: ProductQuery): Promise<ProductListResponse> {
  const empty: ProductListResponse = {
    items: [],
    total: 0,
    page: q.page,
    pages: 0,
    limit: q.limit,
    facets: { price: { min: 0, max: 0 }, materials: [], colors: [] },
  };

  const base = await baseFilter(q);
  if (!base) return empty;

  const extra = variantFilter(q);
  const withFilters = (search: FilterQuery<ProductShape>): FilterQuery<ProductShape> => ({
    ...base,
    ...search,
    ...(extra.length ? { $and: extra } : {}),
  });

  // Search: use the text index first (stemming, weighting). It only matches whole
  // words, so if it finds nothing - say the shopper typed "sof" - fall back to a
  // prefix/substring match on title, tags and brand.
  let search: FilterQuery<ProductShape> = {};
  let useText = false;
  // Meilisearch (typo-tolerant, ranked) answers first when it is configured and up
  const ranked = q.q ? await searchIds(q.q) : null;
  if (ranked) {
    search = { _id: { $in: ranked } };
  } else if (q.q) {
    search = { $text: { $search: q.q } };
    useText = true;
    if ((await Product.countDocuments(withFilters(search))) === 0) {
      const rx = new RegExp(escapeRegex(q.q), "i");
      search = { $or: [{ title: rx }, { tags: rx }, { brand: rx }] };
      useText = false;
    }
  }

  const filter = withFilters(search);
  const byRank = Boolean(ranked) && q.sort === ProductSort.RELEVANCE;
  const sortBy = q.sort === ProductSort.RELEVANCE && !useText ? ProductSort.POPULAR : q.sort;

  if (byRank) {
    // Meilisearch decides the order, which Mongo can't express, so sort the matches here.
    // Matches are capped at a few hundred, so this stays small.
    const rank = new Map(ranked!.map((id, i) => [id, i]));
    const [docs, facets] = await Promise.all([
      Product.find(filter).select(SUMMARY_FIELDS).populate("category", "slug").lean(),
      getFacets({ ...base, ...search }),
    ]);
    docs.sort((a, b) => (rank.get(String(a._id)) ?? 0) - (rank.get(String(b._id)) ?? 0));
    const start = (q.page - 1) * q.limit;
    return {
      items: docs.slice(start, start + q.limit).map((d) => toSummary(d as never)),
      total: docs.length,
      page: q.page,
      pages: Math.ceil(docs.length / q.limit),
      limit: q.limit,
      facets,
    };
  }

  let query = Product.find(filter, useText ? { score: { $meta: "textScore" } } : undefined);
  query =
    sortBy === ProductSort.RELEVANCE
      ? query.sort({ score: { $meta: "textScore" } })
      : query.sort({ ...SORTS[sortBy as keyof typeof SORTS], _id: 1 });

  const [docs, total, facets] = await Promise.all([
    query
      .select(SUMMARY_FIELDS)
      .populate("category", "slug")
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Product.countDocuments(filter),
    getFacets({ ...base, ...search }),
  ]);

  return {
    items: docs.map((d) => toSummary(d as never)),
    total,
    page: q.page,
    pages: Math.ceil(total / q.limit),
    limit: q.limit,
    facets,
  };
}

/* ------------------------------------------------------------------ detail */

export async function getProductBySlug(slug: string) {
  const p = await Product.findOne({ slug, status: ProductStatus.ACTIVE })
    .populate("category", "name slug")
    .populate("seller", "name")
    .lean();
  if (!p) throw AppError.notFound("We couldn't find that product.");

  // fire and forget - a view counter must never slow down or fail the page
  void Product.updateOne({ _id: p._id }, { $inc: { viewCount: 1 } }).exec();
  return toDetail(p as never);
}

/* ------------------------------------------------------- discovery helpers */

export async function suggest(text: string): Promise<Suggestion[]> {
  const rx = new RegExp(`\\b${escapeRegex(text)}`, "i");
  const ranked = await searchIds(text, 6);
  const [products, categories] = await Promise.all([
    Product.find(
      ranked
        ? { _id: { $in: ranked }, status: ProductStatus.ACTIVE }
        : { status: ProductStatus.ACTIVE, $or: [{ title: rx }, { tags: rx }] },
    )
      .sort({ soldCount: -1 })
      .limit(6)
      .select("title slug")
      .lean(),
    Category.find({ isActive: true, name: rx }).limit(3).select("name slug").lean(),
  ]);

  return [
    ...categories.map((c): Suggestion => ({ type: "category", label: c.name, slug: c.slug })),
    ...products.map((p): Suggestion => ({ type: "product", label: p.title, slug: p.slug })),
  ];
}

export async function bestSellers(limit = 12): Promise<ProductSummary[]> {
  const docs = await Product.find({ status: ProductStatus.ACTIVE, inStock: true })
    .sort({ trendScore: -1, soldCount: -1, ratingAvg: -1, _id: 1 })
    .limit(limit)
    .select(SUMMARY_FIELDS)
    .populate("category", "slug")
    .lean();
  return docs.map((d) => toSummary(d as never));
}

export async function newArrivals(limit = 12): Promise<ProductSummary[]> {
  const docs = await Product.find({ status: ProductStatus.ACTIVE })
    .sort({ createdAt: -1, _id: 1 })
    .limit(limit)
    .select(SUMMARY_FIELDS)
    .populate("category", "slug")
    .lean();
  return docs.map((d) => toSummary(d as never));
}

// Same category first, ranked by how many tags they share. Order/cart-based
// recommendations come later and will sit on top of this.
export async function relatedProducts(slug: string, limit = 8): Promise<ProductSummary[]> {
  const source = await Product.findOne({ slug, status: ProductStatus.ACTIVE }).select(
    "category tags",
  );
  if (!source) throw AppError.notFound("We couldn't find that product.");

  const ranked = await Product.aggregate([
    {
      $match: { status: ProductStatus.ACTIVE, _id: { $ne: source._id }, category: source.category },
    },
    { $addFields: { overlap: { $size: { $setIntersection: ["$tags", source.tags] } } } },
    { $sort: { overlap: -1, soldCount: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);

  const ids = ranked.map((r) => r._id);
  const docs = await Product.find({ _id: { $in: ids } })
    .select(SUMMARY_FIELDS)
    .populate("category", "slug")
    .lean();
  const order = new Map(ids.map((id, i) => [String(id), i]));
  docs.sort((a, b) => order.get(String(a._id))! - order.get(String(b._id))!);
  return docs.map((d) => toSummary(d as never));
}
