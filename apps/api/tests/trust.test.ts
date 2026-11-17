import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ErrorCode, HttpStatus, ProductStatus, ReportStatus, Role } from "@lofticore/shared";
import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/db/connect";
import { Product } from "../src/modules/catalog/product.model";
import { Notification } from "../src/modules/notifications/notification.module";
import { Review } from "../src/modules/reviews/review.module";
import { refreshTrending } from "../src/modules/recommendations/recommendation.module";
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

const address = {
  fullName: "Maya Iyer",
  phone: "9876543210",
  line1: "12 Lake View Road",
  city: "Kochi",
  state: "Kerala",
  pincode: "682001",
};
let n = 0;

async function shop() {
  const cat = await makeCategory("Chairs");
  const tables = await makeCategory("Tables");
  const seller = await makeUser("a@seller.com", Role.SELLER);
  await makeUser("buyer@example.com");
  await makeUser("other@example.com");
  await makeUser("admin@example.com", Role.ADMIN);
  await makeUser("agent@example.com", Role.DELIVERY);
  const chair = await makeProduct({
    title: "Oak Chair",
    category: String(cat._id),
    seller: String(seller._id),
    price: 5000,
    sku: "CHAIR-1",
    tags: ["oak", "seating"],
  });
  const stool = await makeProduct({
    title: "Oak Stool",
    category: String(cat._id),
    seller: String(seller._id),
    price: 3000,
    sku: "STOOL-1",
    tags: ["oak"],
  });
  const table = await makeProduct({
    title: "Oak Table",
    category: String(tables._id),
    seller: String(seller._id),
    price: 9000,
    sku: "TABLE-1",
    tags: ["oak", "dining"],
  });
  const lamp = await makeProduct({
    title: "Brass Lamp",
    category: String(tables._id),
    seller: String(seller._id),
    price: 2000,
    sku: "LAMP-1",
    tags: ["brass"],
  });
  const t = {
    buyer: await tokenFor(app, "buyer@example.com"),
    other: await tokenFor(app, "other@example.com"),
    seller: await tokenFor(app, "a@seller.com"),
    admin: await tokenFor(app, "admin@example.com"),
    agent: await tokenFor(app, "agent@example.com"),
  };
  return { cat, seller, chair, stool, table, lamp, t };
}
type W = Awaited<ReturnType<typeof shop>>;

async function buy(
  w: W,
  token: string,
  products: { p: { _id: unknown }; sku: string }[],
  pay: "cod" | "upi" = "cod",
) {
  const addr = await request(app).post("/api/addresses").set(bearer(token)).send(address);
  const res = await request(app)
    .post("/api/checkout")
    .set(bearer(token))
    .send({
      items: products.map((x) => ({ productId: String(x.p._id), sku: x.sku, qty: 1 })),
      addressId: addr.body.address.id,
      paymentMethod: pay,
      idempotencyKey: `trust-${n++}-${Date.now()}`,
    });
  return res.body.order;
}

// takes an order all the way to delivered
async function deliver(w: W, order: { id: string; shipments: { id: string }[] }) {
  const agent = await mongoose.model("User").findOne({ email: "agent@example.com" });
  for (const s of order.shipments) {
    const adv = (token: string, body: object) =>
      request(app).post(`/api/shipments/${order.id}/${s.id}/advance`).set(bearer(token)).send(body);
    await adv(w.t.seller, { action: "confirm" });
    await adv(w.t.seller, { action: "pack" });
    await adv(w.t.seller, { action: "ship" });
    await request(app)
      .post(`/api/admin/shipments/${order.id}/${s.id}/assign`)
      .set(bearer(w.t.admin))
      .send({ agentId: String(agent!._id) });
    await adv(w.t.agent, { action: "out_for_delivery" });
    const code = (await request(app).get(`/api/orders/${order.id}`).set(bearer(w.t.buyer))).body
      .order.shipments[0].deliveryCode;
    await adv(w.t.agent, { action: "deliver", deliveryCode: code });
  }
}

