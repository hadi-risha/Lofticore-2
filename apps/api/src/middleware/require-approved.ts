import type { RequestHandler } from "express";
import { AccountStatus, ErrorCode, HttpStatus } from "@lofticore/shared";
import { AppError } from "../lib/app-error";
import { User } from "../modules/users/user.model";

// Sellers and delivery partners can sign in while waiting for admin approval, but
// can't do business yet. This reads the live status (not the token), so a block or
// rejection takes effect immediately.
export const requireApproved: RequestHandler = async (req, _res, next) => {
  const user = await User.findById(req.user!.id).select("status");
  if (!user) throw AppError.unauthenticated();

  if (user.status === AccountStatus.PENDING_APPROVAL) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_ACCOUNT_PENDING_APPROVAL,
      "Your account is waiting for admin approval. We'll email you once it's done.",
    );
  }
  if (user.status !== AccountStatus.ACTIVE)
    throw AppError.forbidden("This account can't do that right now.");
  next();
};
