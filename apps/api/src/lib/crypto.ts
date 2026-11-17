import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

// HMAC with the server secret rather than a bare hash: a leaked database alone
// can't be used to brute-force the 6-digit codes or guess tokens.
export const hmac = (value: string) =>
  createHmac("sha256", env.JWT_ACCESS_SECRET).update(value).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const generateOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
