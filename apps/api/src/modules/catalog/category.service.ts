import type { Types } from "mongoose";
import { ErrorCode, type CategoryNode, categoryInputSchema } from "@lofticore/shared";
import type { z } from "zod";
import { AppError } from "../../lib/app-error";
import { slugify, withSuffix } from "../../lib/slug";
import { Category } from "./category.model";

type CategoryInput = z.infer<typeof categoryInputSchema>;

// The category list is tiny and read on every page, so keep it in memory for a
// short while instead of hitting the database each time.
let cache: { at: number; tree: CategoryNode[]; flat: FlatCategory[] } | null = null;
const TTL = 30_000;

interface FlatCategory {
  id: string;
  slug: string;
  parent: string | null;
}

async function load() {
  if (cache && Date.now() - cache.at < TTL) return cache;

  const rows = await Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
  const nodes = new Map<string, CategoryNode>();
  for (const r of rows) {
    nodes.set(String(r._id), {
      id: String(r._id),
      name: r.name,
      slug: r.slug,
      image: r.image,
      children: [],
    });
  }
  const tree: CategoryNode[] = [];
  for (const r of rows) {
    const node = nodes.get(String(r._id))!;
    const parent = r.parent ? nodes.get(String(r.parent)) : undefined;
    (parent ? parent.children : tree).push(node);
  }
  const flat = rows.map((r) => ({
    id: String(r._id),
    slug: r.slug,
    parent: r.parent ? String(r.parent) : null,
  }));

  cache = { at: Date.now(), tree, flat };
  return cache;
}

export const clearCategoryCache = () => {
  cache = null;
};

export async function categoryTree() {
  return (await load()).tree;
}

// The category plus everything under it, so "Furniture" also shows sofas and tables.
export async function categoryIdsWithDescendants(slug: string): Promise<string[]> {
  const { flat } = await load();
  const root = flat.find((c) => c.slug === slug);
  if (!root) return [];

  const ids = [root.id];
  for (let i = 0; i < ids.length; i++) {
    for (const c of flat) if (c.parent === ids[i]) ids.push(c.id);
  }
  return ids;
}

export async function createCategory(input: CategoryInput) {
  if (input.parentId && !(await Category.exists({ _id: input.parentId }))) {
    throw AppError.badRequest(
      "That parent category doesn't exist.",
      ErrorCode.CATALOG_CATEGORY_INVALID,
    );
  }

  let slug = slugify(input.name);
  if (await Category.exists({ slug })) slug = withSuffix(slug);

  const created = await Category.create({
    name: input.name,
    slug,
    parent: input.parentId ?? null,
    image: input.image,
    order: input.order,
  });
  clearCategoryCache();
  return created;
}

export async function updateCategory(id: string, input: Partial<CategoryInput>) {
  if (input.parentId && String(input.parentId) === id) {
    throw AppError.badRequest(
      "A category can't be its own parent.",
      ErrorCode.CATALOG_CATEGORY_INVALID,
    );
  }
  const update: Record<string, unknown> = { ...input };
  if ("parentId" in input) {
    update.parent = input.parentId ?? null;
    delete update.parentId;
  }
  const updated = await Category.findByIdAndUpdate(id, update, { new: true });
  if (!updated) throw AppError.notFound("That category doesn't exist.");
  clearCategoryCache();
  return updated;
}

export const categoryExists = (id: string | Types.ObjectId) =>
  Category.exists({ _id: id, isActive: true });
