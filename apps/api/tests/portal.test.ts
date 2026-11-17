import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AccountStatus,
  ErrorCode,
  HttpStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  Role,
  ShipmentStatus,
} from "@lofticore/shared";
import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/db/connect";
import { outbox } from "../src/lib/mailer";
import { totpNow } from "../src/lib/totp";
import { hashPassword } from "../src/lib/password";
import { Product } from "../src/modules/catalog/product.model";
import { Order, Payment } from "../src/modules/orders/order.model";
import { Session } from "../src/modules/auth/session.model";
import { User } from "../src/modules/users/user.model";
import {
  PASSWORD,
  TEST_TOTP_SECRET,
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
beforeEach(async () => {
  outbox.length = 0;
  await resetDb();
});

const sellerDetails = {
  businessName: "Oak & Co",
  phone: "9876543210",
  addressLine: "22 Timber Lane, Industrial Area",
  city: "Kochi",
  state: "Kerala",
  pincode: "682030",
  pan: "ABCDE1234F",
  payoutUpi: "oakandco@okbank",
};

async function team() {
  await makeUser("root@example.com", Role.SUPER_ADMIN);
  await makeUser("admin@example.com", Role.ADMIN);
  return {
    root: await tokenFor(app, "root@example.com"),
    admin: await tokenFor(app, "admin@example.com"),
  };
}

const decide = (token: string, id: unknown, body: object) =>
  request(app).post(`/api/admin/users/${id}/decision`).set(bearer(token)).send(body);

describe("staff two-factor", () => {
  it("keeps admin tools shut until an authenticator is set up", async () => {
    await User.create({
      name: "New Admin",
      email: "new@example.com",
      passwordHash: await hashPassword(PASSWORD),
      role: Role.ADMIN,
      emailVerified: true,
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "new@example.com", password: PASSWORD });
    const token = login.body.accessToken;

    const blocked = await request(app).get("/api/admin/stats").set(bearer(token));
    expect(blocked.status).toBe(HttpStatus.FORBIDDEN);
    expect(blocked.body.code).toBe(ErrorCode.AUTH_2FA_SETUP_REQUIRED);

    const setup = await request(app).post("/api/auth/2fa/setup").set(bearer(token));
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.otpauthUrl).toContain("otpauth://totp/");
    expect(setup.body.qr).toMatch(/^data:image\/png;base64,/);

    const wrong = await request(app)
      .post("/api/auth/2fa/enable")
      .set(bearer(token))
      .send({ code: "000000" });
    expect(wrong.body.code).toBe(ErrorCode.AUTH_2FA_INVALID);

    await request(app)
      .post("/api/auth/2fa/enable")
      .set(bearer(token))
      .send({ code: totpNow(setup.body.secret) })
      .expect(HttpStatus.OK);
    expect((await request(app).get("/api/admin/stats").set(bearer(token))).status).toBe(
      HttpStatus.OK,
    );
  });

  it("asks for the code at login and only opens a session when it's right", async () => {
    await makeUser("admin@example.com", Role.ADMIN);
    const step1 = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: PASSWORD });
    expect(step1.body.twoFactorRequired).toBe(true);
    expect(step1.body.accessToken).toBeUndefined();
    expect(step1.headers["set-cookie"]).toBeUndefined();

    const bad = await request(app)
      .post("/api/auth/login/2fa")
      .send({
        challengeToken: step1.body.challengeToken,
        code: "123456" === totpNow(TEST_TOTP_SECRET) ? "654321" : "123456",
      });
    expect(bad.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(bad.body.code).toBe(ErrorCode.AUTH_2FA_INVALID);

    const ok = await request(app)
      .post("/api/auth/login/2fa")
      .send({ challengeToken: step1.body.challengeToken, code: totpNow(TEST_TOTP_SECRET) });
    expect(ok.status).toBe(HttpStatus.OK);
    expect(ok.body.user.role).toBe(Role.ADMIN);
  });

  it("never lets the sign-in challenge pass as a real session", async () => {
    await makeUser("admin@example.com", Role.ADMIN);
    const step1 = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: PASSWORD });
    const res = await request(app).get("/api/admin/stats").set(bearer(step1.body.challengeToken));
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it("lets a super admin reset an admin's authenticator, signing them out", async () => {
    const t = await team();
    const admin = await User.findOne({ email: "admin@example.com" });
    await request(app)
      .post(`/api/admin/users/${admin!._id}/reset-2fa`)
      .set(bearer(t.root))
      .expect(HttpStatus.NO_CONTENT);

    const after = await User.findById(admin!._id);
    expect(after!.totpEnabled).toBe(false);
    expect(await Session.countDocuments({ userId: admin!._id, revokedAt: null })).toBe(0);
    // an ordinary admin can't do this
    expect(
      (await request(app).post(`/api/admin/users/${admin!._id}/reset-2fa`).set(bearer(t.admin)))
        .status,
    ).toBe(HttpStatus.FORBIDDEN);
  });
});