describe("reviews", () => {
  it("only lets people who received the product review it", async () => {
    const w = await shop();
    const post = (token: string) =>
      request(app)
        .post(`/api/products/${w.chair.slug}/reviews`)
        .set(bearer(token))
        .send({ rating: 5, body: "Lovely chair, very sturdy." });

    expect(
      (
        await request(app)
          .post(`/api/products/${w.chair.slug}/reviews`)
          .send({ rating: 5, body: "Lovely chair." })
      ).status,
    ).toBe(HttpStatus.UNAUTHORIZED);
    const before = await post(w.t.buyer);
    expect(before.status).toBe(HttpStatus.FORBIDDEN);
    expect(before.body.code).toBe(ErrorCode.REVIEW_NOT_ELIGIBLE);

    const order = await buy(w, w.t.buyer, [{ p: w.chair, sku: "CHAIR-1" }]);
    // ordered but not delivered yet
    expect((await post(w.t.buyer)).status).toBe(HttpStatus.FORBIDDEN);
    expect(
      (
        await request(app)
          .get(`/api/products/${w.chair.slug}/review-eligibility`)
          .set(bearer(w.t.buyer))
      ).body.eligible,
    ).toBe(false);

    await deliver(w, order);
    expect(
      (
        await request(app)
          .get(`/api/products/${w.chair.slug}/review-eligibility`)
          .set(bearer(w.t.buyer))
      ).body.eligible,
    ).toBe(true);
    expect((await post(w.t.buyer)).status).toBe(HttpStatus.CREATED);
    // someone else who never bought it still can't
    expect((await post(w.t.other)).status).toBe(HttpStatus.FORBIDDEN);
  });

  it("updates the product's rating, one review each, with edit and delete", async () => {
    const w = await shop();
    const order = await buy(w, w.t.buyer, [{ p: w.chair, sku: "CHAIR-1" }]);
    await deliver(w, order);
    const url = `/api/products/${w.chair.slug}/reviews`;

    const created = await request(app)
      .post(url)
      .set(bearer(w.t.buyer))
      .send({ rating: 4, title: "Solid", body: "Sturdy and comfortable for the price." });
    expect(created.body.review.author).toBe("buyer"); // test user has a one-word name
    expect(await Product.findById(w.chair._id)).toMatchObject({ ratingAvg: 4, ratingCount: 1 });

    const dup = await request(app)
      .post(url)
      .set(bearer(w.t.buyer))
      .send({ rating: 5, body: "Trying to post twice here." });
    expect(dup.status).toBe(HttpStatus.CONFLICT);
    expect(dup.body.code).toBe(ErrorCode.REVIEW_ALREADY_EXISTS);

    const id = created.body.review.id;
    await request(app)
      .patch(`/api/reviews/${id}`)
      .set(bearer(w.t.buyer))
      .send({ rating: 2, body: "Changed my mind about this one." })
      .expect(HttpStatus.OK);
    expect((await Product.findById(w.chair._id))!.ratingAvg).toBe(2);
    // nobody else can edit or delete it
    expect(
      (
        await request(app)
          .patch(`/api/reviews/${id}`)
          .set(bearer(w.t.other))
          .send({ rating: 5, body: "Hijacking this review." })
      ).status,
    ).toBe(HttpStatus.NOT_FOUND);

    await request(app)
      .delete(`/api/reviews/${id}`)
      .set(bearer(w.t.buyer))
      .expect(HttpStatus.NO_CONTENT);
    expect(await Product.findById(w.chair._id)).toMatchObject({ ratingAvg: 0, ratingCount: 0 });
  });

  it("validates the form", async () => {
    const w = await shop();
    const order = await buy(w, w.t.buyer, [{ p: w.chair, sku: "CHAIR-1" }]);
    await deliver(w, order);
    const res = await request(app)
      .post(`/api/products/${w.chair.slug}/reviews`)
      .set(bearer(w.t.buyer))
      .send({ rating: 9, body: "short" });
    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.fields.rating).toBeTruthy();
    expect(res.body.fields.body).toBeTruthy();
  });

  it("lists reviews with a summary, sorted, and lets others mark them helpful", async () => {
    const w = await shop();
    const ids: string[] = [];
    for (const [i, rating] of [5, 3, 4].entries()) {
      const email = `r${i}@example.com`;
      await makeUser(email);
      const token = await tokenFor(app, email);
      const buyer = await mongoose.model("User").findOne({ email });
      await Review.create({
        product: w.chair._id,
        user: buyer!._id,
        authorName: `Reviewer ${i}`,
        rating,
        body: `A review number ${i}, long enough.`,
      });
      ids.push(token);
    }
    const list = await request(app).get(`/api/products/${w.chair.slug}/reviews?sort=lowest`);
    expect(list.body.summary).toMatchObject({
      average: 4,
      count: 3,
      distribution: { 5: 1, 4: 1, 3: 1, 2: 0, 1: 0 },
    });
    expect(list.body.items.map((r: { rating: number }) => r.rating)).toEqual([3, 4, 5]);
    // names are shortened to a first name and last initial
    expect(list.body.items[0].author).toBe("Reviewer 1.");
    const lowest = list.body.items[0];

    // voting: toggles, and you can't vote on your own
    const vote = await request(app)
      .post(`/api/reviews/${lowest.id}/helpful`)
      .set(bearer(w.t.buyer));
    expect(vote.body).toEqual({ helpful: true, count: 1 });
    const again = await request(app)
      .post(`/api/reviews/${lowest.id}/helpful`)
      .set(bearer(w.t.buyer));
    expect(again.body).toEqual({ helpful: false, count: 0 });
    expect(
      (await request(app).post(`/api/reviews/${lowest.id}/helpful`).set(bearer(ids[1]!))).status,
    ).toBe(HttpStatus.BAD_REQUEST);
  });
});

