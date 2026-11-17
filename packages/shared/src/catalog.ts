import { z } from "zod";

// All money in the system is an integer number of paise (1 INR = 100 paise).
// Floats and money don't mix; format only at the very edge, in the UI.
export const toRupees = (paise: number) => paise / 100;
export const formatINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export const ProductStatus = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  ACTIVE: "active",
  REJECTED: "rejected",
  ARCHIVED: "archived",
  // hidden because the seller is blocked; comes back when they are unblocked
  SUSPENDED: "suspended",
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const StockReason = {
  RESTOCK: "restock",
  ADJUSTMENT: "adjustment",
  DAMAGED: "damaged",
  RESERVE: "reserve",
  RELEASE: "release",
  SALE: "sale",
  RETURN: "return",
} as const;
export type StockReason = (typeof StockReason)[keyof typeof StockReason];

export const ProductSort = {
  RELEVANCE: "relevance",
  NEWEST: "newest",
  PRICE_ASC: "price_asc",
  PRICE_DESC: "price_desc",
  RATING: "rating",
  POPULAR: "popular",
} as const;
export type ProductSort = (typeof ProductSort)[keyof typeof ProductSort];

/* ------------------------------------------------------------------ input */

const httpsUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//.test(u) || u.startsWith("/"), "Use an http(s) URL.");
// seed images are served by the API itself, so allow site-relative paths too
const assetUrl = z.union([httpsUrl, z.string().regex(/^\/static\/[\w./-]+$/)]);

export const variantInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,40}$/, "SKU: letters, numbers and dashes, 3-40 characters."),
    color: z.string().trim().max(40).optional(),
    material: z.string().trim().max(60).optional(),
    size: z.string().trim().max(40).optional(),
    price: z.number().int().positive(),
    mrp: z.number().int().positive(),
    stock: z.number().int().min(0).max(100_000),
    lowStockThreshold: z.number().int().min(0).default(5),
  })
  .refine((v) => v.mrp >= v.price, {
    message: "MRP can't be lower than the selling price.",
    path: ["mrp"],
  });

export const dimensionsSchema = z.object({
  widthCm: z.number().positive().max(1000),
  depthCm: z.number().positive().max(1000),
  heightCm: z.number().positive().max(1000),
  weightKg: z.number().positive().max(2000).optional(),
});

export const productInputSchema = z.object({
  title: z.string().trim().min(3, "Give the product a title.").max(120),
  description: z.string().trim().min(20, "Describe the product in a sentence or two.").max(4000),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i, "Pick a category."),
  brand: z.string().trim().max(60).optional(),
  material: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(2).max(30)).max(12).default([]),
  images: z
    .array(z.object({ url: assetUrl, alt: z.string().trim().max(150).optional() }))
    .min(1)
    .max(8),
  model3d: z.object({ glbUrl: assetUrl.optional(), usdzUrl: assetUrl.optional() }).optional(),
  dimensions: dimensionsSchema,
  variants: z.array(variantInputSchema).min(1).max(20),
});

export const productUpdateSchema = productInputSchema
  .omit({ variants: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export const stockAdjustSchema = z.object({
  sku: z.string().trim().toUpperCase(),
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, "Delta can't be zero."),
  reason: z.enum([StockReason.RESTOCK, StockReason.ADJUSTMENT, StockReason.DAMAGED]),
  note: z.string().trim().max(200).optional(),
});

export const variantPriceSchema = z.object({
  price: z.number().int().positive(),
  mrp: z.number().int().positive(),
});

export const sellerProductQuerySchema = z.object({
  status: z.enum(Object.values(ProductStatus) as [ProductStatus, ...ProductStatus[]]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  parentId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .nullable()
    .optional(),
  image: assetUrl.optional(),
  order: z.number().int().min(0).default(0),
});

const csv = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .optional();

export const productQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().toLowerCase().optional(), // slug, includes sub-categories
  minPrice: z.coerce.number().int().min(0).optional(), // paise
  maxPrice: z.coerce.number().int().min(0).optional(),
  material: csv,
  color: csv,
  inStock: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  rating: z.coerce.number().min(1).max(5).optional(), // minimum average
  sort: z
    .enum(Object.values(ProductSort) as [ProductSort, ...ProductSort[]])
    .default(ProductSort.RELEVANCE),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;

/* ----------------------------------------------------------------- output */

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  image?: string;
  children: CategoryNode[];
}

export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  image: string;
  price: number; // lowest variant price, paise
  mrp: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
  categorySlug: string;
  has3d: boolean;
}

export interface VariantView {
  sku: string;
  color?: string;
  material?: string;
  size?: string;
  price: number;
  mrp: number;
  // how many can be bought right now; the raw stock numbers stay private
  available: number;
  lowStock: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  brand?: string;
  material?: string;
  tags: string[];
  images: { url: string; alt?: string }[];
  model3d?: { glbUrl?: string; usdzUrl?: string };
  dimensions: { widthCm: number; depthCm: number; heightCm: number; weightKg?: number };
  variants: VariantView[];
  seller: { id: string; name: string };
  category: { id: string; name: string; slug: string };
  soldCount: number;
}

export interface Facets {
  price: { min: number; max: number };
  materials: { value: string; count: number }[];
  colors: { value: string; count: number }[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ProductListResponse extends Page<ProductSummary> {
  facets: Facets;
}

export interface Suggestion {
  type: "product" | "category";
  label: string;
  slug: string;
}
