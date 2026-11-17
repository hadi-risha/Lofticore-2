import type { RequestHandler } from "express";
import { ErrorCode, HttpStatus } from "@lofticore/shared";
import { AppError } from "../lib/app-error";
import { User } from "../modules/users/user.model";

// Admin tools only open for staff who have turned on their authenticator app. A
// stolen password alone gets an attacker a sign-in, but nothing they can use.
export const requireStaff2fa: RequestHandler = async (req, _res, next) => {
  const user = await User.findById(req.user!.id).select("totpEnabled status");
  if (!user) throw AppError.unauthenticated();
  if (!user.totpEnabled) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_2FA_SETUP_REQUIRED,
      "Set up two-factor authentication to use the admin tools.",
    );
  }
  next();
};
