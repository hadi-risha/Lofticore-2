import { Router } from "express";
import { z } from "zod";
import {
  HttpStatus,
  OrderStatus,
  ProductStatus,
  Role,
  AccountStatus,
  adminOrderQuerySchema,
  adminUserQuerySchema,
  userDecisionSchema,
  type AdminStats,
  type AuditEntryDTO,
} from "@lofticore/shared";
import { authenticate, authorize } from "../../middleware/authenticate";
import { requireStaff2fa } from "../../middleware/require-staff-2fa";
import { parsedQuery, validate, validateQuery } from "../../middleware/validate";
import { Audit } from "../audit/audit.model";
import { Product } from "../catalog/product.model";
import { Order } from "../orders/order.model";
import { listAllOrders } from "../orders/order.service";
import { Report } from "../reports/report.module";
import { User } from "../users/user.model";
import { decide, getUserDetail, listUsers, resetTwoFactor } from "./admin-users.service";

export const adminRouter = Router();
adminRouter.use(authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), requireStaff2fa);

adminRouter.get("/stats", async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const real = { status: { $ne: OrderStatus.PENDING_PAYMENT } };

  const [
    byRole,
    pendingSellers,
    pendingDelivery,
    awaiting,
    total,
    today,
    open,
    revenue,
    openReports,
  ] = await Promise.all([
    User.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
    User.countDocuments({ role: Role.SELLER, status: AccountStatus.PENDING_APPROVAL }),
    User.countDocuments({ role: Role.DELIVERY, status: AccountStatus.PENDING_APPROVAL }),
    Product.countDocuments({ status: ProductStatus.PENDING_REVIEW }),
    Order.countDocuments(real),
    Order.countDocuments({ ...real, createdAt: { $gte: startOfDay } }),
    Order.countDocuments({
      status: { $in: [OrderStatus.PLACED, OrderStatus.PROCESSING, OrderStatus.SHIPPED] },
    }),
    Order.aggregate<{ total: number }>([
      { $match: { status: { $nin: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Report.countDocuments({ status: "open" }),
  ]);

  const stats: AdminStats = {
    users: Object.fromEntries(byRole.map((r) => [r._id, r.n])),
    pendingSellers,
    pendingDelivery,
    productsAwaitingReview: awaiting,
    openReports,
    orders: { total, today, open },
    revenue: revenue[0]?.total ?? 0,
  };
  res.json(stats);
});

adminRouter.get("/users", validateQuery(adminUserQuerySchema), async (_req, res) => {
  res.json(await listUsers(parsedQuery(res, adminUserQuerySchema)));
});

adminRouter.get("/users/:id", async (req, res) => {
  res.json({ user: await getUserDetail(String(req.params.id)) });
});

adminRouter.post("/users/:id/decision", validate(userDecisionSchema), async (req, res) => {
  res.json(
    await decide(
      { id: req.user!.id, role: req.user!.role },
      String(req.params.id),
      req.body,
      String(req.id),
    ),
  );
});

adminRouter.post("/users/:id/reset-2fa", authorize(Role.SUPER_ADMIN), async (req, res) => {
  await resetTwoFactor(req.user!.id, String(req.params.id), String(req.id));
  res.status(HttpStatus.NO_CONTENT).end();
});

adminRouter.get("/orders", validateQuery(adminOrderQuerySchema), async (_req, res) => {
  const { status, page } = parsedQuery(res, adminOrderQuerySchema);
  res.json(await listAllOrders(status, page));
});

// who did what - only the super admin reads this
const auditQuery = z.object({
  action: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
adminRouter.get(
  "/audit",
  authorize(Role.SUPER_ADMIN),
  validateQuery(auditQuery),
  async (_req, res) => {
    const { action, page } = parsedQuery(res, auditQuery);
    const limit = 30;
    const filter = action
      ? { action: new RegExp(`^${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }
      : {};
    const [rows, total] = await Promise.all([
      Audit.find(filter)
        .sort({ at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("actorId", "name email")
        .lean(),
      Audit.countDocuments(filter),
    ]);

    const items: AuditEntryDTO[] = rows.map((r) => {
      const actor = r.actorId as unknown as { _id: unknown; name: string; email: string } | null;
      return {
        id: String(r._id),
        action: r.action,
        actor: actor ? { id: String(actor._id), name: actor.name, email: actor.email } : undefined,
        targetId: r.targetId ?? undefined,
        at: r.at.toISOString(),
        meta: (r.meta as Record<string, unknown> | undefined) ?? undefined,
      };
    });
    res.json({ items, total, page, pages: Math.ceil(total / limit), limit });
  },
);
