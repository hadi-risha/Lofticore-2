import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ErrorCode,
  HttpStatus,
  OrderStatus,
  PaymentStatus,
  Role,
  ShipmentStatus,
} from "@lofticore/shared";
import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/db/connect";
import { Product } from "../src/modules/catalog/product.model";
import { Reservation } from "../src/modules/inventory/inventory.model";
import { releaseExpiredReservations } from "../src/modules/inventory/inventory.service";
import { Order, Payment } from "../src/modules/orders/order.model";
import { expireUnpaidOrders } from "../src/modules/orders/order.service";
import { signBody } from "../src/modules/payments/payment.service";
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

beforeAll(async () => {
  await connectDb();
  await ensureIndexes();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
beforeEach(resetDb);

const addressBody = {
  fullName: "Asha Nair",
  phone: "9876543210",
  line1: "12 Lake View Road",
  city: "Kochi",
  state: "Kerala",
  pincode: "682001",
};

let keyCounter = 0;
const key = () => `test-key-${Date.now()}-${keyCounter++}`;

async function world() {
  const cat = await makeCategory("Chairs");
  const sellerA = await makeUser("a@seller.com", Role.SELLER);
  const sellerB = await makeUser("b@seller.com", Role.SELLER);
  await makeUser("buyer@example.com");
  await makeUser("agent@example.com", Role.DELIVERY);
  await makeUser("admin@example.com", Role.ADMIN);

  const chair = await makeProduct({
    title: "Oak Chair",
    category: String(cat._id),
    seller: String(sellerA._id),
    price: 5000,
    stock: 10,
    sku: "CHAIR-1",
  });
  const sofa = await makeProduct({
    title: "Big Sofa",
    category: String(cat._id),
    seller: String(sellerB._id),
    price: 20000,
    stock: 3,
    sku: "SOFA-1",
  });
  const mansion = await makeProduct({
    title: "Gold Throne",
    category: String(cat._id),
    seller: String(sellerA._id),
    price: 60000,
    stock: 5,
    sku: "THRONE-1",
  });

  const tokens = {
    buyer: await tokenFor(app, "buyer@example.com"),
    a: await tokenFor(app, "a@seller.com"),
    b: await tokenFor(app, "b@seller.com"),
    agent: await tokenFor(app, "agent@example.com"),
    admin: await tokenFor(app, "admin@example.com"),
  };
  const addr = await request(app)
    .post("/api/addresses")
    .set(bearer(tokens.buyer))
    .send(addressBody);
  return {
    chair,
    sofa,
    mansion,
    tokens,
    addressId: addr.body.address.id as string,
    agent: await mongoose.model("User").findOne({ email: "agent@example.com" }),
  };
}

type W = Awaited<ReturnType<typeof world>>;

const place = (
  w: W,
  items: { p: { _id: unknown }; sku: string; qty: number }[],
  method: "cod" | "upi",
  k = key(),
) =>
  request(app)
    .post("/api/checkout")
    .set(bearer(w.tokens.buyer))
    .send({
      items: items.map((i) => ({ productId: String(i.p._id), sku: i.sku, qty: i.qty })),
      addressId: w.addressId,
      paymentMethod: method,
      idempotencyKey: k,
    });

const stock = async (id: unknown, sku: string) => {
  const p = await Product.findById(id);
  const v = p!.variants.find((x) => x.sku === sku)!;
  return { available: v.available, reserved: v.reserved, sold: p!.soldCount };
};

const tokenOf = (mockAppUrl: string) => mockAppUrl.split("/").pop()!;
const respond = (token: string, body: object) =>
  request(app).post(`/api/mock-upi/${token}/respond`).send(body);

describe("cash on delivery checkout", () => {
  it("places the order and sells the stock straight away", async () => {
    const w = await world();
    const res = await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "cod");
    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.order).toMatchObject({
      status: OrderStatus.PLACED,
      subtotal: 500000,
      deliveryFee: 49900, // under the free-delivery line
      total: 549900,
      payment: { method: "cod", status: PaymentStatus.PENDING },
    });
    expect(res.body.order.orderNumber).toMatch(/^LC-\d{8}-[0-9A-F]{6}$/);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 9, reserved: 0, sold: 1 });
  });

  it("delivers free above the threshold", async () => {
    const w = await world();
    const res = await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 2 }], "cod");
    expect(res.body.order.deliveryFee).toBe(0);
  });

  it("prices from the database, not from the request", async () => {
    const w = await world();
    const res = await request(app)
      .post("/api/checkout")
      .set(bearer(w.tokens.buyer))
      .send({
        items: [{ productId: String(w.chair._id), sku: "CHAIR-1", qty: 1, price: 1 }],
        addressId: w.addressId,
        paymentMethod: "cod",
        idempotencyKey: key(),
      });
    expect(res.body.order.subtotal).toBe(500000);
  });

  it("splits a multi-seller cart into one shipment per seller", async () => {
    const w = await world();
    const res = await place(
      w,
      [
        { p: w.chair, sku: "CHAIR-1", qty: 1 },
        { p: w.sofa, sku: "SOFA-1", qty: 1 },
      ],
      "cod",
    );
    expect(res.body.order.shipments).toHaveLength(2);

    const a = await request(app).get("/api/seller/orders").set(bearer(w.tokens.a));
    expect(a.body.items).toHaveLength(1);
    expect(a.body.items[0].shipments).toHaveLength(1);
    expect(a.body.items[0].shipments[0].items[0].sku).toBe("CHAIR-1");
    expect(a.body.items[0].payment).toBeUndefined(); // sellers don't see payment details
  });

  it("refuses cash on delivery for very large orders", async () => {
    const w = await world();
    const res = await place(w, [{ p: w.mansion, sku: "THRONE-1", qty: 1 }], "cod");
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.code).toBe(ErrorCode.ORDER_COD_NOT_AVAILABLE);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("fails cleanly when stock is short, leaving nothing behind", async () => {
    const w = await world();
    // UPI, because this order is too big for cash on delivery
    const res = await place(
      w,
      [
        { p: w.chair, sku: "CHAIR-1", qty: 2 },
        { p: w.sofa, sku: "SOFA-1", qty: 9 },
      ],
      "upi",
    );
    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.code).toBe(ErrorCode.INVENTORY_INSUFFICIENT_STOCK);
    expect(await Order.countDocuments()).toBe(0);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 10, reserved: 0, sold: 0 });
  });

  it("rejects unknown items and other people's addresses", async () => {
    const w = await world();
    expect((await place(w, [{ p: w.chair, sku: "NOPE", qty: 1 }], "cod")).status).toBe(
      HttpStatus.BAD_REQUEST,
    );

    await makeUser("other@example.com");
    const other = await tokenFor(app, "other@example.com");
    const res = await request(app)
      .post("/api/checkout")
      .set(bearer(other))
      .send({
        items: [{ productId: String(w.chair._id), sku: "CHAIR-1", qty: 1 }],
        addressId: w.addressId,
        paymentMethod: "cod",
        idempotencyKey: key(),
      });
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
  });

  it("creates only one order when the same submit arrives twice", async () => {
    const w = await world();
    const k = key();
    const results = await Promise.all(
      [0, 1, 2].map(() => place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "cod", k)),
    );
    expect(new Set(results.map((r) => r.body.order.id)).size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 9, reserved: 0, sold: 1 });
  });
});

