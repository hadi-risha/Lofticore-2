import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ErrorCode, ProductStatus, Role, StockReason } from "@lofticore/shared";
import { connectDb, disconnectDb } from "../src/db/connect";
import { Product } from "../src/modules/catalog/product.model";
import { Reservation, StockMovement } from "../src/modules/inventory/inventory.model";
import {
  commitReservation,
  releaseExpiredReservations,
  releaseReservation,
  reserveStock,
} from "../src/modules/inventory/inventory.service";
import { ensureIndexes, makeCategory, makeProduct, makeUser, resetDb } from "./helpers";

beforeAll(async () => {
  await connectDb();
  await ensureIndexes();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
beforeEach(resetDb);

async function setup(stock: number) {
  const cat = await makeCategory("Chairs");
  const seller = await makeUser("seller@example.com", Role.SELLER);
  const buyer = await makeUser("buyer@example.com");
  const product = await makeProduct({
    title: "Test Chair",
    category: String(cat._id),
    seller: String(seller._id),
    stock,
    sku: "CHAIR-1",
  });
  return { product, productId: String(product._id), buyer: String(buyer._id), seller, cat };
}

const stockOf = async (id: string, sku = "CHAIR-1") => {
  const p = await Product.findById(id);
  const v = p!.variants.find((x) => x.sku === sku)!;
  return { available: v.available, reserved: v.reserved, sold: p!.soldCount, inStock: p!.inStock };
};

describe("reserving stock", () => {
  it("moves units from available to reserved", async () => {
    const { productId, buyer } = await setup(10);
    await reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 3 }]);
    expect(await stockOf(productId)).toMatchObject({ available: 7, reserved: 3 });
  });

  it("refuses more than what's available and says how many are left", async () => {
    const { productId, buyer } = await setup(2);
    await expect(
      reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 5 }]),
    ).rejects.toMatchObject({
      code: ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
      message: expect.stringContaining("Only 2"),
    });
    expect(await stockOf(productId)).toMatchObject({ available: 2, reserved: 0 });
  });

  it("is all-or-nothing across several items", async () => {
    const { productId, buyer, seller, cat } = await setup(10);
    const scarce = await makeProduct({
      title: "Rare Lamp",
      category: String(cat._id),
      seller: String(seller._id),
      stock: 1,
      sku: "LAMP-1",
    });

    await expect(
      reserveStock(buyer, [
        { productId, sku: "CHAIR-1", qty: 2 },
        { productId: String(scarce._id), sku: "LAMP-1", qty: 5 },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.INVENTORY_INSUFFICIENT_STOCK });

    // the chair hold was rolled back along with the failed lamp
    expect(await stockOf(productId)).toMatchObject({ available: 10, reserved: 0 });
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it("never sells the last unit twice, even under a rush", async () => {
    const { productId, buyer } = await setup(3);
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 1 }]),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    expect(await stockOf(productId)).toMatchObject({ available: 0, reserved: 3, inStock: false });
  });

  it("won't reserve products that aren't live", async () => {
    const { buyer, cat, seller } = await setup(5);
    const draft = await makeProduct({
      title: "Hidden",
      category: String(cat._id),
      seller: String(seller._id),
      stock: 5,
      sku: "HID-1",
      status: ProductStatus.DRAFT,
    });
    await expect(
      reserveStock(buyer, [{ productId: String(draft._id), sku: "HID-1", qty: 1 }]),
    ).rejects.toMatchObject({
      code: ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
    });
  });

  it("combines the same SKU listed twice into one line", async () => {
    const { productId, buyer } = await setup(10);
    const r = await reserveStock(buyer, [
      { productId, sku: "CHAIR-1", qty: 2 },
      { productId, sku: "CHAIR-1", qty: 3 },
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.qty).toBe(5);
  });
});

describe("releasing and committing", () => {
  it("puts released units back on the shelf, once", async () => {
    const { productId, buyer } = await setup(10);
    const r = await reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 4 }]);

    expect(await releaseReservation(String(r._id))).toBe(true);
    expect(await releaseReservation(String(r._id))).toBe(false); // second call is a no-op
    expect(await stockOf(productId)).toMatchObject({ available: 10, reserved: 0 });
  });

  it("turns held units into a sale", async () => {
    const { productId, buyer } = await setup(10);
    const r = await reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 4 }]);
    await commitReservation(String(r._id), "order-1");

    expect(await stockOf(productId)).toMatchObject({ available: 6, reserved: 0, sold: 4 });
    const sale = await StockMovement.findOne({ reason: StockReason.SALE });
    expect(sale).toMatchObject({ delta: -4, refId: "order-1" });
  });

  it("can't commit a hold that was already released", async () => {
    const { productId, buyer } = await setup(10);
    const r = await reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 1 }]);
    await releaseReservation(String(r._id));
    await expect(commitReservation(String(r._id), "order-2")).rejects.toMatchObject({
      code: ErrorCode.INVENTORY_RESERVATION_EXPIRED,
    });
  });

  it("frees stock from holds that ran out of time", async () => {
    const { productId, buyer } = await setup(10);
    const fresh = await reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 2 }]);
    const stale = await reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 3 }]);
    await Reservation.updateOne({ _id: stale._id }, { expiresAt: new Date(Date.now() - 1000) });

    expect(await releaseExpiredReservations()).toBe(1);
    expect(await stockOf(productId)).toMatchObject({ available: 8, reserved: 2 });
    expect((await Reservation.findById(fresh._id))!.status).toBe("held");
  });

  it("keeps a ledger of every change", async () => {
    const { productId, buyer } = await setup(10);
    const r = await reserveStock(buyer, [{ productId, sku: "CHAIR-1", qty: 2 }]);
    await commitReservation(String(r._id), "order-3");
    const reasons = (await StockMovement.find({ sku: "CHAIR-1" }).sort({ at: 1 })).map(
      (m) => m.reason,
    );
    expect(reasons).toEqual([StockReason.RESERVE, StockReason.SALE]);
  });
});
