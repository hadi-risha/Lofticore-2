import { Types } from "mongoose";
import {
  AccountStatus,
  isStaff,
  ErrorCode,
  HttpStatus,
  Role,
  type RegisterInput,
  type SessionInfo,
  type TwoFactorChallenge,
} from "@lofticore/shared";
import { env } from "../../config/env";
import { AppError } from "../../lib/app-error";
import { describeDevice } from "../../lib/device";
import { generateOtp, hmac, randomToken, safeEqual } from "../../lib/crypto";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../../lib/password";
import { mails } from "../../lib/mailer";
import { signAccessToken, signChallengeToken, verifyChallengeToken } from "../../lib/tokens";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../../lib/totp";
import QRCode from "qrcode";
import { audit } from "../audit/audit.model";
import { User, toPublicUser, type UserDoc } from "../users/user.model";
import { Session } from "./session.model";
import { Token, TokenPurpose } from "./token.model";
import { verifyGoogleIdToken } from "./google";

const MIN = 60_000;
const OTP_TTL = 10 * MIN;
const RESET_TTL = 30 * MIN;
const INVITE_TTL = 3 * 24 * 60 * MIN;
const RESEND_COOLDOWN = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const LOGIN_MAX_FAILS = 5;
const LOCK_FOR = 15 * MIN;
// how long the previous refresh token keeps working after a rotation (multi-tab races)
const ROTATION_GRACE = 10_000;

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AuthResult {
  accessToken: string;
  // undefined when the caller should keep the cookie it already has
  refreshToken?: string;
  user: ReturnType<typeof toPublicUser>;
}

const invalidCredentials = () =>
  new AppError(
    HttpStatus.UNAUTHORIZED,
    ErrorCode.AUTH_INVALID_CREDENTIALS,
    "Email or password is incorrect.",
  );

// customers are live straight away; sellers and delivery partners wait for an admin
const initialStatus = (role: Role) =>
  role === Role.CUSTOMER ? AccountStatus.ACTIVE : AccountStatus.PENDING_APPROVAL;

/* ---------------------------------------------------------------- sessions */

async function startSession(user: UserDoc, ctx: RequestContext): Promise<AuthResult> {
  const secret = randomToken();
  const session = await Session.create({
    userId: user._id,
    tokenHash: hmac(secret),
    device: describeDevice(ctx.userAgent),
    ip: ctx.ip,
    userAgent: ctx.userAgent?.slice(0, 300),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * MIN),
  });

  const accessToken = await signAccessToken({
    userId: String(user._id),
    role: user.role,
    sessionId: String(session._id),
  });

  return { accessToken, refreshToken: `${session._id}.${secret}`, user: toPublicUser(user) };
}

function assertCanSignIn(user: UserDoc) {
  if (user.status === AccountStatus.BLOCKED) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_ACCOUNT_BLOCKED,
      "This account has been blocked. Contact support if you think this is a mistake.",
    );
  }
  if (user.status === AccountStatus.REJECTED) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_FORBIDDEN,
      "Your application wasn't approved. Contact support for details.",
    );
  }
}

