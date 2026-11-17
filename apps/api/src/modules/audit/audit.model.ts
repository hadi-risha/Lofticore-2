import { Schema, model } from "mongoose";
import { logger } from "../../config/logger";

// Who did what, when. Append-only: nothing in the app updates or deletes these.
const auditSchema = new Schema({
  action: { type: String, required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  targetId: { type: String },
  ip: { type: String },
  requestId: { type: String },
  meta: { type: Schema.Types.Mixed },
  at: { type: Date, default: Date.now, index: true },
});

export const Audit = model("AuditLog", auditSchema);

interface AuditEntry {
  action: string;
  actorId?: string;
  targetId?: string;
  ip?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
}

// Never throws: failing to write an audit line must not break the action itself.
export async function audit(entry: AuditEntry) {
  try {
    await Audit.create(entry);
  } catch (err) {
    logger.error({ err, entry }, "failed to write audit log");
  }
}
