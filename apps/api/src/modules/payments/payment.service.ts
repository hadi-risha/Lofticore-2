import { createHmac, randomInt } from "node:crypto";
import {
  ErrorCode,
  HttpStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
  type PaymentDTO,
} from "@lofticore/shared";
import { env } from "../../config/env";
import { AppError } from "../../lib/app-error";
import { randomToken, safeEqual } from "../../lib/crypto";
import { audit } from "../audit/audit.model";
import { commitReservation } from "../inventory/inventory.service";
import { Order, Payment, type PaymentDoc } from "../orders/order.model";
import { announceOrderPlaced, announcePaymentFailed } from "../orders/order-events";

/* ------------------------------------------------------------ the "gateway" */

// This file plays both sides of a payment gateway integration:
//   - our side: create a payment, expose a UPI link, receive a signed callback
//   - the provider's side (mockRespond): the demo UPI app that confirms or declines
// The callback is verified and processed exactly as a real gateway's would be, so
// swapping in Razorpay or Cashfree later means replacing the provider calls, not
// the order logic.

export interface PaymentEvent {
  paymentId: string;
  status: "success" | "failure";
  providerRef?: string;
  reason?: string;
}

// Demo payments run everywhere except production, where they need an explicit opt-in.
export const demoPaymentsEnabled = () => !env.isProd || env.ALLOW_DEMO_PAYMENTS;

