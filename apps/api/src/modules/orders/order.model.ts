import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@lofticore/shared";

export interface OrderItemShape {
  product: Types.ObjectId;
  slug?: string;
  sku: string;
  // copied at purchase time: the order must keep reading the same after the
  // product is renamed, repriced or removed
  title: string;
  image: string;
  variantLabel?: string;
  price: number; // paise, per unit
  qty: number;
}

export interface ShipmentShape {
  _id: Types.ObjectId;
  seller: Types.ObjectId;
  items: OrderItemShape[];
  status: ShipmentStatus;
  timeline: { status: ShipmentStatus; at: Date; note?: string }[];
  agent?: Types.ObjectId; // delivery partner
  deliveryCode?: string;
}

export interface OrderShape {
  orderNumber: string;
  user: Types.ObjectId;
  idempotencyKey: string;
  address: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
  };
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  reservation?: Types.ObjectId;
  shipments: ShipmentShape[];
  cancelReason?: string;
  createdAt: Date;
}

const itemSchema = new Schema<OrderItemShape>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    slug: String,
    sku: { type: String, required: true },
    title: { type: String, required: true },
    image: { type: String, default: "" },
    variantLabel: String,
    price: { type: Number, required: true },
    qty: { type: Number, required: true },
  },
  { _id: false },
);

const shipmentSchema = new Schema<ShipmentShape>({
  seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
  items: [itemSchema],
  status: { type: String, enum: Object.values(ShipmentStatus), default: ShipmentStatus.PLACED },
  timeline: [{ _id: false, status: String, at: { type: Date, default: Date.now }, note: String }],
  agent: { type: Schema.Types.ObjectId, ref: "User" },
  deliveryCode: String,
});

const orderSchema = new Schema<OrderShape>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    idempotencyKey: { type: String, required: true },
    address: {
      fullName: String,
      phone: String,
      line1: String,
      line2: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,
    },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING_PAYMENT,
      index: true,
    },
    paymentMethod: { type: String, enum: Object.values(PaymentMethod), required: true },
    reservation: { type: Schema.Types.ObjectId, ref: "Reservation" },
    shipments: [shipmentSchema],
    cancelReason: String,
  },
  { timestamps: true },
);

// a repeated submit with the same key finds the order that already exists
orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ "shipments.seller": 1, status: 1 });
orderSchema.index({ "shipments.agent": 1 });

export type OrderDoc = HydratedDocument<OrderShape>;
export const Order = model<OrderShape>("Order", orderSchema);

/* ----------------------------------------------------------------- payments */

export interface PaymentShape {
  order: Types.ObjectId;
  user: Types.ObjectId;
  method: PaymentMethod;
  provider: "cod" | "mock_upi" | "razorpay";
  amount: number;
  status: PaymentStatus;
  attempt: number;
  // unguessable id for the demo UPI app page, which has no login
  token?: string;
  providerRef?: string;
  // the gateway's own id for this attempt (Razorpay order_...)
  providerOrderId?: string;
  failureReason?: string;
  // paise returned so far (a seller being blocked can refund just their part of an order)
  refundedAmount?: number;
  expiresAt?: Date;
  events: { status: PaymentStatus; at: Date; note?: string }[];
  createdAt: Date;
}

const paymentSchema = new Schema<PaymentShape>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    method: { type: String, enum: Object.values(PaymentMethod), required: true },
    provider: { type: String, enum: ["cod", "mock_upi", "razorpay"], required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },
    attempt: { type: Number, default: 1 },
    token: { type: String, index: true, sparse: true },
    providerRef: String,
    providerOrderId: { type: String, index: true, sparse: true },
    failureReason: String,
    refundedAmount: { type: Number, default: 0 },
    expiresAt: Date,
    events: [{ _id: false, status: String, at: { type: Date, default: Date.now }, note: String }],
  },
  { timestamps: true },
);

export type PaymentDoc = HydratedDocument<PaymentShape>;
export const Payment = model<PaymentShape>("Payment", paymentSchema);
