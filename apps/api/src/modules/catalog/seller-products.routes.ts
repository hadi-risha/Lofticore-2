import { Router } from "express";
import {
  HttpStatus,
  Role,
  productInputSchema,
  productUpdateSchema,
  sellerProductQuerySchema,
  stockAdjustSchema,
  variantPriceSchema,
} from "@lofticore/shared";
import { authenticate, authorize } from "../../middleware/authenticate";
import { requireApproved } from "../../middleware/require-approved";
import { parsedQuery, validate, validateQuery } from "../../middleware/validate";
import { adjustStock } from "../inventory/inventory.service";
import * as products from "./product.service";

// Everything here is the signed-in seller working on their own products.
export const sellerProductsRouter = Router();

sellerProductsRouter.use(authenticate, authorize(Role.SELLER), requireApproved);

sellerProductsRouter.get("/", validateQuery(sellerProductQuerySchema), async (req, res) => {
  const { status, page } = parsedQuery(res, sellerProductQuerySchema);
  res.json(await products.listSellerProducts(req.user!.id, status, page));
});

sellerProductsRouter.post("/", validate(productInputSchema), async (req, res) => {
  const product = await products.createProduct(req.user!.id, req.body);
  res.status(HttpStatus.CREATED).json({ product });
});

sellerProductsRouter.get("/:id", async (req, res) => {
  res.json({ product: await products.getSellerProduct(req.user!.id, String(req.params.id)) });
});

sellerProductsRouter.patch("/:id", validate(productUpdateSchema), async (req, res) => {
  res.json({
    product: await products.updateProduct(req.user!.id, String(req.params.id), req.body),
  });
});

sellerProductsRouter.patch("/:id/variants/:sku", validate(variantPriceSchema), async (req, res) => {
  await products.updateVariantPrice(
    req.user!.id,
    String(req.params.id),
    String(req.params.sku).toUpperCase(),
    req.body.price,
    req.body.mrp,
  );
  res.status(HttpStatus.NO_CONTENT).end();
});

sellerProductsRouter.post("/:id/stock", validate(stockAdjustSchema), async (req, res) => {
  await adjustStock({
    productId: String(req.params.id),
    sellerId: req.user!.id,
    actorId: req.user!.id,
    ...req.body,
  });
  res.status(HttpStatus.NO_CONTENT).end();
});

sellerProductsRouter.post("/:id/submit", async (req, res) => {
  res.json({ product: await products.submitForReview(req.user!.id, String(req.params.id)) });
});

sellerProductsRouter.delete("/:id", async (req, res) => {
  await products.archiveProduct(req.user!.id, String(req.params.id));
  res.status(HttpStatus.NO_CONTENT).end();
});