describe("onboarding sellers and delivery partners", () => {
  it("takes details, then an admin approves and the seller is told", async () => {
    const t = await team();
    const seller = await makeUser("shop@example.com", Role.SELLER, AccountStatus.PENDING_APPROVAL);
    const sellerToken = await tokenFor(app, "shop@example.com");

    // can't be approved before sending details
    const early = await decide(t.admin, seller._id, { action: "approve" });
    expect(early.status).toBe(HttpStatus.CONFLICT);
    expect(early.body.code).toBe(ErrorCode.USER_PROFILE_INCOMPLETE);

    const bad = await request(app)
      .put("/api/users/me/profile")
      .set(bearer(sellerToken))
      .send({ ...sellerDetails, pan: "nope" });
    expect(bad.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(bad.body.fields.pan).toBeTruthy();

    const sent = await request(app)
      .put("/api/users/me/profile")
      .set(bearer(sellerToken))
      .send(sellerDetails);
    expect(sent.body.user.profileSubmitted).toBe(true);

    const detail = await request(app).get(`/api/admin/users/${seller._id}`).set(bearer(t.admin));
    expect(detail.body.user.profile.businessName).toBe("Oak & Co");

    const approved = await decide(t.admin, seller._id, { action: "approve" });
    expect(approved.body.user.status).toBe(AccountStatus.ACTIVE);
    expect(outbox.at(-1)).toMatchObject({
      to: "shop@example.com",
      subject: expect.stringContaining("approved"),
    });
  });

  it("needs a reason to reject, shows it to the seller, and lets them re-apply", async () => {
    const t = await team();
    const seller = await makeUser("shop@example.com", Role.SELLER, AccountStatus.PENDING_APPROVAL);
    const token = await tokenFor(app, "shop@example.com");
    await request(app).put("/api/users/me/profile").set(bearer(token)).send(sellerDetails);

    expect((await decide(t.admin, seller._id, { action: "reject" })).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    await decide(t.admin, seller._id, {
      action: "reject",
      reason: "PAN doesn't match the business name.",
    }).expect(HttpStatus.OK);

    const me = await request(app).get("/api/users/me").set(bearer(token));
    expect(me.body.user).toMatchObject({
      status: AccountStatus.REJECTED,
      statusReason: "PAN doesn't match the business name.",
    });

    // sellers can't list while rejected
    const cat = await makeCategory("Chairs");
    const prod = {
      title: "Oak Chair",
      description: "A solid oak chair that lasts for years.",
      categoryId: String(cat._id),
      images: [{ url: "https://example.com/a.jpg" }],
      dimensions: { widthCm: 40, depthCm: 40, heightCm: 90 },
      variants: [{ sku: "OAK-1", price: 500000, mrp: 600000, stock: 3 }],
    };
    expect(
      (await request(app).post("/api/seller/products").set(bearer(token)).send(prod)).status,
    ).toBe(HttpStatus.FORBIDDEN);

    // fixing the details puts them back in the queue
    const again = await request(app)
      .put("/api/users/me/profile")
      .set(bearer(token))
      .send({ ...sellerDetails, pan: "ABCDE1234G" });
    expect(again.body.user.status).toBe(AccountStatus.PENDING_APPROVAL);
    expect(again.body.user.statusReason).toBeUndefined();
  });

  it("collects a delivery partner's licence and service areas", async () => {
    await makeUser("rider@example.com", Role.DELIVERY, AccountStatus.PENDING_APPROVAL);
    const token = await tokenFor(app, "rider@example.com");
    const bad = await request(app).put("/api/users/me/profile").set(bearer(token)).send({
      phone: "9876543210",
      vehicle: "bike",
      licenceNumber: "KL0720110012345",
      serviceAreas: [],
    });
    expect(bad.body.fields.serviceAreas).toBeTruthy();
    const ok = await request(app)
      .put("/api/users/me/profile")
      .set(bearer(token))
      .send({
        phone: "9876543210",
        vehicle: "van",
        licenceNumber: "KL0720110012345",
        serviceAreas: ["682001", "682030"],
      });
    expect(ok.body.user.profileSubmitted).toBe(true);
  });

  it("keeps customers from sending business details", async () => {
    await makeUser("buyer@example.com");
    const token = await tokenFor(app, "buyer@example.com");
    expect(
      (await request(app).put("/api/users/me/profile").set(bearer(token)).send(sellerDetails))
        .status,
    ).toBe(HttpStatus.FORBIDDEN);
  });
});

describe("who can act on whom", () => {
  it("keeps customers out, and admins away from other staff", async () => {
    const t = await team();
    const buyer = await makeUser("buyer@example.com");
    const buyerToken = await tokenFor(app, "buyer@example.com");
    const admin = await User.findOne({ email: "admin@example.com" });
    const root = await User.findOne({ email: "root@example.com" });

    expect((await request(app).get("/api/admin/users").set(bearer(buyerToken))).status).toBe(
      HttpStatus.FORBIDDEN,
    );
    expect((await decide(t.admin, admin!._id, { action: "block", reason: "testing" })).status).toBe(
      HttpStatus.FORBIDDEN,
    ); // self
    expect((await decide(t.admin, root!._id, { action: "block", reason: "nope" })).status).toBe(
      HttpStatus.FORBIDDEN,
    ); // super admin untouchable
    expect((await decide(t.root, root!._id, { action: "block", reason: "nope" })).status).toBe(
      HttpStatus.FORBIDDEN,
    ); // even by themselves

    // an admin can't touch another admin; only the super admin can
    await makeUser("admin2@example.com", Role.ADMIN);
    const admin2 = await User.findOne({ email: "admin2@example.com" });
    expect((await decide(t.admin, admin2!._id, { action: "block", reason: "x ok" })).status).toBe(
      HttpStatus.FORBIDDEN,
    );
    expect(
      (await decide(t.root, admin2!._id, { action: "block", reason: "left the team" })).status,
    ).toBe(HttpStatus.OK);
    expect(buyer).toBeTruthy();
  });

  it("filters and searches the user list", async () => {
    const t = await team();
    await makeUser("maya@example.com");
    await makeUser("shop@example.com", Role.SELLER, AccountStatus.PENDING_APPROVAL);
    const byRole = await request(app).get("/api/admin/users?role=seller").set(bearer(t.admin));
    expect(byRole.body.items.map((u: { email: string }) => u.email)).toEqual(["shop@example.com"]);
    const pending = await request(app)
      .get("/api/admin/users?status=pending_approval")
      .set(bearer(t.admin));
    expect(pending.body.total).toBe(1);
    const search = await request(app).get("/api/admin/users?q=may").set(bearer(t.admin));
    expect(search.body.items[0].email).toBe("maya@example.com");
  });
});

describe("blocking with open orders", () => {
  async function shop() {
    const cat = await makeCategory("Chairs");
    const sellerA = await makeUser("a@seller.com", Role.SELLER);
    const sellerB = await makeUser("b@seller.com", Role.SELLER);
    const buyer = await makeUser("buyer@example.com");
    const chair = await makeProduct({
      title: "Oak Chair",
      category: String(cat._id),
      seller: String(sellerA._id),
      price: 5000,
      stock: 10,
      sku: "CHAIR-1",
    });
    const lamp = await makeProduct({
      title: "Brass Lamp",
      category: String(cat._id),
      seller: String(sellerB._id),
      price: 2000,
      stock: 10,
      sku: "LAMP-1",
    });
    const buyerToken = await tokenFor(app, "buyer@example.com");
    const addr = await request(app).post("/api/addresses").set(bearer(buyerToken)).send({
      fullName: "Maya",
      phone: "9876543210",
      line1: "12 Lake View Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
    });
    const order = async (items: { p: { _id: unknown }; sku: string }[]) =>
      (
        await request(app)
          .post("/api/checkout")
          .set(bearer(buyerToken))
          .send({
            items: items.map((i) => ({ productId: String(i.p._id), sku: i.sku, qty: 1 })),
            addressId: addr.body.address.id,
            paymentMethod: "cod",
            idempotencyKey: `key-${Math.random()}-${Date.now()}`,
          })
      ).body.order;
    return { sellerA, sellerB, buyer, chair, lamp, buyerToken, order };
  }
  const stockOf = async (id: unknown) => (await Product.findById(id))!.variants[0]!.available;

  it("hides a blocked seller's products and signs them out everywhere", async () => {
    const t = await team();
    const s = await shop();
    const sellerToken = await tokenFor(app, "a@seller.com");
    expect(await Session.countDocuments({ userId: s.sellerA._id, revokedAt: null })).toBe(1);

    await decide(t.admin, s.sellerA._id, {
      action: "block",
      reason: "Counterfeit complaints",
    }).expect(HttpStatus.OK);
    expect((await Product.findById(s.chair._id))!.status).toBe(ProductStatus.SUSPENDED);
    expect((await request(app).get(`/api/products/${s.chair.slug}`)).status).toBe(
      HttpStatus.NOT_FOUND,
    );
    expect(await Session.countDocuments({ userId: s.sellerA._id, revokedAt: null })).toBe(0);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: "a@seller.com", password: PASSWORD })
      ).body.code,
    ).toBe(ErrorCode.AUTH_ACCOUNT_BLOCKED);
    expect(sellerToken).toBeTruthy();
    expect(outbox.at(-1)!.text).toContain("Counterfeit complaints");

    await decide(t.admin, s.sellerA._id, { action: "unblock" }).expect(HttpStatus.OK);
    expect((await Product.findById(s.chair._id))!.status).toBe(ProductStatus.ACTIVE);
  });

  it("lets open orders carry on when blocking with 'complete'", async () => {
    const t = await team();
    const s = await shop();
    const order = await s.order([{ p: s.chair, sku: "CHAIR-1" }]);
    await decide(t.admin, s.sellerA._id, {
      action: "block",
      reason: "Under review",
      activeOrders: "complete",
    });
    expect((await Order.findById(order.id))!.status).toBe(OrderStatus.PLACED);
    // the blocked seller can't ship it, but an admin can step in
    const advance = await request(app)
      .post(`/api/shipments/${order.id}/${order.shipments[0].id}/advance`)
      .set(bearer(t.admin))
      .send({ action: "confirm" });
    expect(advance.status).toBe(HttpStatus.OK);
  });

  it("cancels only the blocked seller's parcels and refunds just those items", async () => {
    const t = await team();
    const s = await shop();
    // pay online so there is money to refund
    const upi = (
      await request(app)
        .post("/api/checkout")
        .set(bearer(s.buyerToken))
        .send({
          items: [
            { productId: String(s.chair._id), sku: "CHAIR-1", qty: 1 },
            { productId: String(s.lamp._id), sku: "LAMP-1", qty: 1 },
          ],
          addressId: (await request(app).get("/api/addresses").set(bearer(s.buyerToken))).body
            .addresses[0].id,
          paymentMethod: "upi",
          idempotencyKey: "upi-split-order",
        })
    ).body.order;
    const token = upi.payment.mockAppUrl.split("/").pop();
    await request(app)
      .post(`/api/mock-upi/${token}/respond`)
      .send({ decision: "approve", pin: "1234" });

    const res = await decide(t.admin, s.sellerA._id, {
      action: "block",
      reason: "Fraud reports",
      activeOrders: "cancel",
    });
    expect(res.body.cancelledOrders).toBe(1);

    const order = (await Order.findById(upi.id))!;
    const byStatus = Object.fromEntries(
      order.shipments.map((sh) => [String(sh.seller), sh.status]),
    );
    expect(byStatus[String(s.sellerA._id)]).toBe(ShipmentStatus.CANCELLED);
    expect(byStatus[String(s.sellerB._id)]).toBe(ShipmentStatus.PLACED);
    expect(order.status).toBe(OrderStatus.PLACED); // the other seller's parcel is still coming

    const payment = (await Payment.findOne({ order: upi.id }))!;
    expect(payment.status).toBe(PaymentStatus.PAID);
    expect(payment.refundedAmount).toBe(500000);
    expect(await stockOf(s.chair._id)).toBe(10); // the chair went back on the shelf
  });

  it("cancels a blocked customer's cancellable orders but not ones already packed", async () => {
    const t = await team();
    const s = await shop();
    const fresh = await s.order([{ p: s.chair, sku: "CHAIR-1" }]);
    const packed = await s.order([{ p: s.lamp, sku: "LAMP-1" }]);
    const sellerB = await tokenFor(app, "b@seller.com");
    for (const action of ["confirm", "pack"]) {
      await request(app)
        .post(`/api/shipments/${packed.id}/${packed.shipments[0].id}/advance`)
        .set(bearer(sellerB))
        .send({ action });
    }

    const res = await decide(t.admin, s.buyer._id, {
      action: "block",
      reason: "Repeated chargebacks",
      activeOrders: "cancel",
    });
    expect(res.body.cancelledOrders).toBe(1);
    expect((await Order.findById(fresh.id))!.status).toBe(OrderStatus.CANCELLED);
    expect((await Order.findById(packed.id))!.status).toBe(OrderStatus.PROCESSING);
    expect(await stockOf(s.chair._id)).toBe(10);
  });
});

