import mongoose from "mongoose";
import {
  ErrorCode,
  HttpStatus,
  ProductStatus,
  StockReason,
  type ProductInput,
  productUpdateSchema,
} from "@lofticore/shared";
import type { z } from "zod";
import { AppError } from "../../lib/app-error";
import { slugify, withSuffix } from "../../lib/slug";
import { audit } from "../audit/audit.model";
import { StockMovement } from "../inventory/inventory.model";
import { syncDerivedFields } from "../inventory/inventory.service";
import { categoryExists } from "./category.service";
import { Product } from "./product.model";

type ProductUpdate = z.infer<typeof productUpdateSchema>;

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

async function assertCategory(id: string) {
  if (!(await categoryExists(id))) {
    throw AppError.badRequest("Pick a valid category.", ErrorCode.CATALOG_CATEGORY_INVALID);
  }
}

async function uniqueSlug(title: string) {
  const base = slugify(title) || "product";
  return (await Product.exists({ slug: base })) ? withSuffix(base) : base;
}

// Owner check built into the query: a seller asking for someone else's product
// gets the same 404 as for one that doesn't exist.
async function ownedProduct(sellerId: string, productId: string) {
  if (!mongoose.isValidObjectId(productId)) throw AppError.notFound();
  const p = await Product.findOne({ _id: productId, seller: sellerId });
  if (!p) throw AppError.notFound("We couldn't find that product.");
  return p;
}

export async function createProduct(sellerId: string, input: ProductInput) {
  await assertCategory(input.categoryId);

  const { variants, categoryId, ...rest } = input;
  const prices = variants.map((v) => v.price);

  try {
    const product = await Product.create({
      ...rest,
      seller: sellerId,
      category: categoryId,
      slug: await uniqueSlug(input.title),
      status: ProductStatus.DRAFT,
      variants: variants.map(({ stock, ...v }) => ({ ...v, available: stock, reserved: 0 })),
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      maxMrp: Math.max(...variants.map((v) => v.mrp)),
      inStock: variants.some((v) => v.stock > 0),
    });

    const opening = variants.filter((v) => v.stock > 0);
    if (opening.length) {
      await StockMovement.insertMany(
        opening.map((v) => ({
          product: product._id,
          sku: v.sku,
          delta: v.stock,
          reason: StockReason.RESTOCK,
          actor: new mongoose.Types.ObjectId(sellerId),
          note: "opening stock",
        })),
      );
    }
    return product;
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw AppError.conflict(
        ErrorCode.CATALOG_SKU_TAKEN,
        "One of those SKUs is already used by another product.",
      );
    }
    throw err;
  }
}

export async function updateProduct(sellerId: string, productId: string, input: ProductUpdate) {
  const product = await ownedProduct(sellerId, productId);
  if (product.status === ProductStatus.ARCHIVED)
    throw AppError.badRequest("Archived products can't be edited.");
  if (input.categoryId) await assertCategory(input.categoryId);

  const { categoryId, ...rest } = input;
  product.set({ ...rest, ...(categoryId ? { category: categoryId } : {}) });
  await product.save();
  return product;
}

export async function updateVariantPrice(
  sellerId: string,
  productId: string,
  sku: string,
  price: number,
  mrp: number,
) {
  if (mrp < price) throw AppError.badRequest("MRP can't be lower than the selling price.");
  await ownedProduct(sellerId, productId);

  const res = await Product.updateOne(
    { _id: productId, "variants.sku": sku },
    { $set: { "variants.$.price": price, "variants.$.mrp": mrp } },
  );
  if (res.matchedCount === 0) throw AppError.notFound("That SKU doesn't exist on this product.");
  await syncDerivedFields(productId);
}

export async function submitForReview(sellerId: string, productId: string) {
  const product = await ownedProduct(sellerId, productId);
  if (product.status !== ProductStatus.DRAFT && product.status !== ProductStatus.REJECTED) {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.VALIDATION_FAILED,
      "This product is already submitted or live.",
    );
  }
  product.status = ProductStatus.PENDING_REVIEW;
  product.reviewNote = undefined;
  await product.save();
  return product;
}

export async function archiveProduct(sellerId: string, productId: string) {
  const product = await ownedProduct(sellerId, productId);
  product.status = ProductStatus.ARCHIVED;
  await product.save();
}

export async function listSellerProducts(
  sellerId: string,
  status: ProductStatus | undefined,
  page: number,
  limit = 20,
) {
  const filter = { seller: sellerId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category", "name slug")
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit), limit };
}

// A seller sees real stock numbers for their own product.
export async function getSellerProduct(sellerId: string, productId: string) {
  await ownedProduct(sellerId, productId);
  return Product.findById(productId).populate("category", "name slug").lean();
}

/* ----------------------------------------------------------------- admin */

export async function listForReview(status: ProductStatus, page: number, limit = 20) {
  const [items, total] = await Promise.all([
    Product.find({ status })
      .sort({ updatedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category", "name slug")
      .populate("seller", "name email")
      .lean(),
    Product.countDocuments({ status }),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit), limit };
}

export async function reviewProduct(
  adminId: string,
  productId: string,
  decision: "approve" | "reject",
  note: string | undefined,
  requestId?: string,
) {
  if (!mongoose.isValidObjectId(productId)) throw AppError.notFound();
  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound("We couldn't find that product.");
  if (product.status !== ProductStatus.PENDING_REVIEW) {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.VALIDATION_FAILED,
      "This product isn't waiting for review.",
    );
  }

  product.status = decision === "approve" ? ProductStatus.ACTIVE : ProductStatus.REJECTED;
  product.reviewNote = note;
  await product.save();

  await audit({
    action: `catalog.product_${decision}d`,
    actorId: adminId,
    targetId: productId,
    requestId,
    meta: { note },
  });
  return product;
}
