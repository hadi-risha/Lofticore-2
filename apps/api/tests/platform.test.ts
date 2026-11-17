import type { AddressInfo } from "node:net";
import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductStatus, Role } from "@lofticore/shared";

// Meilisearch isn't running in tests; stand in for it so the ranking logic is exercised.
const { ranking } = vi.hoisted(() => ({ ranking: { ids: null as string[] | null } }));
vi.mock("../src/lib/search", () => ({
  searchIds: async () => ranking.ids,
  searchConfigured: () => false,
  searchHealth: async () => false,
  startSearchSync: () => () => {},
}));

import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/db/connect";
import { publish } from "../src/lib/realtime";
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

beforeAll(async () => {
  await connectDb();
  await ensureIndexes();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
beforeEach(resetDb);

describe("API docs and status", () => {
  it("serves an OpenAPI description built from the shared schemas", async () => {
    const res = await request(app).get("/api/docs/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    const login = res.body.paths["/auth/login"].post;
    expect(login.requestBody.content["application/json"].schema.properties).toHaveProperty("email");
    // public endpoints don't ask for a token
    expect(login.security).toEqual([]);
  });

  it("serves Swagger UI", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger");
  });

  it("reports the health of each dependency without leaking internals", async () => {
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("operational");
    const db = res.body.checks.find((c: { name: string }) => c.name === "Database");
    expect(db.state).toBe("up");
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb:\/\/|secret|password/i);
  });
});

describe("live updates (server-sent events)", () => {
  it("rejects a connection without a token", async () => {
    await request(app).get("/api/events").expect(401);
  });

  it("pushes an event to the signed-in user when something changes", async () => {
    const user = await makeUser("live@example.com", Role.CUSTOMER);
    const token = await tokenFor(app, "live@example.com");
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const abort = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      await reader.read(); // the opening "retry:" line

      publish([String(user._id)], { type: "order.placed", link: "/orders/1" });
      const { value } = await reader.read();
      expect(value).toContain("event: change");
      expect(value).toContain("order.placed");
    } finally {
      abort.abort();
      server.close();
    }
  });

  it("does not leak one user's events to another", async () => {
    await makeUser("a@example.com", Role.CUSTOMER);
    const other = await makeUser("b@example.com", Role.CUSTOMER);
    const token = await tokenFor(app, "a@example.com");
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const abort = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      await reader.read();
      publish([String(other._id)], { type: "order.placed" });
      const raced = await Promise.race([
        reader.read().then((r) => r.value),
        new Promise((r) => setTimeout(() => r("quiet"), 400)),
      ]);
      expect(raced).toBe("quiet");
    } finally {
      abort.abort();
      server.close();
    }
  });
});

describe("search ranking", () => {
  it("orders results the way the search engine ranked them", async () => {
    const cat = await makeCategory("Sofas");
    const seller = await makeUser("s@seller.com", Role.SELLER);
    const mk = (title: string) =>
      makeProduct({ title, category: String(cat._id), seller: String(seller._id) });
    const [a, b, c] = [await mk("Alpha Sofa"), await mk("Beta Sofa"), await mk("Gamma Sofa")];
    await Product.updateMany({}, { status: ProductStatus.ACTIVE });

    // the engine says: gamma first, then alpha; beta did not match
    ranking.ids = [String(c._id), String(a._id)];
    const res = await request(app).get("/api/products").query({ q: "sofaa", sort: "relevance" });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
      "Gamma Sofa",
      "Alpha Sofa",
    ]);
    expect(res.body.total).toBe(2);
    expect(String(b._id)).toBeTruthy();
    ranking.ids = null;
  });

  it("falls back to MongoDB text search when the engine is unavailable", async () => {
    const cat = await makeCategory("Sofas");
    const seller = await makeUser("s@seller.com", Role.SELLER);
    await makeProduct({
      title: "Walnut Bookshelf",
      category: String(cat._id),
      seller: String(seller._id),
    });
    await Product.updateMany({}, { status: ProductStatus.ACTIVE });
    ranking.ids = null;
    const res = await request(app).get("/api/products").query({ q: "bookshelf" });
    expect(res.body.items).toHaveLength(1);
    void bearer;
  });
});
