import { Router } from "express";
import mongoose from "mongoose";
import { isDbReady } from "../../db/connect";
import { mailQueue } from "../../lib/mailer";
import { isRedisReady, redis } from "../../lib/redis";
import { searchConfigured, searchHealth } from "../../lib/search";

// GET /api/status - what the public status page shows. Says whether each dependency is
// up and how long it took to answer; never anything secret (no hostnames, no keys).

type State = "up" | "down" | "off";
interface Check {
  name: string;
  state: State;
  latencyMs?: number;
  detail?: string;
}

async function timed(name: string, fn: () => Promise<string | void>): Promise<Check> {
  const start = performance.now();
  try {
    const detail = await fn();
    return {
      name,
      state: "up",
      latencyMs: Math.round(performance.now() - start),
      ...(detail ? { detail } : {}),
    };
  } catch {
    return { name, state: "down" };
  }
}

export const statusRouter = Router();

statusRouter.get("/", async (_req, res) => {
  const checks: Check[] = await Promise.all([
    timed("API", async () => {}),
    timed("Database", async () => {
      if (!isDbReady()) throw new Error("not connected");
      await mongoose.connection.db!.admin().ping();
    }),
    redis
      ? timed("Redis (rate limits, queue, live updates)", async () => {
          if (!isRedisReady()) throw new Error("not ready");
          await redis?.ping();
        })
      : Promise.resolve<Check>({ name: "Redis (rate limits, queue, live updates)", state: "off" }),
    searchConfigured()
      ? timed("Search (Meilisearch)", async () => {
          if (!(await searchHealth())) throw new Error("down");
        })
      : Promise.resolve<Check>({
          name: "Search (Meilisearch)",
          state: "off",
          detail: "using MongoDB text search",
        }),
  ]);

  let mailJobs: Record<string, number> | undefined;
  if (mailQueue) {
    mailJobs = await mailQueue
      .getJobCounts("waiting", "active", "failed", "delayed")
      .catch(() => undefined);
  }

  const critical = checks.filter((c) => c.name === "API" || c.name === "Database");
  const ok = critical.every((c) => c.state === "up");
  res.status(ok ? 200 : 503).json({
    status: ok ? "operational" : "degraded",
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
    node: process.version,
    checks,
    ...(mailJobs ? { mailQueue: mailJobs } : {}),
  });
});
