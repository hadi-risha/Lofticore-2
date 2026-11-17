import { Router } from "express";
import { HttpStatus } from "@lofticore/shared";
import { isDbReady } from "../../db/connect";

export const healthRouter = Router();

// liveness: the process is up
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: Math.round(process.uptime()) });
});

// readiness: it can actually serve traffic (db is reachable)
healthRouter.get("/ready", (_req, res) => {
  const db = isDbReady();
  res.status(db ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
    status: db ? "ready" : "not_ready",
    db,
  });
});
