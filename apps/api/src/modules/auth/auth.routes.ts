import { Router } from "express";
import {
  Role,
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  googleLoginSchema,
  inviteStaffSchema,
  loginSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  totpCodeSchema,
  twoFactorLoginSchema,
  verifyEmailSchema,
} from "@lofticore/shared";
import { authenticate, authorize } from "../../middleware/authenticate";
import { authLimiter } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import * as c from "./auth.controller";

export const authRouter = Router();

authRouter.use(authLimiter);

// public
authRouter.post("/register", validate(registerSchema), c.register);
authRouter.post("/verify-email", validate(verifyEmailSchema), c.verifyEmail);
authRouter.post("/resend-otp", validate(resendOtpSchema), c.resendOtp);
authRouter.post("/login", validate(loginSchema), c.login);
authRouter.post("/login/2fa", validate(twoFactorLoginSchema), c.loginTwoFactor);
authRouter.post("/google", validate(googleLoginSchema), c.google);
authRouter.post("/forgot-password", validate(forgotPasswordSchema), c.forgotPassword);
authRouter.post("/reset-password", validate(resetPasswordSchema), c.resetPassword);
authRouter.post("/accept-invite", validate(acceptInviteSchema), c.acceptInvite);

// cookie-based - needs the CSRF header
authRouter.post("/refresh", c.requireCsrfHeader, c.refresh);
authRouter.post("/logout", c.requireCsrfHeader, c.logout);

// signed in
authRouter.post("/logout-all", authenticate, c.logoutAll);
authRouter.post("/change-password", authenticate, validate(changePasswordSchema), c.changePassword);
authRouter.get("/sessions", authenticate, c.listSessions);
authRouter.delete("/sessions/:id", authenticate, c.revokeSession);

// staff set up an authenticator app
authRouter.post("/2fa/setup", authenticate, c.setupTwoFactor);
authRouter.post("/2fa/enable", authenticate, validate(totpCodeSchema), c.enableTwoFactor);

// only the super admin can add staff
authRouter.post(
  "/invite-staff",
  authenticate,
  authorize(Role.SUPER_ADMIN),
  validate(inviteStaffSchema),
  c.inviteStaff,
);
