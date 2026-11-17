import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountStatus, ErrorCode, HttpStatus, ProductStatus, Role } from "@lofticore/shared";
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

beforeAll(async () => {
  await connectDb();
  await ensureIndexes();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
beforeEach(resetDb);

const validProduct = (categoryId: string, sku = "TBL-OAK-1") => ({
  title: "Oak Dining Table",
  description: "A solid oak dining table that seats six comfortably.",
  categoryId,
  tags: ["dining", "oak"],
  images: [{ url: "https://example.com/a.jpg" }],
  dimensions: { widthCm: 180, depthCm: 90, heightCm: 75 },
  variants: [{ sku, color: "Natural", price: 4500000, mrp: 5000000, stock: 5 }],
});

describe("categories", () => {
  it("returns a tree with children nested", async () => {
    const furniture = await makeCategory("Furniture");
    await makeCategory("Sofas", String(furniture._id));
    await makeCategory("Tables", String(furniture._id));
    await makeCategory("Decor");

    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.categories).toHaveLength(2);
    const f = res.body.categories.find((c: { name: string }) => c.name === "Furniture");
    expect(f.children.map((c: { name: string }) => c.name).sort()).toEqual(["Sofas", "Tables"]);
  });
});

describe("seller and admin workflow", () => {
  async function setup() {
    const cat = await makeCategory("Tables");
    await makeUser("seller@example.com", Role.SELLER);
    await makeUser("admin@example.com", Role.ADMIN);
    return {
      cat,
      seller: await tokenFor(app, "seller@example.com"),
      admin: await tokenFor(app, "admin@example.com"),
    };
  }

  it("keeps a new product hidden until an admin approves it", async () => {
    const { cat, seller, admin } = await setup();

    const created = await request(app)
      .post("/api/seller/products")
      .set(bearer(seller))
      .send(validProduct(String(cat._id)));
    expect(created.status).toBe(HttpStatus.CREATED);
    const { _id, slug } = created.body.product;
    expect(created.body.product.status).toBe(ProductStatus.DRAFT);

    // not public yet
    expect((await request(app).get(`/api/products/${slug}`)).status).toBe(HttpStatus.NOT_FOUND);

    await request(app)
      .post(`/api/seller/products/${_id}/submit`)
      .set(bearer(seller))
      .expect(HttpStatus.OK);
    expect((await request(app).get(`/api/products/${slug}`)).status).toBe(HttpStatus.NOT_FOUND);

    await request(app)
      .post(`/api/admin/products/${_id}/review`)
      .set(bearer(admin))
      .send({ decision: "approve" })
      .expect(HttpStatus.OK);

    const live = await request(app).get(`/api/products/${slug}`);
    expect(live.status).toBe(HttpStatus.OK);
    expect(live.body.product.price).toBe(4500000);
    expect(live.body.product.discountPct).toBe(10);
    expect(live.body.product.dimensions.widthCm).toBe(180);
  });

  it("sends a rejected product back to the seller with a note", async () => {
    const { cat, seller, admin } = await setup();
    const created = await request(app)
      .post("/api/seller/products")
      .set(bearer(seller))
      .send(validProduct(String(cat._id)));
    const id = created.body.product._id;
    await request(app).post(`/api/seller/products/${id}/submit`).set(bearer(seller));

    await request(app)
      .post(`/api/admin/products/${id}/review`)
      .set(bearer(admin))
      .send({ decision: "reject", note: "Photos are too dark." })
      .expect(HttpStatus.OK);

    const mine = await request(app).get(`/api/seller/products/${id}`).set(bearer(seller));
    expect(mine.body.product.status).toBe(ProductStatus.REJECTED);
    expect(mine.body.product.reviewNote).toBe("Photos are too dark.");
  });

  it("lets only approved sellers list products", async () => {
    const cat = await makeCategory("Tables");
    await makeUser("new@example.com", Role.SELLER, AccountStatus.PENDING_APPROVAL);
    const token = await tokenFor(app, "new@example.com");
    const res = await request(app)
      .post("/api/seller/products")
      .set(bearer(token))
      .send(validProduct(String(cat._id)));
    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.code).toBe(ErrorCode.AUTH_ACCOUNT_PENDING_APPROVAL);
  });

  it("keeps customers and anonymous users out of seller and admin routes", async () => {
    const { admin } = await setup();
    await makeUser("buyer@example.com");
    const buyer = await tokenFor(app, "buyer@example.com");

    expect((await request(app).get("/api/seller/products")).status).toBe(HttpStatus.UNAUTHORIZED);
    expect((await request(app).get("/api/seller/products").set(bearer(buyer))).status).toBe(
      HttpStatus.FORBIDDEN,
    );
    expect((await request(app).get("/api/admin/products").set(bearer(buyer))).status).toBe(
      HttpStatus.FORBIDDEN,
    );
    expect((await request(app).get("/api/admin/products").set(bearer(admin))).status).toBe(
      HttpStatus.OK,
    );
  });

  it("validates product input", async () => {
    const { cat, seller } = await setup();
    const bad = validProduct(String(cat._id));
    bad.variants[0]!.mrp = 100; // below price
    const res = await request(app).post("/api/seller/products").set(bearer(seller)).send(bad);
    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.fields["variants.0.mrp"]).toBeTruthy();
  });

  it("rejects a SKU another product already uses", async () => {
    const { cat, seller } = await setup();
    await request(app)
      .post("/api/seller/products")
      .set(bearer(seller))
      .send(validProduct(String(cat._id)))
      .expect(HttpStatus.CREATED);
    const dup = await request(app)
      .post("/api/seller/products")
      .set(bearer(seller))
      .send(validProduct(String(cat._id)));
    expect(dup.status).toBe(HttpStatus.CONFLICT);
    expect(dup.body.code).toBe(ErrorCode.CATALOG_SKU_TAKEN);
  });

  it("stops a seller touching another seller's product", async () => {
    const { cat, seller } = await setup();
    const created = await request(app)
      .post("/api/seller/products")
      .set(bearer(seller))
      .send(validProduct(String(cat._id)));
    const id = created.body.product._id;

    await makeUser("other@example.com", Role.SELLER);
    const other = await tokenFor(app, "other@example.com");
    expect(
      (
        await request(app)
          .patch(`/api/seller/products/${id}`)
          .set(bearer(other))
          .send({ title: "Hijacked" })
      ).status,
    ).toBe(HttpStatus.NOT_FOUND);
    expect(
      (
        await request(app)
          .post(`/api/seller/products/${id}/stock`)
          .set(bearer(other))
          .send({ sku: "TBL-OAK-1", delta: 5, reason: "restock" })
      ).status,
    ).toBe(HttpStatus.NOT_FOUND);
  });

  it("adjusts stock and refuses to go below zero", async () => {
    const { cat, seller } = await setup();
    const created = await request(app)
      .post("/api/seller/products")
      .set(bearer(seller))
      .send(validProduct(String(cat._id)));
    const id = created.body.product._id;

    await request(app)
      .post(`/api/seller/products/${id}/stock`)
      .set(bearer(seller))
      .send({ sku: "TBL-OAK-1", delta: 3, reason: "restock" })
      .expect(HttpStatus.NO_CONTENT);
    expect((await Product.findById(id))!.variants[0]!.available).toBe(8);

    const tooMuch = await request(app)
      .post(`/api/seller/products/${id}/stock`)
      .set(bearer(seller))
      .send({ sku: "TBL-OAK-1", delta: -20, reason: "damaged" });
    expect(tooMuch.status).toBe(HttpStatus.CONFLICT);
    expect(tooMuch.body.code).toBe(ErrorCode.INVENTORY_INSUFFICIENT_STOCK);
    expect((await Product.findById(id))!.variants[0]!.available).toBe(8);
  });

  it("never shows exact stock levels to shoppers", async () => {
    const { cat } = await setup();
    const seller = await makeUser("s2@example.com", Role.SELLER);
    const p = await makeProduct({
      title: "Plenty Stool",
      category: String(cat._id),
      seller: String(seller._id),
      stock: 500,
    });
    const res = await request(app).get(`/api/products/${p.slug}`);
    expect(res.body.product.variants[0].available).toBeLessThanOrEqual(10);
    expect(res.body.product.variants[0].reserved).toBeUndefined();
  });
});