describe("reporting problems", () => {
  const report = (token: string, body: object) =>
    request(app).post("/api/reports").set(bearer(token)).send(body);

  it("takes a report, rejects duplicates, and keeps people to their own orders", async () => {
    const w = await shop();
    const order = await buy(w, w.t.buyer, [{ p: w.chair, sku: "CHAIR-1" }]);
    const body = {
      targetType: "order",
      targetId: order.id,
      reason: "not_delivered",
      details: "It's been two weeks and nothing has come.",
    };

    expect((await report(w.t.buyer, body)).status).toBe(HttpStatus.CREATED);
    const dup = await report(w.t.buyer, body);
    expect(dup.status).toBe(HttpStatus.CONFLICT);
    expect(dup.body.code).toBe(ErrorCode.REPORT_DUPLICATE);
    // somebody else's order is invisible to them
    expect((await report(w.t.other, body)).status).toBe(HttpStatus.NOT_FOUND);
    expect((await report(w.t.buyer, { ...body, details: "short" })).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    const mine = await request(app).get("/api/reports/mine").set(bearer(w.t.buyer));
    expect(mine.body.items[0]).toMatchObject({
      targetLabel: order.orderNumber,
      status: ReportStatus.OPEN,
    });
  });

  it("limits how many reports one person can file in a day", async () => {
    const w = await shop();
    const reasons = [
      "counterfeit",
      "not_as_described",
      "not_delivered",
      "damaged",
      "scam",
      "abusive",
    ];
    const results = [];
    for (const reason of reasons) {
      results.push(
        await report(w.t.buyer, {
          targetType: "product",
          targetId: String(w.chair._id),
          reason,
          details: "This listing looks wrong to me.",
        }),
      );
    }
    expect(results.slice(0, 5).every((r) => r.status === HttpStatus.CREATED)).toBe(true);
    expect(results[5]!.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(results[5]!.body.code).toBe(ErrorCode.REPORT_LIMIT);
  });

  it("lets an admin resolve a report, hide the review, and tells the reporter", async () => {
    const w = await shop();
    const author = await makeUser("author@example.com");
    const review = await Review.create({
      product: w.chair._id,
      user: author._id,
      authorName: "Mean Person",
      rating: 1,
      body: "Abusive text that breaks the rules.",
    });
    await Product.updateOne({ _id: w.chair._id }, { ratingAvg: 1, ratingCount: 1 });

    const created = await report(w.t.buyer, {
      targetType: "review",
      targetId: String(review._id),
      reason: "abusive",
      details: "This review attacks the seller personally.",
    });
    const queue = await request(app).get("/api/admin/reports").set(bearer(w.t.admin));
    expect(queue.body.items[0]).toMatchObject({
      targetType: "review",
      reportsOnTarget: 1,
      reporter: { email: "buyer@example.com" },
    });

    const resolved = await request(app)
      .post(`/api/admin/reports/${created.body.report.id}/resolve`)
      .set(bearer(w.t.admin))
      .send({
        status: "resolved",
        note: "Review removed for abusive language.",
        action: "hide_review",
      });
    expect(resolved.status).toBe(HttpStatus.OK);
    expect((await Review.findById(review._id))!.visible).toBe(false);
    expect(await Product.findById(w.chair._id)).toMatchObject({ ratingCount: 0 });

    const notice = await Notification.findOne({ type: "report.resolved" });
    expect(notice!.body).toBe("Review removed for abusive language.");

    // already handled
    const again = await request(app)
      .post(`/api/admin/reports/${created.body.report.id}/resolve`)
      .set(bearer(w.t.admin))
      .send({ status: "dismissed", note: "Second try here." });
    expect(again.status).toBe(HttpStatus.CONFLICT);
    // customers can't use the admin queue
    expect((await request(app).get("/api/admin/reports").set(bearer(w.t.buyer))).status).toBe(
      HttpStatus.FORBIDDEN,
    );
  });

  it("can pull a product off sale from a report", async () => {
    const w = await shop();
    const created = await report(w.t.buyer, {
      targetType: "product",
      targetId: String(w.chair._id),
      reason: "counterfeit",
      details: "This is a knock-off of a famous design.",
    });
    await request(app)
      .post(`/api/admin/reports/${created.body.report.id}/resolve`)
      .set(bearer(w.t.admin))
      .send({ status: "resolved", note: "Listing suspended.", action: "suspend_product" })
      .expect(HttpStatus.OK);
    expect((await Product.findById(w.chair._id))!.status).toBe(ProductStatus.SUSPENDED);
  });
});

describe("new-account cash on delivery limit", () => {
  it("caps cash on delivery for brand-new accounts only", async () => {
    const w = await shop();
    await makeUser("fresh@example.com", Role.CUSTOMER, undefined, 0);
    const fresh = await tokenFor(app, "fresh@example.com");
    // ₹17,000 of furniture
    await request(app).post("/api/addresses").set(bearer(fresh)).send(address);
    const res = await request(app)
      .post("/api/checkout")
      .set(bearer(fresh))
      .send({
        items: [
          { productId: String(w.table._id), sku: "TABLE-1", qty: 1 },
          { productId: String(w.chair._id), sku: "CHAIR-1", qty: 1 },
          { productId: String(w.stool._id), sku: "STOOL-1", qty: 1 },
        ],
        addressId: (await request(app).get("/api/addresses").set(bearer(fresh))).body.addresses[0]
          .id,
        paymentMethod: "cod",
        idempotencyKey: "fresh-cod-big",
      });
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.code).toBe(ErrorCode.ORDER_COD_NOT_AVAILABLE);
    expect(res.body.message).toContain("New accounts");

    // the same basket is fine for an established customer
    const ok = await buy(w, w.t.buyer, [
      { p: w.table, sku: "TABLE-1" },
      { p: w.chair, sku: "CHAIR-1" },
      { p: w.stool, sku: "STOOL-1" },
    ]);
    expect(ok.status).toBe("placed");
  });
});

describe("notifications", () => {
  it("tells the buyer and the seller about a new order, and the buyer as it ships and arrives", async () => {
    const w = await shop();
    const order = await buy(w, w.t.buyer, [{ p: w.chair, sku: "CHAIR-1" }]);

    const seller = await request(app).get("/api/notifications").set(bearer(w.t.seller));
    expect(seller.body.items[0]).toMatchObject({
      type: "order.new",
      read: false,
      link: "/seller/orders",
    });
    const buyer = await request(app).get("/api/notifications").set(bearer(w.t.buyer));
    expect(buyer.body.items[0]).toMatchObject({
      type: "order.placed",
      link: `/orders/${order.id}`,
    });
    expect(buyer.body.unread).toBe(1);

    await deliver(w, order);
    const types = (
      await request(app).get("/api/notifications").set(bearer(w.t.buyer))
    ).body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "shipment.shipped",
        "shipment.out_for_delivery",
        "shipment.delivered",
      ]),
    );
  });

  it("marks one or all as read, and keeps them private", async () => {
    const w = await shop();
    await buy(w, w.t.buyer, [{ p: w.chair, sku: "CHAIR-1" }]);
    const list = await request(app).get("/api/notifications").set(bearer(w.t.buyer));
    const id = list.body.items[0].id;

    // someone else's attempt to mark it read does nothing
    await request(app)
      .post(`/api/notifications/${id}/read`)
      .set(bearer(w.t.other))
      .expect(HttpStatus.NO_CONTENT);
    expect((await request(app).get("/api/notifications").set(bearer(w.t.buyer))).body.unread).toBe(
      1,
    );
    expect(
      (await request(app).get("/api/notifications").set(bearer(w.t.other))).body.items,
    ).toHaveLength(0);

    await request(app)
      .post(`/api/notifications/${id}/read`)
      .set(bearer(w.t.buyer))
      .expect(HttpStatus.NO_CONTENT);
    expect((await request(app).get("/api/notifications").set(bearer(w.t.buyer))).body.unread).toBe(
      0,
    );

    await request(app)
      .post("/api/notifications/read-all")
      .set(bearer(w.t.seller))
      .expect(HttpStatus.NO_CONTENT);
    expect((await request(app).get("/api/notifications").set(bearer(w.t.seller))).body.unread).toBe(
      0,
    );
    expect((await request(app).get("/api/notifications")).status).toBe(HttpStatus.UNAUTHORIZED);
  });
});