describe("dashboards, orders and the audit trail", () => {
  it("reports headline numbers", async () => {
    const t = await team();
    await makeUser("shop@example.com", Role.SELLER, AccountStatus.PENDING_APPROVAL);
    await makeUser("rider@example.com", Role.DELIVERY, AccountStatus.PENDING_APPROVAL);
    const res = await request(app).get("/api/admin/stats").set(bearer(t.admin));
    expect(res.body).toMatchObject({
      pendingSellers: 1,
      pendingDelivery: 1,
      productsAwaitingReview: 0,
      orders: { total: 0 },
      revenue: 0,
    });
    expect(res.body.users.admin).toBe(1);
  });

  it("shows a seller their own numbers, including low stock", async () => {
    const cat = await makeCategory("Chairs");
    const seller = await makeUser("a@seller.com", Role.SELLER);
    await makeProduct({
      title: "Almost Gone",
      category: String(cat._id),
      seller: String(seller._id),
      stock: 2,
      sku: "LOW-1",
    });
    await makeProduct({
      title: "Plenty",
      category: String(cat._id),
      seller: String(seller._id),
      stock: 50,
      sku: "OK-1",
    });
    const token = await tokenFor(app, "a@seller.com");
    const res = await request(app).get("/api/seller/stats").set(bearer(token));
    expect(res.body.products.active).toBe(2);
    expect(res.body.lowStock).toEqual([expect.objectContaining({ sku: "LOW-1", available: 2 })]);
  });

  it("lists orders for staff with the customer's name, and only lets the super admin read the audit log", async () => {
    const t = await team();
    const cat = await makeCategory("Chairs");
    const seller = await makeUser("a@seller.com", Role.SELLER);
    const chair = await makeProduct({
      title: "Oak Chair",
      category: String(cat._id),
      seller: String(seller._id),
      price: 5000,
      sku: "CHAIR-1",
    });
    await makeUser("buyer@example.com");
    const bt = await tokenFor(app, "buyer@example.com");
    const addr = await request(app).post("/api/addresses").set(bearer(bt)).send({
      fullName: "Maya",
      phone: "9876543210",
      line1: "12 Lake View Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
    });
    await request(app)
      .post("/api/checkout")
      .set(bearer(bt))
      .send({
        items: [{ productId: String(chair._id), sku: "CHAIR-1", qty: 1 }],
        addressId: addr.body.address.id,
        paymentMethod: "cod",
        idempotencyKey: "audit-order-1",
      });

    const orders = await request(app).get("/api/admin/orders").set(bearer(t.admin));
    expect(orders.body.items[0].customer).toMatchObject({ email: "buyer@example.com" });

    const audit = await request(app).get("/api/admin/audit").set(bearer(t.root));
    expect(audit.body.items.some((e: { action: string }) => e.action === "order.placed")).toBe(
      true,
    );
    expect((await request(app).get("/api/admin/audit").set(bearer(t.admin))).status).toBe(
      HttpStatus.FORBIDDEN,
    );
  });
});

