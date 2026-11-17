import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

// Every request gets an id. It's logged, returned in the X-Request-Id header and
// included in error bodies, so a user can quote it and we can find the exact logs.
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  // only trust a sane-looking incoming id
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
};
