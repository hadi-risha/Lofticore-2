import mongoose, { type ClientSession, type Types } from "mongoose";
import { ErrorCode, HttpStatus, ProductStatus, StockReason } from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { Product } from "../catalog/product.model";
import {
  Reservation,
  ReservationStatus,
  StockMovement,
  type ReservationShape,
  type StockMovementShape,
} from "./inventory.model";

// Every function here changes stock with a single conditional update
// ("only if enough is available"), so two buyers can never take the last unit.
// Multi-step operations run in a transaction so they succeed or fail as a whole.

async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// Re-derives the price range and in-stock flag that list pages filter on.
export const syncDerivedFields = (productId: Types.ObjectId | string, session?: ClientSession) =>
  Product.updateOne(
    { _id: productId },
    [
      {
        $set: {
          minPrice: { $min: "$variants.price" },
          maxPrice: { $max: "$variants.price" },
          maxMrp: { $max: "$variants.mrp" },
          inStock: {
            $anyElementTrue: {
              $map: { input: "$variants", as: "v", in: { $gt: ["$$v.available", 0] } },
            },
          },
        },
      },
    ],
    { session },
  );

const logMovement = (entries: Omit<StockMovementShape, "at">[], session: ClientSession) =>
  StockMovement.insertMany(entries, { session });

async function insufficient(productId: Types.ObjectId | string, sku: string) {
  const p = await Product.findById(productId).select("title variants.sku variants.available");
  const left = p?.variants.find((v) => v.sku === sku)?.available ?? 0;
  return new AppError(
    HttpStatus.CONFLICT,
    ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
    left === 0
      ? `${p?.title ?? "This item"} is out of stock.`
      : `Only ${left} of ${p?.title ?? "this item"} left.`,
  );
}

/* --------------------------------------------------------- seller-side stock */

export interface AdjustInput {
  productId: string;
  sku: string;
  delta: number;
  reason: StockReason;
  actorId: string;
  note?: string;
  // when set, the product must belong to this seller
  sellerId?: string;
}

export async function adjustStock(input: AdjustInput) {
  const { productId, sku, delta } = input;

  await inTransaction(async (session) => {
    const filter: Record<string, unknown> = {
      _id: productId,
      variants: { $elemMatch: { sku, ...(delta < 0 ? { available: { $gte: -delta } } : {}) } },
    };
    if (input.sellerId) filter.seller = input.sellerId;

    const res = await Product.updateOne(
      filter,
      { $inc: { "variants.$.available": delta } },
      { session },
    );
    if (res.matchedCount === 0) {
      const exists = await Product.exists({
        _id: productId,
        "variants.sku": sku,
        ...(input.sellerId ? { seller: input.sellerId } : {}),
      });
      if (!exists) throw AppError.notFound("That product or SKU doesn't exist.");
      throw await insufficient(productId, sku);
    }

    await syncDerivedFields(productId, session);
    await logMovement(
      [
        {
          product: new mongoose.Types.ObjectId(productId),
          sku,
          delta,
          reason: input.reason,
          actor: new mongoose.Types.ObjectId(input.actorId),
          note: input.note,
        },
      ],
      session,
    );
  });
}

/* ------------------------------------------------------- checkout reservations */

export interface ReserveItem {
  productId: string;
  sku: string;
  qty: number;
}

