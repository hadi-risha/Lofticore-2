import { Schema, model, type Types } from "mongoose";

// One document per logged-in device/browser. Revoking a session logs that device
// out without touching the others.
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // only hashes are stored - the real refresh token lives in the user's cookie
    tokenHash: { type: String, required: true },
    // the token before the last rotation, still accepted for a few seconds so two
    // tabs refreshing at the same moment don't log each other out
    prevTokenHash: { type: String },
    prevValidUntil: { type: Date },

    device: { type: String, default: "Unknown device" },
    ip: { type: String },
    userAgent: { type: String },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

// Mongo removes expired sessions on its own
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface SessionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  prevTokenHash?: string;
  prevValidUntil?: Date;
  device: string;
  ip?: string;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
}

export const Session = model<SessionDoc>("Session", sessionSchema);
