import { SignJWT, jwtVerify, errors } from "jose";
import { ErrorCode, HttpStatus, type Role } from "@lofticore/shared";
import { env } from "../config/env";
import { AppError } from "./app-error";

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = "lofticore-api";

export interface AccessClaims {
  userId: string;
  role: Role;
  sessionId: string;
}

export const signAccessToken = ({ userId, role, sessionId }: AccessClaims) =>
  new SignJWT({ role, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MIN}m`)
    .sign(secret);

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    // other kinds of token (like the two-factor challenge) must never pass as a session
    if (!payload.sub || !payload.role || !payload.sid) throw new Error("not an access token");
    return {
      userId: String(payload.sub),
      role: payload.role as Role,
      sessionId: String(payload.sid),
    };
  } catch (err) {
    // the client uses TOKEN_EXPIRED as its cue to call /auth/refresh
    if (err instanceof errors.JWTExpired) {
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_EXPIRED, "Session expired.");
    }
    throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_INVALID, "Invalid session.");
  }
}

/* ------------------------------------------------- two-factor login challenge */

// Proof that the password step passed. Worthless on its own: it can't open a
// session without the 6-digit code, and it expires in five minutes.
export const signChallengeToken = (userId: string) =>
  new SignJWT({ typ: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);

export async function verifyChallengeToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
    if (payload.typ !== "2fa" || !payload.sub) throw new Error("wrong token type");
    return payload.sub;
  } catch {
    throw new AppError(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_TOKEN_EXPIRED,
      "That sign-in attempt expired. Please sign in again.",
    );
  }
}
