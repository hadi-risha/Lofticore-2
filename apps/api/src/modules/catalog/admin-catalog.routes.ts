import { Router } from "express";
import { z } from "zod";
import {
  HttpStatus,
  ProductStatus,
  Role,
  categoryInputSchema,
  reviewDecisionSchema,
} from "@lofticore/shared";
import { authenticate, authorize } from "../../middleware/authenticate";
import { requireStaff2fa } from "../../middleware/require-staff-2fa";
import { parsedQuery, validate, validateQuery } from "../../middleware/validate";
import { createCategory, updateCategory } from "./category.service";
import * as products from "./product.service";

export const adminCatalogRouter = Router();

adminCatalogRouter.use(authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), requireStaff2fa);

const reviewQuery = z.object({
  status: z.nativeEnum(ProductStatus).default(ProductStatus.PENDING_REVIEW),
  page: z.coerce.number().int().min(1).default(1),
});

adminCatalogRouter.get("/products", validateQuery(reviewQuery), async (_req, res) => {
  const { status, page } = parsedQuery(res, reviewQuery);
  res.json(await products.listForReview(status, page));
});

adminCatalogRouter.post(
  "/products/:id/review",
  validate(reviewDecisionSchema),
  async (req, res) => {
    const product = await products.reviewProduct(
      req.user!.id,
      String(req.params.id),
      req.body.decision,
      req.body.note,
      String(req.id),
    );
    res.json({ product });
  },
);

adminCatalogRouter.post("/categories", validate(categoryInputSchema), async (req, res) => {
  res.status(HttpStatus.CREATED).json({ category: await createCategory(req.body) });
});

adminCatalogRouter.patch(
  "/categories/:id",
  validate(categoryInputSchema.partial()),
  async (req, res) => {
    res.json({ category: await updateCategory(String(req.params.id), req.body) });
  },
);