describe("UPI payments", () => {
  async function upiOrder(w: W, qty = 1) {
    const res = await place(w, [{ p: w.chair, sku: "CHAIR-1", qty }], "upi");
    expect(res.status).toBe(HttpStatus.CREATED);
    return res.body.order;
  }

  it("holds the order and the stock until the UPI app confirms", async () => {
    const w = await world();
    const order = await upiOrder(w);
    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(order.payment.upiLink).toMatch(/^upi:\/\/pay\?pa=/);
    expect(order.payment.mockAppUrl).toContain("/mock-upi/");
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 9, reserved: 1, sold: 0 });

    // sellers can't see it yet
    const sellerView = await request(app).get("/api/seller/orders").set(bearer(w.tokens.a));
    expect(sellerView.body.items).toHaveLength(0);
  });

  it("marks the order placed once the signed callback says paid", async () => {
    const w = await world();
    const order = await upiOrder(w);
    const res = await respond(tokenOf(order.payment.mockAppUrl), {
      decision: "approve",
      pin: "1234",
    });
    expect(res.body.status).toBe(PaymentStatus.PAID);

    const after = await request(app).get(`/api/orders/${order.id}`).set(bearer(w.tokens.buyer));
    expect(after.body.order.status).toBe(OrderStatus.PLACED);
    expect(after.body.order.payment.status).toBe(PaymentStatus.PAID);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 9, reserved: 0, sold: 1 });
  });

  it("is safe when the provider sends the same callback twice", async () => {
    const w = await world();
    const order = await upiOrder(w);
    const body = JSON.stringify({
      paymentId: order.payment.id,
      status: "success",
      providerRef: "123456789012",
    });
    const send = () =>
      request(app)
        .post("/api/payments/webhook/mock-upi")
        .set("Content-Type", "application/json")
        .set("x-signature", signBody(body))
        .send(body);

    await send().expect(HttpStatus.OK);
    await send().expect(HttpStatus.OK);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 9, reserved: 0, sold: 1 });
    expect(await Order.countDocuments({ status: OrderStatus.PLACED })).toBe(1);
  });

  it("rejects a callback with a missing or forged signature", async () => {
    const w = await world();
    const order = await upiOrder(w);
    const body = JSON.stringify({
      paymentId: order.payment.id,
      status: "success",
      providerRef: "1",
    });

    const none = await request(app)
      .post("/api/payments/webhook/mock-upi")
      .set("Content-Type", "application/json")
      .send(body);
    const forged = await request(app)
      .post("/api/payments/webhook/mock-upi")
      .set("Content-Type", "application/json")
      .set("x-signature", signBody(body + " "))
      .send(body);
    expect(none.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(forged.body.code).toBe(ErrorCode.PAYMENT_INVALID_SIGNATURE);
    expect((await Payment.findById(order.payment.id))!.status).toBe(PaymentStatus.PENDING);
  });

  it("lets the customer retry after a declined payment", async () => {
    const w = await world();
    const order = await upiOrder(w);

    const declined = await respond(tokenOf(order.payment.mockAppUrl), {
      decision: "approve",
      pin: "0000",
    });
    expect(declined.body).toMatchObject({
      status: PaymentStatus.FAILED,
      reason: "Insufficient balance",
    });
    // the order and stock hold survive a failed attempt
    expect((await Order.findById(order.id))!.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(await stock(w.chair._id, "CHAIR-1")).toMatchObject({ reserved: 1 });

    const retry = await request(app)
      .post(`/api/payments/${order.payment.id}/retry`)
      .set(bearer(w.tokens.buyer));
    expect(retry.status).toBe(HttpStatus.CREATED);
    const ok = await respond(tokenOf(retry.body.payment.mockAppUrl), {
      decision: "approve",
      pin: "4321",
    });
    expect(ok.body.status).toBe(PaymentStatus.PAID);
    expect((await Order.findById(order.id))!.status).toBe(OrderStatus.PLACED);
  });

  it("can't settle a payment twice from the app", async () => {
    const w = await world();
    const order = await upiOrder(w);
    const token = tokenOf(order.payment.mockAppUrl);
    await respond(token, { decision: "approve", pin: "1234" }).expect(HttpStatus.OK);
    const again = await respond(token, { decision: "approve", pin: "1234" });
    expect(again.status).toBe(HttpStatus.CONFLICT);
    expect(again.body.code).toBe(ErrorCode.PAYMENT_NOT_PENDING);
  });

  it("cancels an unpaid order and frees the stock when the window ends", async () => {
    const w = await world();
    const order = await upiOrder(w);
    await Payment.updateOne({ _id: order.payment.id }, { expiresAt: new Date(Date.now() - 1000) });

    expect(await expireUnpaidOrders()).toBe(1);
    expect((await Order.findById(order.id))!.status).toBe(OrderStatus.CANCELLED);
    expect((await Payment.findById(order.payment.id))!.status).toBe(PaymentStatus.EXPIRED);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 10, reserved: 0, sold: 0 });
  });

  it("refunds money that arrives after the stock hold was given up", async () => {
    const w = await world();
    const order = await upiOrder(w);
    await Reservation.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    await releaseExpiredReservations();

    const res = await respond(tokenOf(order.payment.mockAppUrl), {
      decision: "approve",
      pin: "1234",
    });
    expect(res.body.status).toBe(PaymentStatus.REFUNDED);
    expect((await Order.findById(order.id))!.status).toBe(OrderStatus.CANCELLED);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 10, reserved: 0, sold: 0 });
  });

  it("keeps one customer from reading another's payment", async () => {
    const w = await world();
    const order = await upiOrder(w);
    await makeUser("snoop@example.com");
    const snoop = await tokenFor(app, "snoop@example.com");
    expect(
      (await request(app).get(`/api/payments/${order.payment.id}`).set(bearer(snoop))).status,
    ).toBe(HttpStatus.NOT_FOUND);
    expect((await request(app).get(`/api/orders/${order.id}`).set(bearer(snoop))).status).toBe(
      HttpStatus.NOT_FOUND,
    );
  });
});

