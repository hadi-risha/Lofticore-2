import request from "supertest";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpStatus, Role } from "@lofticore/shared";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { connectDb, disconnectDb } from "../src/db/connect";
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
afterEach(() => {
  env.GEMINI_API_KEY = undefined;
  vi.unstubAllGlobals();
});

const ask = (message: string, token?: string, history: object[] = []) => {
  const r = request(app).post("/api/assistant/chat");
  return (token ? r.set(bearer(token)) : r).send({ message, history });
};

describe("the built-in guide", () => {
  it("greets people and says thanks back", async () => {
    const hi = await ask("Hello!");
    expect(hi.body.reply).toContain("Lofti");
    expect(hi.body.suggestions.length).toBeGreaterThan(0);
    expect((await ask("thanks a lot")).body.reply).toContain("welcome");
  });

  it("answers from the same numbers the shop really uses", async () => {
    const delivery = await ask("What are the delivery charges?");
    expect(delivery.body.source).toBe("rules");
    expect(delivery.body.reply).toContain("₹10,000");
    expect(delivery.body.reply).toContain("₹499");

    const pay = await ask("how do I pay? can I use UPI or COD");
    expect(pay.body.reply).toContain("UPI");
    expect(pay.body.reply).toContain("₹50,000");
    expect(pay.body.reply).toContain("₹15,000");
  });

  it("tells people about the delivery code, cancelling, returns, selling and AR", async () => {
    expect((await ask("what is the delivery code?")).body.reply).toContain("4-digit");
    expect((await ask("can I cancel my order")).body.reply).toContain("packed");
    expect((await ask("my sofa arrived damaged")).body.reply).toContain(
      "Something wrong with this order",
    );
    const sell = await ask("how do I become a seller");
    expect(sell.body.links[0].to).toBe("/register?role=seller");
    expect((await ask("can I see it in my room with AR?")).body.reply).toContain(
      "View in your room",
    );
  });

  it("links to the right page for a forgotten password", async () => {
    const res = await ask("I forgot password and can't log in");
    expect(res.body.links).toEqual([{ label: "Reset my password", to: "/forgot-password" }]);
  });

  it("offers the guided tour", async () => {
    const res = await ask("show me around");
    expect(res.body.action).toBe("start_tour");
  });

  it("falls back to friendly options when it can't help, without a language model", async () => {
    const res = await ask("qwxzy blorp");
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.source).toBe("rules");
    expect(res.body.reply).toContain("not sure");
    expect(res.body.suggestions).toContain("Track my order");
  });
});

describe("finding products", () => {
  async function stock() {
    const cat = await makeCategory("Sofas");
    const seller = await makeUser("a@seller.com", Role.SELLER);
    await makeProduct({
      title: "Cloud Boucle Sofa",
      category: String(cat._id),
      seller: String(seller._id),
      tags: ["sofa"],
    });
    await makeProduct({
      title: "Tan Leather Sofa",
      category: String(cat._id),
      seller: String(seller._id),
      tags: ["sofa"],
    });
    await makeProduct({
      title: "Brass Table Lamp",
      category: String(cat._id),
      seller: String(seller._id),
      tags: ["lamp"],
    });
  }

  it("shows matching products with a link to all results", async () => {
    await stock();
    const res = await ask("show me sofas");
    expect(res.body.source).toBe("search");
    expect(res.body.products.map((p: { title: string }) => p.title).sort()).toEqual([
      "Cloud Boucle Sofa",
      "Tan Leather Sofa",
    ]);
    expect(res.body.links[0].to).toBe("/shop?q=sofas");
  });

  it("understands a bare product word and polite phrasing", async () => {
    await stock();
    expect((await ask("do you have any lamp please")).body.products[0].title).toBe(
      "Brass Table Lamp",
    );
    expect((await ask("lamp")).body.products).toHaveLength(1);
  });

  it("doesn't mistake 'show me around' for a product search", async () => {
    await stock();
    const res = await ask("show me around");
    expect(res.body.products).toBeUndefined();
    expect(res.body.action).toBe("start_tour");
  });
});

