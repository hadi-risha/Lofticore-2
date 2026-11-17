import { Schema, model, type Types } from "mongoose";
import { StockReason } from "@lofticore/shared";

// Append-only record of every stock change. When the numbers look wrong, this is
// where you find out why.
export interface StockMovementShape {
  product: Types.ObjectId;
  sku: string;
  delta: number; // on-hand change: +restock, -sale. Reserve/release don't change on-hand.
  reason: StockReason;
  refId?: string; // order or reservation id
  actor?: Types.ObjectId;
  note?: string;
  at: Date;
}

const movementSchema = new Schema<StockMovementShape>({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  sku: { type: String, required: true, index: true },
  delta: { type: Number, required: true },
  reason: { type: String, enum: Object.values(StockReason), required: true },
  refId: String,
  actor: { type: Schema.Types.ObjectId, ref: "User" },
  note: String,
  at: { type: Date, default: Date.now, index: true },
});

export const StockMovement = model<StockMovementShape>("StockMovement", movementSchema);

// Stock held for a checkout in progress. If the buyer doesn't pay in time the
// hold expires and the units go back on the shelf.
export const ReservationStatus = {
  HELD: "held",
  COMMITTED: "committed",
  RELEASED: "released",
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export interface ReservationShape {
  user: Types.ObjectId;
  items: { product: Types.ObjectId; sku: string; qty: number }[];
  status: ReservationStatus;
  expiresAt: Date;
}

const reservationSchema = new Schema<ReservationShape>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [{ _id: false, product: Schema.Types.ObjectId, sku: String, qty: Number }],
    status: {
      type: String,
      enum: Object.values(ReservationStatus),
      default: ReservationStatus.HELD,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

export const Reservation = model<ReservationShape>("Reservation", reservationSchema);
