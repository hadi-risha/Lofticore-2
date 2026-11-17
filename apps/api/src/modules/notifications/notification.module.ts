import { publish } from "../../lib/realtime";
import { Router } from "express";
import mongoose, { Schema, model, type Types } from "mongoose";
import { z } from "zod";
import { HttpStatus, type NotificationDTO } from "@lofticore/shared";
import { logger } from "../../config/logger";
import { authenticate } from "../../middleware/authenticate";
import { parsedQuery, validateQuery } from "../../middleware/validate";

interface NotificationShape {
  user: Types.ObjectId;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: Date;
  createdAt: Date;
}

const schema = new Schema<NotificationShape>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: String,
  link: String,
  readAt: Date,
  createdAt: { type: Date, default: Date.now },
});
schema.index({ user: 1, createdAt: -1 });
// old notifications tidy themselves away after 90 days
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const Notification = model<NotificationShape>("Notification", schema);

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

// In-app notifications. Called from the places things happen (an order shipped, a
// payment landed...). It never throws: a notification failing to save must not undo
// the thing it was announcing.
export async function notify(
  userIds: (string | Types.ObjectId) | (string | Types.ObjectId)[],
  input: NotifyInput,
) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(String))];
  if (ids.length === 0) return;
  try {
    await Notification.insertMany(ids.map((user) => ({ user, ...input })));
    publish(ids, { type: input.type, link: input.link });
  } catch (err) {
    logger.error({ err, input }, "failed to save notification");
  }
}

const toDTO = (n: NotificationShape & { _id: Types.ObjectId }): NotificationDTO => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body ?? undefined,
  link: n.link ?? undefined,
  read: Boolean(n.readAt),
  createdAt: n.createdAt.toISOString(),
});

export const notificationRouter = Router();
notificationRouter.use(authenticate);

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

notificationRouter.get("/", validateQuery(listQuery), async (req, res) => {
  const { limit } = parsedQuery(res, listQuery);
  const [rows, unread] = await Promise.all([
    Notification.find({ user: req.user!.id }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: req.user!.id, readAt: { $exists: false } }),
  ]);
  res.json({ items: rows.map(toDTO), unread });
});

notificationRouter.post("/read-all", async (req, res) => {
  await Notification.updateMany(
    { user: req.user!.id, readAt: { $exists: false } },
    { readAt: new Date() },
  );
  res.status(HttpStatus.NO_CONTENT).end();
});

notificationRouter.post("/:id/read", async (req, res) => {
  const id = String(req.params.id);
  if (mongoose.isValidObjectId(id))
    await Notification.updateOne({ _id: id, user: req.user!.id }, { readAt: new Date() });
  res.status(HttpStatus.NO_CONTENT).end();
});