describe("image uploads", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it("accepts a real image from an approved seller", async () => {
    await makeUser("a@seller.com", Role.SELLER);
    const token = await tokenFor(app, "a@seller.com");
    const res = await request(app)
      .post("/api/uploads/image")
      .set(bearer(token))
      .attach("file", png, { filename: "chair.png", contentType: "image/png" });
    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.url).toMatch(/^\/static\/uploads\/[0-9a-f]{24}\.png$/);
  });

  it("rejects a non-image even when it claims to be one", async () => {
    await makeUser("a@seller.com", Role.SELLER);
    const token = await tokenFor(app, "a@seller.com");
    const res = await request(app)
      .post("/api/uploads/image")
      .set(bearer(token))
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "evil.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.code).toBe(ErrorCode.UPLOAD_INVALID_FILE);
  });

  it("rejects oversized files and shoppers", async () => {
    await makeUser("a@seller.com", Role.SELLER);
    await makeUser("buyer@example.com");
    const seller = await tokenFor(app, "a@seller.com");
    const buyer = await tokenFor(app, "buyer@example.com");
    const big = Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]);
    const tooBig = await request(app)
      .post("/api/uploads/image")
      .set(bearer(seller))
      .attach("file", big, { filename: "big.png", contentType: "image/png" });
    expect(tooBig.status).toBe(HttpStatus.BAD_REQUEST);
    expect(tooBig.body.message).toContain("5 MB");
    expect(
      (
        await request(app)
          .post("/api/uploads/image")
          .set(bearer(buyer))
          .attach("file", png, { filename: "a.png", contentType: "image/png" })
      ).status,
    ).toBe(HttpStatus.FORBIDDEN);
  });
});
