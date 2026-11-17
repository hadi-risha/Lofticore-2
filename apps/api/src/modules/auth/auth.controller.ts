import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { HttpStatus } from "@lofticore/shared";
import { env } from "../../config/env";
import { AppError } from "../../lib/app-error";
import * as auth from "./auth.service";
import type { AuthResult, RequestContext } from "./auth.service";

const COOKIE = "lofticore_rt";

// The cookie is only sent to /api/auth, so the refresh token never travels with
// normal API calls. In production the web app and API sit on different domains,
// hence SameSite=None (which browsers only allow together with Secure).
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? "none" : "lax",
  path: "/api/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

const ctxOf = (req: Request): RequestContext => ({
  ip: req.ip,
  userAgent: req.header("user-agent"),
  requestId: String(req.id),
});

function sendAuth(res: Response, result: AuthResult, status: number = HttpStatus.OK) {
  if (result.refreshToken) res.cookie(COOKIE, result.refreshToken, cookieOptions);
  res.status(status).json({ accessToken: result.accessToken, user: result.user });
}

// Cross-site pages can't send a custom header without a CORS preflight, which our
// origin allowlist rejects. That's what stops CSRF on the cookie-based endpoints.
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.header("x-requested-by") !== "lofticore")
    throw AppError.forbidden("Missing request header.");
  next();
};

export const register: RequestHandler = async (req, res) => {
  await auth.register(req.body, ctxOf(req));
  res.status(HttpStatus.CREATED).json({ message: "We've emailed you a 6-digit code." });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const result = await auth.verifyEmail(req.body.email, req.body.code, ctxOf(req));
  sendAuth(res, result);
};

export const resendOtp: RequestHandler = async (req, res) => {
  await auth.resendOtp(req.body.email);
  res
    .status(HttpStatus.OK)
    .json({ message: "If that account needs verifying, a new code is on its way." });
};

export const login: RequestHandler = async (req, res) => {
  const result = await auth.login(req.body.email, req.body.password, ctxOf(req));
  if ("twoFactorRequired" in result) {
    res.json(result);
    return;
  }
  sendAuth(res, result);
};

export const loginTwoFactor: RequestHandler = async (req, res) => {
  sendAuth(res, await auth.loginWithTotp(req.body.challengeToken, req.body.code, ctxOf(req)));
};

export const setupTwoFactor: RequestHandler = async (req, res) => {
  res.json(await auth.beginTotpSetup(req.user!.id));
};

export const enableTwoFactor: RequestHandler = async (req, res) => {
  res.json({ user: await auth.finishTotpSetup(req.user!.id, req.body.code, ctxOf(req)) });
};

export const google: RequestHandler = async (req, res) => {
  sendAuth(res, await auth.loginWithGoogle(req.body.idToken, req.body.role, ctxOf(req)));
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    sendAuth(res, await auth.refresh(req.cookies?.[COOKIE], ctxOf(req)));
  } catch (err) {
    // a dead refresh token is useless; clear it so the browser stops sending it
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await auth.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(HttpStatus.NO_CONTENT).end();
};

export const logoutAll: RequestHandler = async (req, res) => {
  await auth.revokeAllSessions(req.user!.id);
  res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(HttpStatus.NO_CONTENT).end();
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await auth.forgotPassword(req.body.email);
  // identical answer whether or not the email exists
  res
    .status(HttpStatus.OK)
    .json({ message: "If that email has an account, a reset link is on its way." });
};

export const resetPassword: RequestHandler = async (req, res) => {
  await auth.resetPassword(req.body.token, req.body.password, ctxOf(req));
  res.status(HttpStatus.OK).json({ message: "Password updated. You can sign in now." });
};

export const changePassword: RequestHandler = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await auth.changePassword(
    req.user!.id,
    currentPassword,
    newPassword,
    req.user!.sessionId,
    ctxOf(req),
  );
  res
    .status(HttpStatus.OK)
    .json({ message: "Password changed. Your other devices were signed out." });
};

export const listSessions: RequestHandler = async (req, res) => {
  res.json({ sessions: await auth.listSessions(req.user!.id, req.user!.sessionId) });
};

export const revokeSession: RequestHandler = async (req, res) => {
  await auth.revokeSession(req.user!.id, String(req.params.id));
  res.status(HttpStatus.NO_CONTENT).end();
};

export const inviteStaff: RequestHandler = async (req, res) => {
  await auth.inviteStaff(req.user!.id, req.body.email, req.body.name, ctxOf(req));
  res.status(HttpStatus.CREATED).json({ message: "Invitation sent." });
};

export const acceptInvite: RequestHandler = async (req, res) => {
  const { token, name, password } = req.body;
  sendAuth(res, await auth.acceptInvite(token, name, password, ctxOf(req)), HttpStatus.CREATED);
};
