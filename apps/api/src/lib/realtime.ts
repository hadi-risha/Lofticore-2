import { EventEmitter } from "node:events";
import { redis } from "./redis";
import { logger } from "../config/logger";

// Server-sent events fan-out. `publish(userId, event)` reaches every open connection of
// that user. With Redis the message goes through pub/sub, so it works across several API
// instances; without it, it stays in this process.

export interface RealtimeEvent {
  type: string; // e.g. "order.placed", "shipment.shipped"
  link?: string;
}

const CHANNEL = "rt";
const local = new EventEmitter().setMaxListeners(0);

const sub = redis ? redis.duplicate() : null;
if (sub) {
  sub.subscribe(CHANNEL).catch((err) => logger.warn({ err }, "realtime subscribe failed"));
  sub.on("message", (_ch, raw) => {
    try {
      const { userId, event } = JSON.parse(raw) as { userId: string; event: RealtimeEvent };
      local.emit(userId, event);
    } catch {
      /* ignore malformed messages */
    }
  });
}

export function publish(userIds: string[], event: RealtimeEvent) {
  for (const userId of userIds) {
    if (redis) void redis.publish(CHANNEL, JSON.stringify({ userId, event })).catch(() => {});
    else local.emit(userId, event);
  }
}

export function subscribe(userId: string, onEvent: (e: RealtimeEvent) => void) {
  local.on(userId, onEvent);
  return () => void local.off(userId, onEvent);
}
