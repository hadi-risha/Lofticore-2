import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { ErrorCode, HttpStatus, type ApiErrorBody } from "@lofticore/shared";
import { env } from "../config/env";
import { redis } from "../lib/redis";

// With Redis the counters are shared by every API instance and survive a restart.
// Without it each process counts on its own, which is fine for one instance.
const client = redis;
const limiter = (name: string, windowMinutes: number, max: number) =>
  rateLimit({
    ...(client
      ? {
          store: new RedisStore({
            prefix: `rl:${name}:`,
            sendCommand: (...args: string[]) =>
              client.call(args[0]!, ...args.slice(1)) as Promise<never>,
          }),
          // if Redis goes down, let requests through rather than taking the site down
          passOnStoreError: true,
        }
      : {}),
    windowMs: windowMinutes * 60_000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (req, res) => {
      const body: ApiErrorBody = {
        code: ErrorCode.RATE_LIMITED,
        message: "Too many requests. Please slow down and try again shortly.",
        requestId: String(req.id),
      };
      res.status(HttpStatus.TOO_MANY_REQUESTS).json(body);
    },
  });

// generous for browsing, tight for anything that checks a secret
export const apiLimiter = limiter("api", 1, 300);
export const authLimiter = limiter("auth", 15, 30);

// the chat assistant can call a paid-per-use model, so it gets its own tighter limit
export const chatLimiter = limiter("chat", 1, 20);
