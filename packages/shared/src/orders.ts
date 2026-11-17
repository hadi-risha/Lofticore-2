import { z } from "zod";
import { nameSchema } from "./auth.schemas";

/* ---------------------------------------------------------------- addresses */

export const addressSchema = z.object({
  label: z.enum(["home", "work", "other"]).default("home"),
  fullName: nameSchema,
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number."),
  line1: z.string().trim().min(5, "Enter the house/flat and street.").max(120),
  line2: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2, "Enter the city.").max(60),
  state: z.string().trim().min(2, "Enter the state.").max(60),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Enter a 6-digit pincode."),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;
export interface AddressDTO extends AddressInput {
  id: string;
}

/* ------------------------------------------------------------------ enums */

export const PaymentMethod = { COD: "cod", UPI: "upi", RAZORPAY: "razorpay" } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: "pending", // UPI: waiting for the app to confirm. COD: cash not collected yet.
  PAID: "paid",
  FAILED: "failed",
  EXPIRED: "expired",
  REFUNDED: "refunded",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const OrderStatus = {
  PENDING_PAYMENT: "pending_payment",
  PLACED: "placed", // "booked"
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered", // "received"
  CANCELLED: "cancelled",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

// One shipment per seller in an order.
export const ShipmentStatus = {
  PLACED: "placed",
  CONFIRMED: "confirmed",
  PACKED: "packed",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

// who may push a shipment to which status, from which status
export const ShipmentAction = {
  CONFIRM: "confirm",
  PACK: "pack",
  SHIP: "ship",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVER: "deliver",
} as const;
export type ShipmentAction = (typeof ShipmentAction)[keyof typeof ShipmentAction];

export const SHIPMENT_FLOW: Record<ShipmentAction, { from: ShipmentStatus; to: ShipmentStatus }> = {
  confirm: { from: "placed", to: "confirmed" },
  pack: { from: "confirmed", to: "packed" },
  ship: { from: "packed", to: "shipped" },
  out_for_delivery: { from: "shipped", to: "out_for_delivery" },
  deliver: { from: "out_for_delivery", to: "delivered" },
};

// A buyer can cancel until the seller has packed the parcel.
export const CANCELLABLE_SHIPMENT: ShipmentStatus[] = ["placed", "confirmed"];

/* --------------------------------------------------------------- checkout */

export const FREE_DELIVERY_ABOVE = 10_000_00; // paise
export const DELIVERY_FEE = 499_00;
export const COD_LIMIT = 50_000_00;
// accounts under 3 days old with nothing delivered yet get a lower cash-on-delivery cap
export const NEW_ACCOUNT_COD_LIMIT = 15_000_00;
export const NEW_ACCOUNT_DAYS = 3;

export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f\d]{24}$/i),
        sku: z.string().trim().toUpperCase(),
        qty: z.number().int().min(1).max(10),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(30),
  addressId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a delivery address."),
  paymentMethod: z.enum([PaymentMethod.COD, PaymentMethod.UPI, PaymentMethod.RAZORPAY]),
  // generated once per checkout attempt; a double-click or retry can't create two orders
  idempotencyKey: z.string().min(8).max(64),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const shipmentActionSchema = z.object({
  action: z.enum(Object.values(ShipmentAction) as [ShipmentAction, ...ShipmentAction[]]),
  // the 4-digit code the customer gives the delivery partner at the door
  deliveryCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  note: z.string().trim().max(200).optional(),
});

export const mockUpiResponseSchema = z.object({
  decision: z.enum(["approve", "decline"]),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "Enter your 4-6 digit UPI PIN.")
    .optional(),
});

/* ------------------------------------------------------------------- DTOs */

export interface OrderItemDTO {
  productId: string;
  slug?: string;
  sku: string;
  title: string;
  image: string;
  variantLabel?: string;
  price: number;
  qty: number;
}

export interface ShipmentDTO {
  id: string;
  seller: { id: string; name: string };
  status: ShipmentStatus;
  items: OrderItemDTO[];
  timeline: { status: ShipmentStatus; at: string; note?: string }[];
  // only shown to the buyer while the parcel is on its way
  deliveryCode?: string;
}

export interface PaymentDTO {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  expiresAt?: string;
  // upi only
  upiLink?: string;
  mockAppUrl?: string;
  // razorpay only: what Razorpay Checkout needs (never the secret)
  razorpay?: { keyId: string; orderId: string };
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  address: Omit<AddressDTO, "id" | "isDefault" | "label">;
  payment?: PaymentDTO;
  shipments: ShipmentDTO[];
  canCancel: boolean;
  // only for staff
  customer?: { name: string; email: string };
}
