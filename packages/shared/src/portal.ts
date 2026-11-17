import { z } from "zod";
import { ALL_ROLES, type Role } from "./roles";
import { AccountStatus } from "./user";

/* ----------------------------------------------------------------- profiles */

const phone = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.");
const pincode = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a 6-digit pincode.");

// What an admin needs to see before trusting a seller with customers' money.
export const sellerProfileSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name.").max(80),
  phone,
  addressLine: z.string().trim().min(5, "Enter your business address.").max(160),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d]Z[A-Z\d]$/, "That doesn't look like a valid GSTIN.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "That doesn't look like a valid PAN."),
  payoutUpi: z
    .string()
    .trim()
    .regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, "Enter a UPI id like name@bank."),
});
export type SellerProfileInput = z.infer<typeof sellerProfileSchema>;

export const VEHICLES = ["bike", "van", "truck"] as const;

export const deliveryProfileSchema = z.object({
  phone,
  vehicle: z.enum(VEHICLES),
  licenceNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(8, "Enter your driving licence number.")
    .max(20),
  // pincodes they cover; the admin uses these to pick who delivers where
  serviceAreas: z.array(pincode).min(1, "Add at least one pincode you can deliver to.").max(30),
});
export type DeliveryProfileInput = z.infer<typeof deliveryProfileSchema>;

export type UserProfile = Partial<SellerProfileInput> &
  Partial<DeliveryProfileInput> & { submittedAt?: string };

/* ------------------------------------------------------------ admin actions */

export const UserAction = {
  APPROVE: "approve",
  REJECT: "reject",
  BLOCK: "block",
  UNBLOCK: "unblock",
} as const;
export type UserAction = (typeof UserAction)[keyof typeof UserAction];

export const userDecisionSchema = z
  .object({
    action: z.enum(Object.values(UserAction) as [UserAction, ...UserAction[]]),
    reason: z.string().trim().max(300).optional(),
    // when blocking someone with open orders: let them finish, or cancel what can still be cancelled
    activeOrders: z.enum(["complete", "cancel"]).default("complete"),
  })
  .refine(
    (v) => !(v.action === "reject" || v.action === "block") || (v.reason && v.reason.length >= 3),
    {
      message: "Give a short reason - the person will see it.",
      path: ["reason"],
    },
  );

export const adminUserQuerySchema = z.object({
  role: z.enum(ALL_ROLES as [Role, ...Role[]]).optional(),
  status: z.enum(Object.values(AccountStatus) as [AccountStatus, ...AccountStatus[]]).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const adminOrderQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

/* --------------------------------------------------------------- two-factor */

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your app."),
});
export const twoFactorLoginSchema = z.object({
  challengeToken: z.string().min(20),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your app."),
});

/* --------------------------------------------------------------------- DTOs */

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  statusReason?: string;
  emailVerified: boolean;
  profileSubmitted: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  profile?: UserProfile;
  stats: { orders: number; openOrders: number; products: number };
}

export interface AdminStats {
  users: Record<string, number>;
  pendingSellers: number;
  pendingDelivery: number;
  productsAwaitingReview: number;
  openReports: number;
  orders: { total: number; today: number; open: number };
  revenue: number; // paise, orders not cancelled
}

export interface SellerStats {
  products: Record<string, number>;
  lowStock: { productId: string; title: string; sku: string; available: number }[];
  orders: Record<string, number>;
  revenue: number;
}

export interface AuditEntryDTO {
  id: string;
  action: string;
  actor?: { id: string; name: string; email: string };
  targetId?: string;
  at: string;
  meta?: Record<string, unknown>;
}