describe("browsing, filtering and search", () => {
  async function shop() {
    const furniture = await makeCategory("Furniture");
    const sofas = await makeCategory("Sofas", String(furniture._id));
    const tables = await makeCategory("Tables", String(furniture._id));
    const decor = await makeCategory("Decor");
    const seller = String((await makeUser("seller@example.com", Role.SELLER))._id);
    const c = (x: { _id: unknown }) => String(x._id);

    await makeProduct({
      title: "Velvet Sofa",
      category: c(sofas),
      seller,
      price: 50000,
      sold: 40,
      rating: 4.8,
      material: "Velvet",
      color: "Green",
      tags: ["sofa", "living room"],
    });
    await makeProduct({
      title: "Leather Sofa",
      category: c(sofas),
      seller,
      price: 90000,
      sold: 10,
      rating: 4.2,
      material: "Leather",
      color: "Tan",
      tags: ["sofa"],
    });
    await makeProduct({
      title: "Oak Coffee Table",
      category: c(tables),
      seller,
      price: 15000,
      sold: 25,
      rating: 4.5,
      material: "Oak",
      color: "Natural",
      tags: ["coffee table"],
    });
    await makeProduct({
      title: "Glass Vase",
      category: c(decor),
      seller,
      price: 1500,
      sold: 70,
      rating: 3.9,
      material: "Glass",
      color: "Blue",
      tags: ["vase"],
    });
    await makeProduct({
      title: "Sold Out Stool",
      category: c(tables),
      seller,
      price: 5000,
      stock: 0,
      material: "Oak",
      color: "Natural",
    });
    await makeProduct({
      title: "Draft Lamp",
      category: c(decor),
      seller,
      price: 3000,
      status: ProductStatus.DRAFT,
    });
    return { furniture, sofas };
  }

  const list = (qs = "") => request(app).get(`/api/products${qs}`);
  const titles = (res: request.Response) => res.body.items.map((i: { title: string }) => i.title);

  it("lists only live products", async () => {
    await shop();
    const res = await list();
    expect(res.body.total).toBe(5);
    expect(titles(res)).not.toContain("Draft Lamp");
  });

  it("includes sub-categories when filtering by a parent", async () => {
    await shop();
    const res = await list("?category=furniture");
    expect(titles(res).sort()).toEqual([
      "Leather Sofa",
      "Oak Coffee Table",
      "Sold Out Stool",
      "Velvet Sofa",
    ]);
    expect(titles(await list("?category=sofas")).sort()).toEqual(["Leather Sofa", "Velvet Sofa"]);
    expect((await list("?category=nope")).body.total).toBe(0);
  });

  it("filters by price, stock, rating and material", async () => {
    await shop();
    expect(titles(await list("?minPrice=1000000&maxPrice=6000000"))).toEqual(
      expect.arrayContaining(["Velvet Sofa", "Oak Coffee Table"]),
    );
    expect(titles(await list("?minPrice=1000000&maxPrice=6000000"))).not.toContain("Leather Sofa");
    expect(titles(await list("?inStock=true"))).not.toContain("Sold Out Stool");
    expect(titles(await list("?rating=4.4")).sort()).toEqual(["Oak Coffee Table", "Velvet Sofa"]);
    expect(titles(await list("?material=oak,velvet")).sort()).toEqual([
      "Oak Coffee Table",
      "Sold Out Stool",
      "Velvet Sofa",
    ]);
    expect(titles(await list("?color=green"))).toEqual(["Velvet Sofa"]);
  });

  it("sorts by price, rating and popularity", async () => {
    await shop();
    expect((await list("?sort=price_asc")).body.items[0].title).toBe("Glass Vase");
    expect((await list("?sort=price_desc")).body.items[0].title).toBe("Leather Sofa");
    expect((await list("?sort=rating")).body.items[0].title).toBe("Velvet Sofa");
    expect((await list("?sort=popular")).body.items[0].title).toBe("Glass Vase");
  });

  it("paginates with totals", async () => {
    await shop();
    const p1 = await list("?limit=2&page=1&sort=price_asc");
    const p3 = await list("?limit=2&page=3&sort=price_asc");
    expect(p1.body).toMatchObject({ total: 5, pages: 3, page: 1, limit: 2 });
    expect(p1.body.items).toHaveLength(2);
    expect(p3.body.items).toHaveLength(1);
  });

  it("searches by whole word, and by prefix when the word is incomplete", async () => {
    await shop();
    expect(titles(await list("?q=sofa")).sort()).toEqual(["Leather Sofa", "Velvet Sofa"]);
    expect(titles(await list("?q=sof")).sort()).toEqual(["Leather Sofa", "Velvet Sofa"]);
    expect((await list("?q=zzzzqx")).body.total).toBe(0);
  });

  it("returns facets that ignore the current material/colour selection", async () => {
    await shop();
    const res = await list("?material=oak");
    const materials = res.body.facets.materials.map((m: { value: string }) => m.value);
    expect(materials).toEqual(expect.arrayContaining(["Oak", "Velvet", "Leather", "Glass"]));
    expect(res.body.facets.price.min).toBe(150000);
  });

  it("computes facets for the category being browsed", async () => {
    await shop();
    const res = await list("?category=furniture");
    expect(res.body.facets.materials.map((m: { value: string }) => m.value)).toEqual(
      expect.arrayContaining(["Oak", "Velvet", "Leather"]),
    );
    expect(res.body.facets.materials.map((m: { value: string }) => m.value)).not.toContain("Glass");
    expect(res.body.facets.price).toEqual({ min: 500000, max: 9000000 });
  });

  it("rejects nonsense query values", async () => {
    expect((await list("?sort=sideways")).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect((await list("?limit=9999")).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it("suggests products and categories while typing", async () => {
    await shop();
    const res = await request(app).get("/api/products/suggest?q=sof");
    const labels = res.body.suggestions.map((s: { label: string }) => s.label);
    expect(labels).toEqual(expect.arrayContaining(["Sofas", "Velvet Sofa", "Leather Sofa"]));
    expect((await request(app).get("/api/products/suggest?q=s")).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it("ranks best sellers by units sold and skips sold-out items", async () => {
    await shop();
    const res = await request(app).get("/api/products/best-sellers?limit=3");
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
      "Glass Vase",
      "Velvet Sofa",
      "Oak Coffee Table",
    ]);
  });

  it("suggests related products from the same category, closest tags first", async () => {
    await shop();
    const velvet = (await list("?q=velvet")).body.items[0];
    const res = await request(app).get(`/api/products/${velvet.slug}/related`);
    expect(titles(res)).toEqual(["Leather Sofa"]);
  });
});