describe("cancelling", () => {
  it("returns stock and cancels the order before packing", async () => {
    const w = await world();
    const order = (await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 2 }], "cod")).body.order;
    expect(order.canCancel).toBe(true);

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(bearer(w.tokens.buyer));
    expect(res.body.order.status).toBe(OrderStatus.CANCELLED);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 10, reserved: 0, sold: 0 });
  });

  it("refunds a paid UPI order when cancelled", async () => {
    const w = await world();
    const order = (await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "upi")).body.order;
    await respond(tokenOf(order.payment.mockAppUrl), { decision: "approve", pin: "1234" });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(bearer(w.tokens.buyer));
    expect(res.body.order.payment.status).toBe(PaymentStatus.REFUNDED);
  });

  it("releases the hold when an unpaid order is cancelled", async () => {
    const w = await world();
    const order = (await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "upi")).body.order;
    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(bearer(w.tokens.buyer));
    expect(res.body.order.status).toBe(OrderStatus.CANCELLED);
    expect(await stock(w.chair._id, "CHAIR-1")).toEqual({ available: 10, reserved: 0, sold: 0 });
  });

  it("won't cancel once the seller has packed it", async () => {
    const w = await world();
    const order = (await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "cod")).body.order;
    const sid = order.shipments[0].id;
    const advance = (action: string, token = w.tokens.a) =>
      request(app)
        .post(`/api/shipments/${order.id}/${sid}/advance`)
        .set(bearer(token))
        .send({ action });
    await advance("confirm");
    await advance("pack");

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(bearer(w.tokens.buyer));
    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.code).toBe(ErrorCode.ORDER_NOT_CANCELLABLE);
  });
});

