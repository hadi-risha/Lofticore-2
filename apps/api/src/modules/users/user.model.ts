import { Schema, model, type HydratedDocument } from "mongoose";
import {
  ALL_ROLES,
  AccountStatus,
  Role,
  type PublicUser,
  type UserProfile,
} from "@lofticore/shared";

export interface UserShape {
  name: string;
  email: string;
  phone?: string;
  passwordHash?: string;
  googleId?: string;
  role: Role;
  status: AccountStatus;
  statusReason?: string;
  emailVerified: boolean;
  tourCompleted: boolean;
  failedLogins: number;
  lockedUntil?: Date;

  // business details for sellers / delivery partners, reviewed by an admin
  profile?: Omit<UserProfile, "submittedAt"> & { submittedAt?: Date };
  approvedAt?: Date;

  // staff two-factor (TOTP)
  totpSecret?: string;
  totpEnabled: boolean;

  createdAt: Date;
}

const userSchema = new Schema<UserShape>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String },
    // absent for accounts that only ever signed in with Google
    passwordHash: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ALL_ROLES, default: Role.CUSTOMER, index: true },
    status: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.ACTIVE,
      index: true,
    },
    // set when an admin blocks, rejects or suspends the account
    statusReason: { type: String },
    emailVerified: { type: Boolean, default: false },
    tourCompleted: { type: Boolean, default: false },

    // brute-force protection
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },

    profile: { type: Schema.Types.Mixed },
    approvedAt: { type: Date },

    // the secret is only readable when asked for explicitly
    totpSecret: { type: String, select: false },
    totpEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userSchema.index({ name: "text", email: "text" });

export type UserDoc = HydratedDocument<UserShape>;

export const User = model<UserShape>("User", userSchema);

export const toPublicUser = (u: UserDoc): PublicUser => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phone: u.phone ?? undefined,
  role: u.role,
  status: u.status,
  statusReason: u.statusReason ?? undefined,
  emailVerified: u.emailVerified,
  tourCompleted: u.tourCompleted,
  profileSubmitted: Boolean(u.profile?.submittedAt),
  twoFactorEnabled: u.totpEnabled,
  createdAt: u.createdAt.toISOString(),
});
