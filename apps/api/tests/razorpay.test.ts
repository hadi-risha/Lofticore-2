import { createHmac } from "node:crypto";
import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpStatus, OrderStatus, PaymentStatus, Role } from "@lofticore/shared";

// the real SDK would call Razorpay's servers; everything else here is the real code
const { refund } = vi.hoisted(() => ({ refund: vi.fn() }));
vi.mock("razorpay", () => ({
  default: class {
    orders = { create: vi.fn().mockResolvedValue({ id: "order_TEST123" }) };
    payments = { refund: refund };
  },
}));

import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/db/connect";
import { Product } from "../src/modules/catalog/product.model";
import {
  bearer,
  ensureIndexes,
  makeCategory,
  makeProduct,
  makeUser,
  resetDb,
  tokenFor,
} from "./helpers";

const app = createApp();
const SECRET = "rzp_test_secret_for_tests";
const sign = (data: string, secret = SECRET) =>
  createHmac("sha256", secret).update(data).digest("hex");

beforeAll(async () => {
  await connectDb();
  await ensureIndexes();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
beforeEach(resetDb);

async function pendingRazorpayOrder() {
  const cat = await makeCategory("Chairs");
  const seller = await makeUser("a@seller.com", Role.SELLER);
  await makeUser("buyer@example.com");
  const chair = await makeProduct({
    title: "Oak Chair",
    category: String(cat._id),
    seller: String(seller._id),
    price: 5000,
    stock: 10,
    sku: "CHAIR-1",
  });
  const token = await tokenFor(app, "buyer@example.com");
  const addr = await request(app).post("/api/addresses").set(bearer(token)).send({
    fullName: "Asha Nair",
    phone: "9876543210",
    line1: "12 Lake View Road",
    city: "Kochi",
    state: "Kerala",
    pincode: "682001",
  });
  const res = await request(app)
    .post("/api/checkout")
    .set(bearer(token))
    .send({
      items: [{ productId: String(chair._id), sku: "CHAIR-1", qty: 1 }],
      addressId: addr.body.address.id,
      paymentMethod: "razorpay",
      idempotencyKey: `rzp-${Date.now()}`,
    });
  expect(res.status).toBe(HttpStatus.CREATED);
  return { token, chair, order: res.body.order };
}

describe("Razorpay payments", () => {
  it("lists razorpay as available when keys are configured", async () => {
    const res = await request(app).get("/api/payments/methods");
    expect(res.body.razorpay).toBe(true);
  });

  it("creates a pending order with the details Razorpay Checkout needs, and no secret", async () => {
    const { order } = await pendingRazorpayOrder();
    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(order.payment.razorpay).toEqual({ keyId: "rzp_test_key", orderId: "order_TEST123" });
    expect(JSON.stringify(order)).not.toContain(SECRET);
  });

  it("confirms the order when the browser callback carries a valid signature", async () => {
    const { token, chair, order } = await pendingRazorpayOrder();
    const paymentId = "pay_ABC";
    const res = await request(app)
      .post(`/api/payments/${order.payment.id}/razorpay/verify`)
      .set(bearer(token))
      .send({
        razorpay_order_id: "order_TEST123",
        razorpay_payment_id: paymentId,
        razorpay_signature: sign(`order_TEST123|${paymentId}`),
      });
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.payment.status).toBe(PaymentStatus.PAID);

    const after = await request(app).get(`/api/orders/${order.id}`).set(bearer(token));
    expect(after.body.order.status).toBe(OrderStatus.PLACED);
    const p = await Product.findById(chair._id);
    expect(p!.variants[0]!.reserved).toBe(0);
  });

  it("rejects a forged signature and leaves the order unpaid", async () => {
    const { token, order } = await pendingRazorpayOrder();
    const res = await request(app)
      .post(`/api/payments/${order.payment.id}/razorpay/verify`)
      .set(bearer(token))
      .send({
        razorpay_order_id: "order_TEST123",
        razorpay_payment_id: "pay_FAKE",
        razorpay_signature: sign("order_TEST123|pay_FAKE", "wrong-secret"),
      });
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    const after = await request(app).get(`/api/orders/${order.id}`).set(bearer(token));
    expect(after.body.order.status).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it("accepts a signed webhook and refuses an unsigned one", async () => {
    const { token, order } = await pendingRazorpayOrder();
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_WH1", order_id: "order_TEST123" } } },
    });
    await request(app)
      .post("/api/payments/webhook/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", "nope")
      .send(body)
      .expect(HttpStatus.UNAUTHORIZED);

    await request(app)
      .post("/api/payments/webhook/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", sign(body, "webhook_secret_for_tests"))
      .send(body)
      .expect(HttpStatus.OK);

    const after = await request(app).get(`/api/orders/${order.id}`).set(bearer(token));
    expect(after.body.order.status).toBe(OrderStatus.PLACED);
  });

  it("refunds through Razorpay when a paid order is cancelled", async () => {
    const { token, order } = await pendingRazorpayOrder();
    await request(app)
      .post(`/api/payments/${order.payment.id}/razorpay/verify`)
      .set(bearer(token))
      .send({
        razorpay_order_id: "order_TEST123",
        razorpay_payment_id: "pay_R1",
        razorpay_signature: sign("order_TEST123|pay_R1"),
      })
      .expect(HttpStatus.OK);
    await request(app).post(`/api/orders/${order.id}/cancel`).set(bearer(token)).expect(200);
    expect(refund).toHaveBeenCalledWith("pay_R1", { amount: expect.any(Number) });
  });
});
