import { OAuth2Client } from "google-auth-library";
import { ErrorCode, HttpStatus } from "@lofticore/shared";
import { env } from "../../config/env";
import { AppError } from "../../lib/app-error";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

const client = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

// Checks the ID token Google gave the browser: signature, audience (our client id)
// and expiry. We never trust anything the browser tells us about the user directly.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!client) {
    throw new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SERVICE_UNAVAILABLE,
      "Google sign-in isn't set up yet.",
    );
  }

  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) {
      throw new Error("google account has no verified email");
    }
    return {
      googleId: p.sub,
      email: p.email.toLowerCase(),
      name: p.name ?? p.email.split("@")[0]!,
    };
  } catch {
    throw new AppError(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_TOKEN_INVALID,
      "We couldn't verify your Google account. Please try again.",
    );
  }
}
