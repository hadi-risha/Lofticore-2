import { Router } from "express";
import mongoose from "mongoose";
import {
  OrderStatus,
  ProductStatus,
  Role,
  ShipmentStatus,
  type SellerStats,
} from "@lofticore/shared";
import { authenticate, authorize } from "../../middleware/authenticate";
import { Order } from "../orders/order.model";
import { Product } from "./product.model";

export const sellerStatsRouter = Router();
sellerStatsRouter.use(authenticate, authorize(Role.SELLER));

// the numbers on the seller's dashboard
sellerStatsRouter.get("/", async (req, res) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  // orders still waiting for payment aren't the seller's business yet
  const placed = { status: { $ne: OrderStatus.PENDING_PAYMENT } };
  const mine = { "shipments.seller": sellerId };

  const [byStatus, lowStock, parcels, revenue] = await Promise.all([
    Product.aggregate<{ _id: string; n: number }>([
      { $match: { seller: sellerId } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Product.aggregate<{ productId: string; title: string; sku: string; available: number }>([
      { $match: { seller: sellerId, status: ProductStatus.ACTIVE } },
      { $unwind: "$variants" },
      { $match: { $expr: { $lte: ["$variants.available", "$variants.lowStockThreshold"] } } },
      { $sort: { "variants.available": 1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          productId: { $toString: "$_id" },
          title: 1,
          sku: "$variants.sku",
          available: "$variants.available",
        },
      },
    ]),
    Order.aggregate<{ _id: string; n: number }>([
      { $match: { ...mine, ...placed } },
      { $unwind: "$shipments" },
      { $match: mine },
      { $group: { _id: "$shipments.status", n: { $sum: 1 } } },
    ]),
    Order.aggregate<{ total: number }>([
      { $match: { ...mine, ...placed } },
      { $unwind: "$shipments" },
      { $match: { ...mine, "shipments.status": { $ne: ShipmentStatus.CANCELLED } } },
      { $unwind: "$shipments.items" },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ["$shipments.items.price", "$shipments.items.qty"] } },
        },
      },
    ]),
  ]);

  const stats: SellerStats = {
    products: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
    lowStock,
    orders: Object.fromEntries(parcels.map((r) => [r._id, r.n])),
    revenue: revenue[0]?.total ?? 0,
  };
  res.json(stats);
});