describe("recommendations", () => {
  it("suggests what other customers bought together", async () => {
    const w = await shop();
    // three people bought chair + lamp, one bought chair + table
    for (const email of ["x1@example.com", "x2@example.com", "x3@example.com"]) {
      await makeUser(email);
      await buy(w, await tokenFor(app, email), [
        { p: w.chair, sku: "CHAIR-1" },
        { p: w.lamp, sku: "LAMP-1" },
      ]);
    }
    await buy(w, w.t.other, [
      { p: w.chair, sku: "CHAIR-1" },
      { p: w.table, sku: "TABLE-1" },
    ]);

    const res = await request(app).get(
      `/api/recommendations/bought-together?ids=${w.chair._id}&limit=2`,
    );
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
      "Brass Lamp",
      "Oak Table",
    ]);
  }, 90_000); // signs up and buys as five different people

  it("tops thin purchase history up with similar products", async () => {
    const w = await shop();
    const res = await request(app).get(
      `/api/recommendations/bought-together?ids=${w.chair._id}&limit=3`,
    );
    // nobody has bought anything, so it falls back to same-category and shared tags
    expect(res.body.items[0].title).toBe("Oak Stool");
    expect(res.body.items.map((i: { title: string }) => i.title)).not.toContain("Oak Chair");
  });

  it("personalises from what you wished for and bought, and never repeats purchases", async () => {
    const w = await shop();
    await buy(w, w.t.buyer, [{ p: w.chair, sku: "CHAIR-1" }]);
    const res = await request(app)
      .get("/api/recommendations/for-you?limit=4")
      .set(bearer(w.t.buyer));
    const titles = res.body.items.map((i: { title: string }) => i.title);
    expect(res.body.personalised).toBe(true);
    expect(titles[0]).toBe("Oak Stool");
    expect(titles).not.toContain("Oak Chair");
  });

  it("falls back to popular products for strangers, and uses what they've viewed", async () => {
    const w = await shop();
    await Product.updateOne({ _id: w.lamp._id }, { trendScore: 99 });
    const stranger = await request(app).get("/api/recommendations/for-you?limit=2");
    expect(stranger.body.personalised).toBe(false);
    expect(stranger.body.items[0].title).toBe("Brass Lamp");

    const viewed = await request(app).get(
      `/api/recommendations/for-you?limit=2&viewed=${w.table._id}`,
    );
    expect(viewed.body.personalised).toBe(true);
    expect(viewed.body.items.map((i: { title: string }) => i.title)).not.toContain("Oak Table");
  });

  it("ignores junk ids and turns recently-viewed ids into cards", async () => {
    const w = await shop();
    const res = await request(app).get(`/api/recommendations/by-ids?ids=nope,${w.chair._id},123`);
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.items).toHaveLength(1);
  });

  it("ranks best sellers by recent demand and rating, via the job", async () => {
    const w = await shop();
    // the lamp sold a lot long ago; the stool is selling now
    await Product.updateOne({ _id: w.lamp._id }, { soldCount: 100 });
    await buy(w, w.t.buyer, [{ p: w.stool, sku: "STOOL-1" }]);
    await buy(w, w.t.other, [{ p: w.stool, sku: "STOOL-1" }]);
    expect(await refreshTrending()).toBe(4);

    const res = await request(app).get("/api/products/best-sellers?limit=2");
    expect(res.body.items[0].title).toBe("Oak Stool");
  });
});