describe("shipment progress", () => {
  it("carries a parcel from placed to received, with a delivery code and cash collection", async () => {
    const w = await world();
    const order = (await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "cod")).body.order;
    const sid = order.shipments[0].id;
    const advance = (token: string, body: object) =>
      request(app).post(`/api/shipments/${order.id}/${sid}/advance`).set(bearer(token)).send(body);
    const mine = async () =>
      (await request(app).get(`/api/orders/${order.id}`).set(bearer(w.tokens.buyer))).body.order;

    // steps can't be skipped
    expect((await advance(w.tokens.a, { action: "pack" })).body.code).toBe(
      ErrorCode.ORDER_INVALID_TRANSITION,
    );

    await advance(w.tokens.a, { action: "confirm" }).expect(HttpStatus.OK);
    await advance(w.tokens.a, { action: "pack" }).expect(HttpStatus.OK);
    expect((await mine()).status).toBe(OrderStatus.PROCESSING);

    const shipped = await advance(w.tokens.a, { action: "ship" });
    expect(shipped.body.order.shipments[0].deliveryCode).toBeUndefined(); // sellers never see the code
    const buyerView = await mine();
    expect(buyerView.status).toBe(OrderStatus.SHIPPED);
    const code = buyerView.shipments[0].deliveryCode;
    expect(code).toMatch(/^\d{4}$/);

    // a delivery partner has to be assigned first
    expect((await advance(w.tokens.agent, { action: "out_for_delivery" })).status).toBe(
      HttpStatus.NOT_FOUND,
    );
    await request(app)
      .post(`/api/admin/shipments/${order.id}/${sid}/assign`)
      .set(bearer(w.tokens.admin))
      .send({ agentId: String(w.agent!._id) })
      .expect(HttpStatus.NO_CONTENT);

    await advance(w.tokens.agent, { action: "out_for_delivery" }).expect(HttpStatus.OK);
    const wrong = await advance(w.tokens.agent, {
      action: "deliver",
      deliveryCode: code === "1234" ? "4321" : "1234",
    });
    expect(wrong.body.code).toBe(ErrorCode.ORDER_BAD_DELIVERY_CODE);

    await advance(w.tokens.agent, { action: "deliver", deliveryCode: code }).expect(HttpStatus.OK);
    const done = await mine();
    expect(done.status).toBe(OrderStatus.DELIVERED);
    expect(done.shipments[0].status).toBe(ShipmentStatus.DELIVERED);
    expect(done.shipments[0].deliveryCode).toBeUndefined();
    expect(done.payment.status).toBe(PaymentStatus.PAID); // cash was collected
    expect(done.shipments[0].timeline.map((t: { status: string }) => t.status)).toEqual([
      "placed",
      "confirmed",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
    ]);
  });

  it("only lets the owning seller move their own parcel", async () => {
    const w = await world();
    const order = (await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "cod")).body.order;
    const sid = order.shipments[0].id;
    const res = await request(app)
      .post(`/api/shipments/${order.id}/${sid}/advance`)
      .set(bearer(w.tokens.b))
      .send({ action: "confirm" });
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    const buyer = await request(app)
      .post(`/api/shipments/${order.id}/${sid}/advance`)
      .set(bearer(w.tokens.buyer))
      .send({ action: "confirm" });
    expect(buyer.status).toBe(HttpStatus.FORBIDDEN);
  });

  it("won't advance an order that hasn't been paid for", async () => {
    const w = await world();
    const order = (await place(w, [{ p: w.chair, sku: "CHAIR-1", qty: 1 }], "upi")).body.order;
    const res = await request(app)
      .post(`/api/shipments/${order.id}/${order.shipments[0].id}/advance`)
      .set(bearer(w.tokens.a))
      .send({ action: "confirm" });
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
  });
});

