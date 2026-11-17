import { Router } from "express";
import { z } from "zod";
import { productQuerySchema } from "@lofticore/shared";
import { parsedQuery, validateQuery } from "../../middleware/validate";
import { categoryTree } from "./category.service";
import * as catalog from "./catalog.service";

// Public, read-only. Anyone can browse without an account.
export const catalogRouter = Router();

catalogRouter.get("/categories", async (_req, res) => {
  res.json({ categories: await categoryTree() });
});

catalogRouter.get("/products", validateQuery(productQuerySchema), async (_req, res) => {
  res.json(await catalog.listProducts(parsedQuery(res, productQuerySchema)));
});

const suggestSchema = z.object({ q: z.string().trim().min(2).max(60) });
catalogRouter.get("/products/suggest", validateQuery(suggestSchema), async (_req, res) => {
  const { q } = parsedQuery(res, suggestSchema);
  res.json({ suggestions: await catalog.suggest(q) });
});

const limitSchema = z.object({ limit: z.coerce.number().int().min(1).max(24).default(12) });
catalogRouter.get("/products/best-sellers", validateQuery(limitSchema), async (_req, res) => {
  res.json({ items: await catalog.bestSellers(parsedQuery(res, limitSchema).limit) });
});

catalogRouter.get("/products/new-arrivals", validateQuery(limitSchema), async (_req, res) => {
  res.json({ items: await catalog.newArrivals(parsedQuery(res, limitSchema).limit) });
});

catalogRouter.get("/products/:slug", async (req, res) => {
  res.json({ product: await catalog.getProductBySlug(String(req.params.slug)) });
});

catalogRouter.get("/products/:slug/related", async (req, res) => {
  res.json({ items: await catalog.relatedProducts(String(req.params.slug)) });
});
