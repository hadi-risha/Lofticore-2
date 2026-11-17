import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";

// One shared connection, or null when Redis isn't configured (and always in tests).
// Everything that uses it has an in-process fallback, so the API still runs without it.
export const redis: Redis | null =
  env.REDIS_URL && !env.isTest
    ? new Redis(env.REDIS_URL, {
        // BullMQ requires this; it also stops one slow command from failing requests
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      })
    : null;

redis?.on("error", (err) => logger.warn({ err: err.message }, "redis error"));

export const isRedisReady = () => redis?.status === "ready";