export const signBody = (rawBody: string) =>
  createHmac("sha256", env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");

export const toPaymentDTO = (p: PaymentDoc): PaymentDTO => ({
  id: String(p._id),
  method: p.method,
  status: p.status,
  amount: p.amount,
  expiresAt: p.expiresAt?.toISOString(),
  ...(p.provider === "razorpay" && p.status === PaymentStatus.PENDING && p.providerOrderId
    ? { razorpay: { keyId: env.RAZORPAY_KEY_ID ?? "", orderId: p.providerOrderId } }
    : {}),
  ...(p.provider === "mock_upi" && p.status === PaymentStatus.PENDING
    ? {
        upiLink:
          `upi://pay?pa=${encodeURIComponent(env.PAYEE_VPA)}&pn=Lofticore&am=${(p.amount / 100).toFixed(2)}` +
          `&cu=INR&tr=${String(p._id)}&tn=Lofticore%20order`,
        mockAppUrl: `${env.clientUrl}/mock-upi/${p.token}`,
      }
    : {}),
});

const event = (status: PaymentStatus, note?: string) => ({ status, at: new Date(), note });

export async function createCodPayment(orderId: string, userId: string, amount: number) {
  return Payment.create({
    order: orderId,
    user: userId,
    method: PaymentMethod.COD,
    provider: "cod",
    amount,
    events: [event(PaymentStatus.PENDING, "pay on delivery")],
  });
}

export async function createUpiPayment(
  orderId: string,
  userId: string,
  amount: number,
  expiresAt: Date,
  attempt = 1,
) {
  return Payment.create({
    order: orderId,
    user: userId,
    method: PaymentMethod.UPI,
    provider: "mock_upi",
    amount,
    attempt,
    token: randomToken(18),
    expiresAt,
    events: [event(PaymentStatus.PENDING, "waiting for UPI confirmation")],
  });
}

/* ------------------------------------------------------- processing a result */

// Idempotent: gateways retry callbacks, so seeing the same result twice must not
// charge, commit stock or ship anything twice. The first atomic status change wins.
export async function processPaymentEvent(ev: PaymentEvent) {
  if (ev.status === "failure") {
    const failed = await Payment.findOneAndUpdate(
      { _id: ev.paymentId, status: PaymentStatus.PENDING },
      {
        status: PaymentStatus.FAILED,
        failureReason: ev.reason,
        $push: { events: event(PaymentStatus.FAILED, ev.reason) },
      },
      { new: true },
    );
    // the order stays open with its stock held, so the customer can try again
    if (failed) {
      const open = await Order.findById(failed.order).select("user orderNumber");
      if (open) await announcePaymentFailed(open, ev.reason);
    }
    return failed ?? (await Payment.findById(ev.paymentId));
  }

  const paid = await Payment.findOneAndUpdate(
    { _id: ev.paymentId, status: PaymentStatus.PENDING },
    {
      status: PaymentStatus.PAID,
      providerRef: ev.providerRef,
      $push: { events: event(PaymentStatus.PAID, `UTR ${ev.providerRef ?? "-"}`) },
    },
    { new: true },
  );
  if (!paid) return Payment.findById(ev.paymentId); // already settled - nothing more to do

  const order = await Order.findById(paid.order);
  if (!order || order.status !== OrderStatus.PENDING_PAYMENT || !order.reservation) {
    // money arrived for an order that's already closed (e.g. the window ended first)
    await refundPayment(paid, "order was no longer open");
    return paid;
  }

  try {
    await commitReservation(String(order.reservation), String(order._id));
  } catch {
    // the stock hold expired and was given to someone else: give the money back
    await refundPayment(paid, "stock hold expired before payment arrived");
    await closeOrder(String(order._id), "Payment arrived after the checkout window ended.");
    return Payment.findById(paid._id);
  }

  order.status = OrderStatus.PLACED;
  await order.save();
  await announceOrderPlaced(order);
  await audit({ action: "payment.paid", actorId: String(paid.user), targetId: String(paid._id) });
  return paid;
}

// Used when an unpaid or unfulfillable order is closed.
export async function closeOrder(orderId: string, reason: string) {
  await Order.updateOne(
    { _id: orderId },
    {
      status: OrderStatus.CANCELLED,
      cancelReason: reason,
      "shipments.$[].status": ShipmentStatus.CANCELLED,
      $push: {
        "shipments.$[].timeline": {
          status: ShipmentStatus.CANCELLED,
          at: new Date(),
          note: reason,
        },
      },
    },
  );
}

export async function refundPayment(payment: PaymentDoc, note: string) {
  if (payment.status !== PaymentStatus.PAID) return;
  payment.status = PaymentStatus.REFUNDED;
  payment.events.push(event(PaymentStatus.REFUNDED, note));
  await payment.save();
  if (payment.provider === "razorpay" && payment.providerRef) {
    // imported here because razorpay.ts itself imports this file
    const { refundRazorpay } = await import("./razorpay");
    await refundRazorpay(payment.providerRef, payment.amount - (payment.refundedAmount ?? 0));
  }
  await audit({
    action: "payment.refunded",
    actorId: String(payment.user),
    targetId: String(payment._id),
    meta: { note },
  });
}

/* ----------------------------------------------------------------- webhook */

// What a gateway's POST to us looks like: a JSON body plus an HMAC of that exact
// body in a header. Compare in constant time, and only parse after it checks out.
export async function handleWebhook(rawBody: string, signature: string | undefined) {
  if (!signature || !safeEqual(signBody(rawBody), signature)) {
    throw new AppError(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.PAYMENT_INVALID_SIGNATURE,
      "Invalid signature.",
    );
  }
  const ev = JSON.parse(rawBody) as PaymentEvent;
  return processPaymentEvent(ev);
}

/* ------------------------------------------------------ the demo UPI "app" */

export async function mockPaymentInfo(token: string) {
  if (!demoPaymentsEnabled()) throw AppError.notFound();
  const p = await Payment.findOne({ token, provider: "mock_upi" });
  if (!p) throw AppError.notFound("This payment link isn't valid.");
  const order = await Order.findById(p.order).select("orderNumber");
  return {
    paymentId: String(p._id),
    status: p.status,
    amount: p.amount,
    payee: "Lofticore",
    payeeVpa: env.PAYEE_VPA,
    orderNumber: order?.orderNumber,
    expiresAt: p.expiresAt?.toISOString(),
  };
}

// The customer "opens their UPI app" and approves or declines. The app then tells
// our server the same way a real provider would: a signed callback.
export async function mockRespond(token: string, decision: "approve" | "decline", pin?: string) {
  if (!demoPaymentsEnabled()) throw AppError.notFound();
  const p = await Payment.findOne({ token, provider: "mock_upi" });
  if (!p) throw AppError.notFound("This payment link isn't valid.");
  if (p.status !== PaymentStatus.PENDING) {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.PAYMENT_NOT_PENDING,
      "This payment is already settled.",
    );
  }
  if (p.expiresAt && p.expiresAt < new Date()) {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.PAYMENT_NOT_PENDING,
      "This payment link has expired.",
    );
  }

  let ev: PaymentEvent;
  if (decision === "decline") {
    ev = { paymentId: String(p._id), status: "failure", reason: "Declined by customer" };
  } else if (!pin) {
    throw AppError.badRequest("Enter your UPI PIN to approve.");
  } else if (pin === "0000") {
    // handy for demos and tests: this PIN simulates an empty account
    ev = { paymentId: String(p._id), status: "failure", reason: "Insufficient balance" };
  } else {
    ev = {
      paymentId: String(p._id),
      status: "success",
      providerRef: String(randomInt(1e11, 1e12)),
    };
  }

  const body = JSON.stringify(ev);
  return handleWebhook(body, signBody(body));
}
