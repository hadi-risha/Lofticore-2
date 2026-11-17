import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  HttpStatus,
  OrderStatus,
  PaymentStatus,
  Role,
  checkoutSchema,
  mockUpiResponseSchema,
  shipmentActionSchema,
} from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { authenticate, authorize } from "../../middleware/authenticate";
import { requireStaff2fa } from "../../middleware/require-staff-2fa";
import { requireApproved } from "../../middleware/require-approved";
import { parsedQuery, validate, validateQuery } from "../../middleware/validate";
import { Order, Payment } from "./order.model";
import * as orders from "./order.service";
import {
  createUpiPayment,
  handleWebhook,
  mockPaymentInfo,
  mockRespond,
  toPaymentDTO,
  demoPaymentsEnabled,
} from "../payments/payment.service";
import {
  createRazorpayPayment,
  handleRazorpayWebhook,
  razorpayEnabled,
  verifyRazorpayCallback,
} from "../payments/razorpay";

const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1) });
const id = (req: Request, name: string) => String(req.params[name]);

/* ------------------------------------------------------------- customer side */

export const checkoutRouter = Router();
checkoutRouter.post("/", authenticate, validate(checkoutSchema), async (req, res) => {
  const order = await orders.checkout(req.user!.id, req.body, String(req.id));
  res.status(HttpStatus.CREATED).json({ order });
});

export const orderRouter = Router();
orderRouter.use(authenticate);

orderRouter.get("/", validateQuery(pageQuery), async (req, res) => {
  res.json(await orders.listOrders(req.user!.id, parsedQuery(res, pageQuery).page));
});

orderRouter.get("/:id", async (req, res) => {
  res.json({ order: await orders.getOrder(req.user!.id, id(req, "id")) });
});

orderRouter.post("/:id/cancel", async (req, res) => {
  res.json({ order: await orders.cancelOrder(req.user!.id, id(req, "id"), String(req.id)) });
});

/* ------------------------------------------------------------------ payments */

export const paymentRouter = Router();

// The provider's callback. Public, but useless without a valid signature.
// Raw body is needed because the signature is over the exact bytes sent.
// which online payment options this server offers, so checkout only shows working ones
paymentRouter.get("/methods", (_req, res) => {
  res.json({ razorpay: razorpayEnabled(), upi: demoPaymentsEnabled() });
});

paymentRouter.post("/webhook/razorpay", async (req, res) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? "";
  await handleRazorpayWebhook(raw, req.header("x-razorpay-signature"));
  res.status(HttpStatus.OK).json({ received: true });
});

// the browser reports Razorpay Checkout's result; the signature is what we trust
paymentRouter.post(
  "/:id/razorpay/verify",
  authenticate,
  validate(
    z.object({
      razorpay_order_id: z.string().min(1).max(64),
      razorpay_payment_id: z.string().min(1).max(64),
      razorpay_signature: z.string().min(1).max(128),
    }),
  ),
  async (req, res) => {
    const p = await verifyRazorpayCallback(id(req, "id"), req.user!.id, req.body);
    res.json({ payment: p ? toPaymentDTO(p) : null });
  },
);

paymentRouter.post("/webhook/mock-upi", async (req, res) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? "";
  await handleWebhook(raw, req.header("x-signature"));
  res.status(HttpStatus.OK).json({ received: true });
});

// polled by the payment page while the customer is in their UPI app
paymentRouter.get("/:id", authenticate, async (req, res) => {
  const p = await Payment.findOne({ _id: id(req, "id"), user: req.user!.id });
  if (!p) throw AppError.notFound("We couldn't find that payment.");
  res.json({ payment: toPaymentDTO(p) });
});

// A declined payment can be retried while the stock is still held for the order.
paymentRouter.post("/:id/retry", authenticate, async (req, res) => {
  const prev = await Payment.findOne({ _id: id(req, "id"), user: req.user!.id });
  if (!prev) throw AppError.notFound("We couldn't find that payment.");
  const order = await Order.findById(prev.order);

  const open =
    order?.status === OrderStatus.PENDING_PAYMENT && prev.expiresAt && prev.expiresAt > new Date();
  if (!order || !open || prev.status !== PaymentStatus.FAILED) {
    throw AppError.badRequest("This payment can't be retried. Please place the order again.");
  }
  const next =
    prev.provider === "razorpay"
      ? await createRazorpayPayment(
          String(order._id),
          order.orderNumber,
          req.user!.id,
          order.total,
          prev.expiresAt!,
          prev.attempt + 1,
        )
      : await createUpiPayment(
          String(order._id),
          req.user!.id,
          order.total,
          prev.expiresAt!,
          prev.attempt + 1,
        );
  res.status(HttpStatus.CREATED).json({ payment: toPaymentDTO(next) });
});

/* -------------------------------------------------- the demo UPI app (dev only) */

export const mockUpiRouter = Router();

mockUpiRouter.get("/:token", async (req, res) => {
  res.json(await mockPaymentInfo(id(req, "token")));
});

mockUpiRouter.post("/:token/respond", validate(mockUpiResponseSchema), async (req, res) => {
  const payment = await mockRespond(id(req, "token"), req.body.decision, req.body.pin);
  res.json({ status: payment?.status, reason: payment?.failureReason });
});

/* ---------------------------------------------------------- seller & delivery */

export const sellerOrderRouter = Router();
sellerOrderRouter.use(authenticate, authorize(Role.SELLER), requireApproved);

sellerOrderRouter.get("/", validateQuery(pageQuery), async (req, res) => {
  res.json(await orders.listSellerOrders(req.user!.id, parsedQuery(res, pageQuery).page));
});

export const deliveryRouter = Router();
deliveryRouter.use(authenticate, authorize(Role.DELIVERY), requireApproved);

deliveryRouter.get("/orders", async (req, res) => {
  res.json({ items: await orders.listAgentOrders(req.user!.id) });
});

// Sellers (confirm/pack/ship), delivery partners (out for delivery/deliver) and
// admins all move a parcel with the same call; the service decides who may do what.
export const shipmentRouter = Router();
shipmentRouter.post(
  "/:orderId/:shipmentId/advance",
  authenticate,
  authorize(Role.SELLER, Role.DELIVERY, Role.ADMIN, Role.SUPER_ADMIN),
  requireApproved,
  validate(shipmentActionSchema),
  async (req: Request, res: Response) => {
    const order = await orders.advanceShipment(
      { id: req.user!.id, role: req.user!.role },
      id(req, "orderId"),
      id(req, "shipmentId"),
      req.body.action,
      { deliveryCode: req.body.deliveryCode, note: req.body.note },
      String(req.id),
    );
    res.json({ order });
  },
);

export const adminShipmentRouter = Router();
adminShipmentRouter.use(authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), requireStaff2fa);
adminShipmentRouter.post(
  "/:orderId/:shipmentId/assign",
  validate(z.object({ agentId: z.string().regex(/^[a-f\d]{24}$/i) })),
  async (req, res) => {
    await orders.assignAgent(
      req.user!.id,
      id(req, "orderId"),
      id(req, "shipmentId"),
      req.body.agentId,
      String(req.id),
    );
    res.status(HttpStatus.NO_CONTENT).end();
  },
);