describe("addresses and wishlist", () => {
  it("keeps one default address and protects other people's", async () => {
    const w = await world();
    const second = await request(app)
      .post("/api/addresses")
      .set(bearer(w.tokens.buyer))
      .send({ ...addressBody, line1: "99 Hill Street", isDefault: true });
    expect(second.body.address.isDefault).toBe(true);

    const list = await request(app).get("/api/addresses").set(bearer(w.tokens.buyer));
    expect(list.body.addresses.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);

    await makeUser("other@example.com");
    const other = await tokenFor(app, "other@example.com");
    expect(
      (await request(app).delete(`/api/addresses/${w.addressId}`).set(bearer(other))).status,
    ).toBe(HttpStatus.NOT_FOUND);
    expect(
      (
        await request(app)
          .post("/api/addresses")
          .set(bearer(w.tokens.buyer))
          .send({ ...addressBody, pincode: "12" })
      ).status,
    ).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it("adds and removes wishlist items, and adding twice is harmless", async () => {
    const w = await world();
    const add = () => request(app).put(`/api/wishlist/${w.chair._id}`).set(bearer(w.tokens.buyer));
    await add().expect(HttpStatus.NO_CONTENT);
    await add().expect(HttpStatus.NO_CONTENT);

    const list = await request(app).get("/api/wishlist").set(bearer(w.tokens.buyer));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].title).toBe("Oak Chair");
    expect(
      (await request(app).get("/api/wishlist/ids").set(bearer(w.tokens.buyer))).body.ids,
    ).toEqual([String(w.chair._id)]);

    await request(app)
      .delete(`/api/wishlist/${w.chair._id}`)
      .set(bearer(w.tokens.buyer))
      .expect(HttpStatus.NO_CONTENT);
    expect(
      (await request(app).get("/api/wishlist").set(bearer(w.tokens.buyer))).body.items,
    ).toHaveLength(0);
    expect((await request(app).get("/api/wishlist")).status).toBe(HttpStatus.UNAUTHORIZED);
  });
});
