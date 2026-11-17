import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { ProductStatus } from "@lofticore/shared";

// Stock is tracked with two counters per variant so it can be changed atomically
// without ever computing "stock - reserved" in application code:
//   available - can be bought right now
//   reserved  - held by checkouts in progress
// physically on hand = available + reserved
export interface VariantShape {
  sku: string;
  color?: string;
  material?: string;
  size?: string;
  price: number; // paise
  mrp: number;
  available: number;
  reserved: number;
  lowStockThreshold: number;
}

export interface ProductShape {
  seller: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  category: Types.ObjectId;
  brand?: string;
  material?: string;
  tags: string[];
  images: { url: string; alt?: string }[];
  model3d?: { glbUrl?: string; usdzUrl?: string };
  dimensions: { widthCm: number; depthCm: number; heightCm: number; weightKg?: number };
  variants: VariantShape[];

  status: ProductStatus;
  reviewNote?: string;

  // derived from variants, kept in sync by the inventory service, so list pages
  // can filter and sort without unwinding the variants array
  minPrice: number;
  maxPrice: number;
  maxMrp: number;
  inStock: boolean;

  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  viewCount: number;
  // ranking used for best sellers, refreshed by a background job
  trendScore: number;
  createdAt: Date;
}

const variantSchema = new Schema<VariantShape>(
  {
    sku: { type: String, required: true },
    color: String,
    material: String,
    size: String,
    price: { type: Number, required: true, min: 1 },
    mrp: { type: Number, required: true, min: 1 },
    available: { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
  },
  { _id: false },
);

const productSchema = new Schema<ProductShape>(
  {
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    brand: String,
    material: String,
    tags: { type: [String], default: [] },
    images: { type: [{ _id: false, url: String, alt: String }], default: [] },
    model3d: { _id: false, type: { glbUrl: String, usdzUrl: String } },
    dimensions: {
      widthCm: { type: Number, required: true },
      depthCm: { type: Number, required: true },
      heightCm: { type: Number, required: true },
      weightKg: Number,
    },
    variants: { type: [variantSchema], validate: (v: unknown[]) => v.length > 0 },

    status: {
      type: String,
      enum: Object.values(ProductStatus),
      default: ProductStatus.DRAFT,
      index: true,
    },
    reviewNote: String,

    minPrice: { type: Number, default: 0, index: true },
    maxPrice: { type: Number, default: 0 },
    maxMrp: { type: Number, default: 0 },
    inStock: { type: Boolean, default: false },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0, index: true },
    viewCount: { type: Number, default: 0 },
    trendScore: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

// A SKU is unique across the whole marketplace so orders and stock ledgers can
// refer to it unambiguously.
productSchema.index({ "variants.sku": 1 }, { unique: true });
productSchema.index(
  { title: "text", tags: "text", brand: "text", description: "text" },
  {
    weights: { title: 10, tags: 5, brand: 3, description: 1 },
    name: "product_text",
  },
);
productSchema.index({ status: 1, category: 1, createdAt: -1 });

export type ProductDoc = HydratedDocument<ProductShape>;
export const Product = model<ProductShape>("Product", productSchema);