describe("order tracking", () => {
  it("asks guests to sign in", async () => {
    const res = await ask("where is my order");
    expect(res.body.links[0].to).toBe("/login");
  });

  it("lists only the signed-in customer's own orders", async () => {
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
    await makeUser("other@example.com");
    const buyer = await tokenFor(app, "buyer@example.com");
    const other = await tokenFor(app, "other@example.com");

    expect((await ask("track my order", buyer)).body.reply).toContain("haven't placed any orders");

    const addr = await request(app).post("/api/addresses").set(bearer(buyer)).send({
      fullName: "Maya",
      phone: "9876543210",
      line1: "12 Lake View Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
    });
    const order = (
      await request(app)
        .post("/api/checkout")
        .set(bearer(buyer))
        .send({
          items: [{ productId: String(chair._id), sku: "CHAIR-1", qty: 1 }],
          addressId: addr.body.address.id,
          paymentMethod: "cod",
          idempotencyKey: "assistant-order-1",
        })
    ).body.order;

    const mine = await ask("where is my order?", buyer);
    expect(mine.body.reply).toContain(order.orderNumber);
    expect(mine.body.reply).toContain("booked");
    expect(mine.body.links[0].to).toBe(`/orders/${order.id}`);

    const theirs = await ask("where is my order?", other);
    expect(theirs.body.reply).not.toContain(order.orderNumber);
  });
});

describe("input rules", () => {
  it("rejects empty, huge and over-long conversations", async () => {
    expect((await ask("   ")).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect((await ask("x".repeat(501))).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    const history = Array.from({ length: 7 }, () => ({ role: "user", text: "hi" }));
    expect((await ask("hello", undefined, history)).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });
});

describe("the language model fallback", () => {
  const reply = (text: string) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });

  it("only runs for questions the guide can't answer, and sends no personal details", async () => {
    env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(reply("A walnut table suits a sunny room best."));
    vi.stubGlobal("fetch", fetchMock);

    await makeUser("secret.person@example.com");
    const token = await tokenFor(app, "secret.person@example.com");

    // covered by the guide: the model is never called
    await ask("how much is delivery", token);
    expect(fetchMock).not.toHaveBeenCalled();

    const res = await ask("which wood goes best in a sunny reading nook?", token, [
      { role: "user", text: "hi" },
    ]);
    expect(res.body).toMatchObject({
      source: "ai",
      reply: "A walnut table suits a sunny room best.",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    expect(url).not.toContain("test-key"); // the key travels in a header, never in the URL
    expect(init.body).not.toContain("secret.person");
    expect(init.body).toContain("Lofticore");
  });

  it("falls back politely when the model is down", async () => {
    env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const res = await ask("which wood goes best in a sunny reading nook?");
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.source).toBe("rules");
    expect(res.body.reply).toContain("not sure");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
    );
    expect((await ask("which wood goes best in a sunny reading nook?")).body.source).toBe("rules");
  });
});

describe("3D model uploads", () => {
  const glb = Buffer.concat([
    Buffer.from("glTF"),
    Buffer.from([2, 0, 0, 0, 20, 0, 0, 0]),
    Buffer.alloc(32),
  ]);

  it("accepts a real .glb from an approved seller", async () => {
    await makeUser("a@seller.com", Role.SELLER);
    const token = await tokenFor(app, "a@seller.com");
    const res = await request(app)
      .post("/api/uploads/model")
      .set(bearer(token))
      .attach("file", glb, { filename: "chair.glb", contentType: "model/gltf-binary" });
    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.url).toMatch(/^\/static\/uploads\/[0-9a-f]{24}\.glb$/);
  });

  it("rejects other files pretending to be models, and shoppers", async () => {
    await makeUser("a@seller.com", Role.SELLER);
    await makeUser("buyer@example.com");
    const seller = await tokenFor(app, "a@seller.com");
    const buyer = await tokenFor(app, "buyer@example.com");
    const fake = await request(app)
      .post("/api/uploads/model")
      .set(bearer(seller))
      .attach("file", Buffer.from("<html>not a model</html>"), {
        filename: "chair.glb",
        contentType: "model/gltf-binary",
      });
    expect(fake.status).toBe(HttpStatus.BAD_REQUEST);
    expect(
      (
        await request(app)
          .post("/api/uploads/model")
          .set(bearer(buyer))
          .attach("file", glb, { filename: "chair.glb" })
      ).status,
    ).toBe(HttpStatus.FORBIDDEN);
  });
});
