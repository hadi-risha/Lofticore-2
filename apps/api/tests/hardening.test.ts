import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, HttpStatus, Role } from "@lofticore/shared";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { productionProblems, type ProdConfig } from "../src/config/production-checks";
import { connectDb, disconnectDb } from "../src/db/connect";
import { saveFile, UPLOAD_DIR } from "../src/lib/storage";
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

const good: ProdConfig = {
  JWT_ACCESS_SECRET: "9f2c1d7a4b8e3f60a5c9d2e1b7f4a8c3d6e0b9a2c5f8e1d4b7a0c3f6e9d2b5a8",
  PAYMENT_WEBHOOK_SECRET: "b3e7a1c9f5d2084e6a9c1f3b7d5e2a8c",
  CLIENT_ORIGIN: "https://shop.example.com",
  MONGO_URI: "mongodb+srv://user:pw@cluster0.mongodb.net/lofticore",
  STORAGE: "cloudinary",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "123",
  CLOUDINARY_API_SECRET: "secret",
};

describe("production start-up checks", () => {
  it("accepts a properly configured production environment", () => {
    expect(productionProblems(good)).toEqual([]);
    expect(productionProblems({ ...good, LOG_LEVEL: "debug" })).toHaveLength(1);
  });

  it("refuses placeholder secrets", () => {
    expect(
      productionProblems({ ...good, JWT_ACCESS_SECRET: "change-me-change-me-change-me-change-me" }),
    ).toHaveLength(1);
    expect(
      productionProblems({
        ...good,
        PAYMENT_WEBHOOK_SECRET: "dev-payment-webhook-secret-change-me",
      }),
    ).toHaveLength(1);
    expect(productionProblems({ ...good, SUPER_ADMIN_PASSWORD: "ChangeThisNow123" })).toHaveLength(
      1,
    );
  });

  it("refuses insecure origins and a local database", () => {
    const problems = productionProblems({
      ...good,
      CLIENT_ORIGIN: "https://shop.example.com,http://insecure.example.com",
      MONGO_URI: "mongodb://localhost:27017/x",
    });
    expect(problems).toHaveLength(2);
    expect(problems.join(" ")).toContain("https");
    expect(problems.join(" ")).toContain("localhost");
  });

  it("needs full credentials when Cloudinary is chosen", () => {
    expect(productionProblems({ ...good, CLOUDINARY_API_SECRET: undefined })[0]).toContain(
      "CLOUDINARY",
    );
  });
});

describe("file storage", () => {
  afterEach(() => {
    env.STORAGE = "local";
    vi.unstubAllGlobals();
  });

  it("saves to disk under a random name when local", async () => {
    const url = await saveFile(Buffer.from("hello"), "png");
    expect(url).toMatch(/^\/static\/uploads\/[0-9a-f]{24}\.png$/);
    const file = path.join(UPLOAD_DIR, path.basename(url));
    expect(existsSync(file)).toBe(true);
    rmSync(file);
  });

  it("uploads to Cloudinary with a correct signature and returns its https URL", async () => {
    env.STORAGE = "cloudinary";
    env.CLOUDINARY_CLOUD_NAME = "demo";
    env.CLOUDINARY_API_KEY = "key123";
    env.CLOUDINARY_API_SECRET = "s3cret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        secure_url: "https://res.cloudinary.com/demo/image/upload/v1/lofticore/a.png",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = await saveFile(Buffer.from("png-bytes"), "png", "image");
    expect(url).toBe("https://res.cloudinary.com/demo/image/upload/v1/lofticore/a.png");

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    const form = init.body as FormData;
    const timestamp = String(form.get("timestamp"));
    const expected = createHash("sha1")
      .update(`folder=lofticore&timestamp=${timestamp}s3cret`)
      .digest("hex");
    expect(form.get("signature")).toBe(expected);
    expect(form.get("api_key")).toBe("key123");
    // the secret itself is never sent
    expect([...form.values()].map(String).join(" ")).not.toContain("s3cret");

    // 3D models are "raw" files
    await saveFile(Buffer.from("glTF"), "glb", "model");
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.cloudinary.com/v1_1/demo/raw/upload");
  });

  it("fails politely when Cloudinary is down or says no", async () => {
    env.STORAGE = "cloudinary";
    env.CLOUDINARY_CLOUD_NAME = "demo";
    env.CLOUDINARY_API_KEY = "k";
    env.CLOUDINARY_API_SECRET = "s";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(saveFile(Buffer.from("x"), "png")).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "bad" } }) }),
    );
    await expect(saveFile(Buffer.from("x"), "png")).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });
});

describe("demo payments in production", () => {
  afterEach(() => {
    env.isProd = false;
    env.ALLOW_DEMO_PAYMENTS = false;
  });

  async function setup() {
    const cat = await makeCategory("Chairs");
    const seller = await makeUser("a@seller.com", Role.SELLER);
    await makeUser("buyer@example.com");
    const chair = await makeProduct({
      title: "Oak Chair",
      category: String(cat._id),
      seller: String(seller._id),
      price: 5000,
      sku: "CHAIR-1",
    });
    const token = await tokenFor(app, "buyer@example.com");
    const addr = await request(app).post("/api/addresses").set(bearer(token)).send({
      fullName: "Maya",
      phone: "9876543210",
      line1: "12 Lake View Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
    });
    const checkout = (method: "upi" | "cod", key: string) =>
      request(app)
        .post("/api/checkout")
        .set(bearer(token))
        .send({
          items: [{ productId: String(chair._id), sku: "CHAIR-1", qty: 1 }],
          addressId: addr.body.address.id,
          paymentMethod: method,
          idempotencyKey: key,
        });
    return { checkout };
  }

  it("is switched off by default: UPI checkout is refused, cash on delivery still works", async () => {
    const { checkout } = await setup();
    env.isProd = true;
    const upi = await checkout("upi", "prod-upi-1");
    expect(upi.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(upi.body.code).toBe(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    expect((await checkout("cod", "prod-cod-1")).status).toBe(HttpStatus.CREATED);
  });

  it("hides the demo UPI app unless explicitly allowed", async () => {
    const { checkout } = await setup();
    const order = (await checkout("upi", "demo-upi-1")).body.order;
    const token = order.payment.mockAppUrl.split("/").pop();

    env.isProd = true;
    expect((await request(app).get(`/api/mock-upi/${token}`)).status).toBe(HttpStatus.NOT_FOUND);
    expect(
      (
        await request(app)
          .post(`/api/mock-upi/${token}/respond`)
          .send({ decision: "approve", pin: "1234" })
      ).status,
    ).toBe(HttpStatus.NOT_FOUND);

    env.ALLOW_DEMO_PAYMENTS = true; // a staging site or public demo
    expect((await request(app).get(`/api/mock-upi/${token}`)).status).toBe(HttpStatus.OK);
  });
});

describe("responses", () => {
  it("compresses large JSON for clients that accept gzip", async () => {
    const cat = await makeCategory("Chairs");
    const seller = await makeUser("a@seller.com", Role.SELLER);
    for (let i = 0; i < 12; i++) {
      await makeProduct({
        title: `Oak Chair Number ${i}`,
        category: String(cat._id),
        seller: String(seller._id),
        sku: `CH-${i}-AAA`,
      });
    }
    const res = await request(app).get("/api/products?limit=24").set("Accept-Encoding", "gzip");
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.body.total).toBe(12);
  });
});
