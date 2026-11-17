import type { RequestHandler } from "express";
import type { Role } from "@lofticore/shared";
import { AppError } from "../lib/app-error";
import { verifyAccessToken } from "../lib/tokens";

// Reads "Authorization: Bearer <jwt>" and puts the caller on req.user.
// Stateless on purpose: no database hit per request. Blocking someone revokes
// their sessions, so a stolen token dies within one access-token lifetime.
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) throw AppError.unauthenticated();

  const claims = await verifyAccessToken(token);
  req.user = { id: claims.userId, role: claims.role, sessionId: claims.sessionId };
  next();
};

// Use after authenticate: authorize(Role.ADMIN, Role.SUPER_ADMIN)
export const authorize =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw AppError.unauthenticated();
    if (!allowed.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
