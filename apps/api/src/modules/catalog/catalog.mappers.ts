import type { Types } from "mongoose";
import type { ProductDetail, ProductSummary, VariantView } from "@lofticore/shared";
import type { ProductShape, VariantShape } from "./product.model";

// What a shopper may see of stock: enough to say "only 3 left", not the real
// inventory level.
const STOCK_DISPLAY_CAP = 10;

const cheapest = (variants: VariantShape[]) =>
  variants.reduce((best, v) => (v.price < best.price ? v : best), variants[0]!);

type Lean<T> = T & { _id: Types.ObjectId };
type WithCategory = Lean<ProductShape> & {
  category: { _id: Types.ObjectId; name: string; slug: string };
};
type WithSeller = { seller: { _id: Types.ObjectId; name: string } };

export function toSummary(p: WithCategory): ProductSummary {
  const best = cheapest(p.variants);
  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    image: p.images[0]?.url ?? "",
    price: best.price,
    mrp: best.mrp,
    discountPct: best.mrp > best.price ? Math.round(((best.mrp - best.price) / best.mrp) * 100) : 0,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    inStock: p.inStock,
    categorySlug: p.category.slug,
    has3d: Boolean(p.model3d?.glbUrl),
  };
}

const toVariantView = (v: VariantShape): VariantView => ({
  sku: v.sku,
  color: v.color,
  material: v.material,
  size: v.size,
  price: v.price,
  mrp: v.mrp,
  available: Math.min(v.available, STOCK_DISPLAY_CAP),
  lowStock: v.available > 0 && v.available <= v.lowStockThreshold,
});

export function toDetail(p: WithCategory & Omit<WithSeller, "seller"> & WithSeller): ProductDetail {
  return {
    ...toSummary(p),
    description: p.description,
    brand: p.brand,
    material: p.material,
    tags: p.tags,
    images: p.images,
    model3d: p.model3d,
    dimensions: p.dimensions,
    variants: p.variants.map(toVariantView),
    seller: { id: String(p.seller._id), name: p.seller.name },
    category: { id: String(p.category._id), name: p.category.name, slug: p.category.slug },
    soldCount: p.soldCount,
  };
}