export async function refresh(
  rawToken: string | undefined,
  ctx: RequestContext,
): Promise<AuthResult> {
  const bad = () =>
    new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_INVALID, "Please sign in again.");

  const [sessionId, secret] = rawToken?.split(".") ?? [];
  if (!sessionId || !secret || !Types.ObjectId.isValid(sessionId)) throw bad();

  const session = await Session.findById(sessionId);
  if (!session || session.revokedAt || session.expiresAt < new Date()) throw bad();

  const user = await User.findById(session.userId);
  if (!user) throw bad();
  assertCanSignIn(user);

  const presented = hmac(secret);
  const accessFor = () =>
    signAccessToken({ userId: String(user._id), role: user.role, sessionId: String(session._id) });

  if (safeEqual(presented, session.tokenHash)) {
    const next = randomToken();
    session.prevTokenHash = session.tokenHash;
    session.prevValidUntil = new Date(Date.now() + ROTATION_GRACE);
    session.tokenHash = hmac(next);
    session.lastUsedAt = new Date();
    session.ip = ctx.ip ?? session.ip;
    await session.save();
    return {
      accessToken: await accessFor(),
      refreshToken: `${session._id}.${next}`,
      user: toPublicUser(user),
    };
  }

  // Another tab rotated a moment ago and this request raced it. The cookie already
  // holds the newer token, so hand out an access token and leave the cookie alone.
  const inGrace =
    session.prevTokenHash &&
    session.prevValidUntil &&
    session.prevValidUntil > new Date() &&
    safeEqual(presented, session.prevTokenHash);
  if (inGrace) {
    return { accessToken: await accessFor(), user: toPublicUser(user) };
  }

  // An old token showing up later means it was copied somewhere. Kill the session.
  session.revokedAt = new Date();
  await session.save();
  await audit({
    action: "auth.refresh_reuse_detected",
    actorId: String(user._id),
    targetId: String(session._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  throw bad();
}

export async function logout(rawToken: string | undefined) {
  const [sessionId] = rawToken?.split(".") ?? [];
  if (sessionId && Types.ObjectId.isValid(sessionId)) {
    await Session.updateOne({ _id: sessionId, revokedAt: null }, { revokedAt: new Date() });
  }
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  const filter: Record<string, unknown> = { userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  await Session.updateMany(filter, { revokedAt: new Date() });
}

export async function listSessions(
  userId: string,
  currentSessionId: string,
): Promise<SessionInfo[]> {
  const sessions = await Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ lastUsedAt: -1 });

  return sessions.map((s) => ({
    id: String(s._id),
    device: s.device,
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    current: String(s._id) === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  if (!Types.ObjectId.isValid(sessionId)) throw AppError.notFound();
  // filtering by userId means nobody can revoke someone else's session
  const res = await Session.updateOne(
    { _id: sessionId, userId, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (res.matchedCount === 0) throw AppError.notFound("That session doesn't exist.");
}

/* -------------------------------------------------------------------- OTP */

async function sendEmailOtp(user: UserDoc) {
  const recent = await Token.findOne({
    purpose: TokenPurpose.EMAIL_OTP,
    key: user.email,
    createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN) },
  });
  if (recent) {
    throw new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RATE_LIMITED,
      "Please wait a minute before asking for another code.",
    );
  }

  const code = generateOtp();
  await Token.deleteMany({ purpose: TokenPurpose.EMAIL_OTP, key: user.email });
  await Token.create({
    purpose: TokenPurpose.EMAIL_OTP,
    key: user.email,
    secretHash: hmac(`${user.email}:${code}`),
    expiresAt: new Date(Date.now() + OTP_TTL),
  });
  await mails.otp(user.email, user.name, code);
}

export async function resendOtp(email: string) {
  const user = await User.findOne({ email });
  // say nothing about whether the email exists or is already verified
  if (!user || user.emailVerified) return;
  await sendEmailOtp(user);
}

export async function register(input: RegisterInput, ctx: RequestContext) {
  const passwordHash = await hashPassword(input.password);
  let user = await User.findOne({ email: input.email });

  if (user?.emailVerified) {
    throw AppError.conflict(
      ErrorCode.USER_EMAIL_TAKEN,
      "An account with this email already exists.",
    );
  }

  if (user) {
    // an earlier signup that was never verified - let the person start over
    user.name = input.name;
    user.passwordHash = passwordHash;
    user.role = input.role;
    user.status = initialStatus(input.role);
    await user.save();
  } else {
    user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      status: initialStatus(input.role),
    });
  }

  await sendEmailOtp(user);
  await audit({
    action: "auth.register",
    actorId: String(user._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
}

export async function verifyEmail(email: string, code: string, ctx: RequestContext) {
  const expired = () =>
    new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.AUTH_OTP_EXPIRED,
      "That code has expired. Ask for a new one.",
    );

  const token = await Token.findOne({ purpose: TokenPurpose.EMAIL_OTP, key: email });
  if (!token || token.expiresAt < new Date()) throw expired();

  if (token.attempts >= OTP_MAX_ATTEMPTS) {
    await token.deleteOne();
    throw new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RATE_LIMITED,
      "Too many wrong codes. Ask for a new one.",
    );
  }

  if (!safeEqual(token.secretHash, hmac(`${email}:${code}`))) {
    token.attempts += 1;
    await token.save();
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.AUTH_OTP_INVALID,
      "That code isn't right.",
    );
  }

  const user = await User.findOne({ email });
  if (!user) throw expired();

  user.emailVerified = true;
  await user.save();
  await token.deleteOne();
  assertCanSignIn(user);
  await audit({
    action: "auth.email_verified",
    actorId: String(user._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  return startSession(user, ctx);
}

/* ------------------------------------------------------------ login flows */

export async function login(
  email: string,
  password: string,
  ctx: RequestContext,
): Promise<AuthResult | TwoFactorChallenge> {
  const user = await User.findOne({ email }).select("+passwordHash");

  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / MIN);
    throw new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RATE_LIMITED,
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    user.failedLogins += 1;
    if (user.failedLogins >= LOGIN_MAX_FAILS) {
      user.lockedUntil = new Date(Date.now() + LOCK_FOR);
      user.failedLogins = 0;
      await audit({
        action: "auth.locked",
        actorId: String(user._id),
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
    await user.save();
    await audit({
      action: "auth.login_failed",
      actorId: String(user._id),
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw invalidCredentials();
  }

  assertCanSignIn(user);

  if (!user.emailVerified) {
    // the password was right, so it's safe to help them finish verifying
    await sendEmailOtp(user).catch(() => undefined);
    throw new AppError(
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
      "Please verify your email first. We've sent you a new code.",
    );
  }

  user.failedLogins = 0;
  user.lockedUntil = undefined;
  await user.save();

  // staff with two-factor on still need their code before getting a session
  if (user.totpEnabled) {
    return { twoFactorRequired: true, challengeToken: await signChallengeToken(String(user._id)) };
  }

  await audit({
    action: "auth.login",
    actorId: String(user._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  return startSession(user, ctx);
}

export async function loginWithTotp(challengeToken: string, code: string, ctx: RequestContext) {
  const userId = await verifyChallengeToken(challengeToken);
  const user = await User.findById(userId).select("+totpSecret");
  if (!user?.totpSecret || !user.totpEnabled) throw invalidCredentials();
  assertCanSignIn(user);

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RATE_LIMITED,
      "Too many wrong codes. Try again in a few minutes.",
    );
  }

  if (!verifyTotp(user.totpSecret, code)) {
    user.failedLogins += 1;
    if (user.failedLogins >= LOGIN_MAX_FAILS) {
      user.lockedUntil = new Date(Date.now() + LOCK_FOR);
      user.failedLogins = 0;
    }
    await user.save();
    await audit({
      action: "auth.2fa_failed",
      actorId: String(user._id),
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw new AppError(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_2FA_INVALID,
      "That code isn't right. Check your authenticator app and try again.",
    );
  }

  user.failedLogins = 0;
  await user.save();
  await audit({
    action: "auth.login",
    actorId: String(user._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { twoFactor: true },
  });
  return startSession(user, ctx);
}

/* ------------------------------------------------------- two-factor set-up */

export async function beginTotpSetup(userId: string) {
  const user = await User.findById(userId).select("+totpSecret");
  if (!user || !isStaff(user.role)) throw AppError.forbidden();
  if (user.totpEnabled) throw AppError.badRequest("Two-factor is already on for this account.");

  const secret = generateTotpSecret();
  user.totpSecret = secret;
  await user.save();
  const url = otpauthUrl(secret, user.email);
  return { secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

export async function finishTotpSetup(userId: string, code: string, ctx: RequestContext) {
  const user = await User.findById(userId).select("+totpSecret");
  if (!user?.totpSecret) throw AppError.badRequest("Start the set-up first.");
  if (!verifyTotp(user.totpSecret, code)) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.AUTH_2FA_INVALID,
      "That code isn't right. Check your authenticator app and try again.",
    );
  }
  user.totpEnabled = true;
  await user.save();
  await audit({
    action: "auth.2fa_enabled",
    actorId: userId,
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  return toPublicUser(user);
}

export async function loginWithGoogle(idToken: string, role: Role, ctx: RequestContext) {
  const profile = await verifyGoogleIdToken(idToken);

  let user = await User.findOne({
    $or: [{ googleId: profile.googleId }, { email: profile.email }],
  });

  if (user) {
    // staff must use password + authenticator; Google would skip the second factor
    if (isStaff(user.role)) {
      throw new AppError(
        HttpStatus.FORBIDDEN,
        ErrorCode.AUTH_FORBIDDEN,
        "Team accounts sign in with email, password and an authenticator code.",
      );
    }
    // an existing email account gets linked - Google has verified that mailbox
    user.googleId ??= profile.googleId;
    user.emailVerified = true;
    assertCanSignIn(user);
    await user.save();
  } else {
    user = await User.create({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      emailVerified: true,
      role,
      status: initialStatus(role),
    });
    await audit({
      action: "auth.register_google",
      actorId: String(user._id),
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
  }

  await audit({
    action: "auth.login_google",
    actorId: String(user._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  return startSession(user, ctx);
}

/* -------------------------------------------------------- password changes */

export async function forgotPassword(email: string) {
  const user = await User.findOne({ email });
  if (!user) return; // same answer either way

  const recent = await Token.findOne({
    purpose: TokenPurpose.PASSWORD_RESET,
    key: String(user._id),
    createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN) },
  });
  if (recent) return;

  const secret = randomToken();
  await Token.deleteMany({ purpose: TokenPurpose.PASSWORD_RESET, key: String(user._id) });
  await Token.create({
    purpose: TokenPurpose.PASSWORD_RESET,
    key: String(user._id),
    secretHash: hmac(secret),
    expiresAt: new Date(Date.now() + RESET_TTL),
  });
  await mails.passwordReset(user.email, user.name, secret);
}

export async function resetPassword(secret: string, password: string, ctx: RequestContext) {
  const token = await Token.findOne({
    purpose: TokenPurpose.PASSWORD_RESET,
    secretHash: hmac(secret),
  });
  if (!token || token.expiresAt < new Date()) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.AUTH_TOKEN_EXPIRED,
      "This reset link has expired or was already used. Request a new one.",
    );
  }

  const user = await User.findById(token.key);
  if (!user) throw AppError.notFound();

  user.passwordHash = await hashPassword(password);
  // they just proved they own the mailbox
  user.emailVerified = true;
  user.failedLogins = 0;
  user.lockedUntil = undefined;
  await user.save();
  await token.deleteOne();
  // anyone holding an old session (possibly the reason for the reset) is signed out
  await revokeAllSessions(String(user._id));
  await audit({
    action: "auth.password_reset",
    actorId: String(user._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId: string,
  ctx: RequestContext,
) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw AppError.notFound();

  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      "Your current password is incorrect.",
    );
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllSessions(userId, currentSessionId);
  await audit({
    action: "auth.password_changed",
    actorId: userId,
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
}

/* ------------------------------------------------------------ staff invites */

export async function inviteStaff(
  inviterId: string,
  email: string,
  name: string,
  ctx: RequestContext,
) {
  if (await User.exists({ email })) {
    throw AppError.conflict(
      ErrorCode.USER_EMAIL_TAKEN,
      "Someone with this email already has an account.",
    );
  }

  const secret = randomToken();
  await Token.deleteMany({ purpose: TokenPurpose.STAFF_INVITE, key: email });
  await Token.create({
    purpose: TokenPurpose.STAFF_INVITE,
    key: email,
    secretHash: hmac(secret),
    meta: { invitedBy: inviterId },
    expiresAt: new Date(Date.now() + INVITE_TTL),
  });
  await mails.staffInvite(email, name, secret);
  await audit({
    action: "admin.invited",
    actorId: inviterId,
    targetId: email,
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
}

export async function acceptInvite(
  secret: string,
  name: string,
  password: string,
  ctx: RequestContext,
) {
  const token = await Token.findOne({
    purpose: TokenPurpose.STAFF_INVITE,
    secretHash: hmac(secret),
  });
  if (!token || token.expiresAt < new Date()) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.AUTH_TOKEN_EXPIRED,
      "This invitation has expired. Ask for a new one.",
    );
  }

  const user = await User.create({
    name,
    email: token.key,
    passwordHash: await hashPassword(password),
    role: Role.ADMIN,
    status: AccountStatus.ACTIVE,
    emailVerified: true,
  });
  await token.deleteOne();
  await audit({
    action: "admin.invite_accepted",
    actorId: String(user._id),
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  return startSession(user, ctx);
}