export async function reserveStock(userId: string, items: ReserveItem[], holdMinutes = 15) {
  // the same SKU twice in a cart becomes one line
  const merged = new Map<string, ReserveItem>();
  for (const it of items) {
    const key = `${it.productId}:${it.sku}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, qty: prev.qty + it.qty } : { ...it });
  }
  const lines = [...merged.values()];

  return inTransaction(async (session) => {
    for (const line of lines) {
      const res = await Product.updateOne(
        {
          _id: line.productId,
          status: ProductStatus.ACTIVE,
          variants: { $elemMatch: { sku: line.sku, available: { $gte: line.qty } } },
        },
        { $inc: { "variants.$.available": -line.qty, "variants.$.reserved": line.qty } },
        { session },
      );
      if (res.modifiedCount === 0) throw await insufficient(line.productId, line.sku);
      await syncDerivedFields(line.productId, session);
    }

    const [reservation] = await Reservation.create(
      [
        {
          user: userId,
          items: lines.map((l) => ({ product: l.productId, sku: l.sku, qty: l.qty })),
          expiresAt: new Date(Date.now() + holdMinutes * 60_000),
        },
      ],
      { session },
    );

    await logMovement(
      lines.map((l) => ({
        product: new mongoose.Types.ObjectId(l.productId),
        sku: l.sku,
        delta: 0,
        reason: StockReason.RESERVE,
        refId: String(reservation!._id),
        note: `held ${l.qty}`,
      })),
      session,
    );
    return reservation!;
  });
}

type Held = ReservationShape & { _id: Types.ObjectId };

// Gives the units back. Returns false if the hold was already settled, which makes
// it safe to call twice (e.g. the sweeper and a cancel at the same moment).
export async function releaseReservation(reservationId: string, note = "released") {
  return inTransaction(async (session) => {
    const r = (await Reservation.findOneAndUpdate(
      { _id: reservationId, status: ReservationStatus.HELD },
      { status: ReservationStatus.RELEASED },
      { session },
    )) as Held | null;
    if (!r) return false;

    for (const it of r.items) {
      await Product.updateOne(
        { _id: it.product, "variants.sku": it.sku },
        { $inc: { "variants.$.available": it.qty, "variants.$.reserved": -it.qty } },
        { session },
      );
      await syncDerivedFields(it.product, session);
    }
    await logMovement(
      r.items.map((it) => ({
        product: it.product,
        sku: it.sku,
        delta: 0,
        reason: StockReason.RELEASE,
        refId: String(r._id),
        note,
      })),
      session,
    );
    return true;
  });
}

// Payment succeeded: the held units are sold.
export async function commitReservation(reservationId: string, orderId: string) {
  return inTransaction(async (session) => {
    const r = (await Reservation.findOneAndUpdate(
      { _id: reservationId, status: ReservationStatus.HELD },
      { status: ReservationStatus.COMMITTED },
      { session },
    )) as Held | null;
    if (!r) {
      throw new AppError(
        HttpStatus.CONFLICT,
        ErrorCode.INVENTORY_RESERVATION_EXPIRED,
        "Your hold on these items expired. Please check out again.",
      );
    }

    for (const it of r.items) {
      await Product.updateOne(
        { _id: it.product, "variants.sku": it.sku },
        { $inc: { "variants.$.reserved": -it.qty, soldCount: it.qty } },
        { session },
      );
    }
    await logMovement(
      r.items.map((it) => ({
        product: it.product,
        sku: it.sku,
        delta: -it.qty,
        reason: StockReason.SALE,
        refId: orderId,
      })),
      session,
    );
  });
}

// A paid order was cancelled before it shipped: the units were already sold, so
// they go back on the shelf and the sale is undone.
export async function restockUnits(
  items: { product: Types.ObjectId; sku: string; qty: number }[],
  refId: string,
  note: string,
) {
  await inTransaction(async (session) => {
    for (const it of items) {
      await Product.updateOne(
        { _id: it.product, "variants.sku": it.sku },
        { $inc: { "variants.$.available": it.qty, soldCount: -it.qty } },
        { session },
      );
      await syncDerivedFields(it.product, session);
    }
    await logMovement(
      items.map((it) => ({
        product: it.product,
        sku: it.sku,
        delta: it.qty,
        reason: StockReason.RETURN,
        refId,
        note,
      })),
      session,
    );
  });
}

// Run on a timer: frees the stock of checkouts nobody finished.
export async function releaseExpiredReservations(limit = 100) {
  const stale = await Reservation.find({
    status: ReservationStatus.HELD,
    expiresAt: { $lt: new Date() },
  })
    .limit(limit)
    .select("_id");

  let released = 0;
  for (const r of stale) {
    if (await releaseReservation(String(r._id), "hold expired")) released += 1;
  }
  return released;
}
