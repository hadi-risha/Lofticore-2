import { createHmac } from "node:crypto";
import Razorpay from "razorpay";
import { ErrorCode, HttpStatus, PaymentMethod, PaymentStatus } from "@lofticore/shared";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError } from "../../lib/app-error";
import { safeEqual } from "../../lib/crypto";
import { Payment } from "../orders/order.model";
import { processPaymentEvent } from "./payment.service";

// Razorpay as a second payment provider next to the demo UPI one. It plugs into the same
// processPaymentEvent() as every provider, so stock, order status and notifications behave
// identically. Test mode: use keys that start with rzp_test_ (no real money moves).

export const razorpayEnabled = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

let client: Razorpay | null = null;
const sdk = () =>
  (client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! }));

const hmac = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("hex");

const unavailable = (msg: string) =>
  new AppError(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE, msg);

// Asks Razorpay for an order, which the browser then pays through Razorpay Checkout.
export async function createRazorpayPayment(
  orderId: string,
  orderNumber: string,
  userId: string,
  amount: number,
  expiresAt: Date,
  attempt = 1,
) {
  if (!razorpayEnabled()) {
    throw unavailable("Online payment isn't available right now. Please choose cash on delivery.");
  }
  let rzpOrder: { id: string };
  try {
    rzpOrder = await sdk().orders.create({
      amount, // paise, the unit Razorpay expects
      currency: "INR",
      receipt: `${orderNumber}-${attempt}`.slice(0, 40),
      notes: { orderId },
    });
  } catch (err) {
    logger.error({ err }, "razorpay order creation failed");
    throw unavailable("We couldn't reach the payment provider. Please try again in a moment.");
  }
  return Payment.create({
    order: orderId,
    user: userId,
    method: PaymentMethod.RAZORPAY,
    provider: "razorpay",
    amount,
    attempt,
    providerOrderId: rzpOrder.id,
    expiresAt,
    events: [{ status: PaymentStatus.PENDING, at: new Date(), note: "waiting for Razorpay" }],
  });
}

const badSignature = () =>
  new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.PAYMENT_INVALID_SIGNATURE, "Invalid signature.");

// The browser reports the result of Razorpay Checkout. Never trust it by itself:
// the signature (an HMAC with our secret) proves Razorpay produced it.
export async function verifyRazorpayCallback(
  paymentId: string,
  userId: string,
  body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  const p = await Payment.findOne({ _id: paymentId, user: userId, provider: "razorpay" });
  if (!p || p.providerOrderId !== body.razorpay_order_id) throw AppError.notFound();
  const expected = hmac(
    env.RAZORPAY_KEY_SECRET ?? "",
    `${body.razorpay_order_id}|${body.razorpay_payment_id}`,
  );
  if (!safeEqual(expected, body.razorpay_signature)) throw badSignature();
  return processPaymentEvent({
    paymentId: String(p._id),
    status: "success",
    providerRef: body.razorpay_payment_id,
  });
}

interface RazorpayWebhook {
  event: string;
  payload: { payment?: { entity: { id: string; order_id: string; error_description?: string } } };
}

// Razorpay's own server-to-server call: covers a customer who paid and closed the tab.
export async function handleRazorpayWebhook(rawBody: string, signature: string | undefined) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !safeEqual(hmac(secret, rawBody), signature)) throw badSignature();

  const ev = JSON.parse(rawBody) as RazorpayWebhook;
  const entity = ev.payload.payment?.entity;
  if (!entity) return;
  const p = await Payment.findOne({ providerOrderId: entity.order_id, provider: "razorpay" });
  if (!p) return;
  if (ev.event === "payment.captured" || ev.event === "order.paid") {
    await processPaymentEvent({
      paymentId: String(p._id),
      status: "success",
      providerRef: entity.id,
    });
  } else if (ev.event === "payment.failed") {
    await processPaymentEvent({
      paymentId: String(p._id),
      status: "failure",
      reason: entity.error_description ?? "Payment failed",
    });
  }
}

// Returns the money through Razorpay. A failure is logged for a manual retry from the
// dashboard rather than blocking the cancellation.
export async function refundRazorpay(providerRef: string, amount: number) {
  try {
    await sdk().payments.refund(providerRef, { amount });
  } catch (err) {
    logger.error({ err, providerRef }, "razorpay refund failed - refund it from the dashboard");
  }
}
