import { Schema, model } from "mongoose";

export const TokenPurpose = {
  EMAIL_OTP: "email_otp",
  PASSWORD_RESET: "password_reset",
  STAFF_INVITE: "staff_invite",
} as const;
export type TokenPurpose = (typeof TokenPurpose)[keyof typeof TokenPurpose];

// Short-lived secrets: email OTPs, reset links and staff invites. Only the HMAC of
// the secret is stored. `key` is the email (or user id) the secret belongs to.
const tokenSchema = new Schema({
  purpose: { type: String, enum: Object.values(TokenPurpose), required: true },
  key: { type: String, required: true },
  secretHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  // staff invites carry the name the super admin typed
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

tokenSchema.index({ purpose: 1, key: 1 });
tokenSchema.index({ secretHash: 1 });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Token = model("Token", tokenSchema);
