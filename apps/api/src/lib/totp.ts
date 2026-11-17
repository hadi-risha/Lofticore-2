import { createHmac, randomBytes } from "node:crypto";

// Time-based one-time passwords (RFC 6238) - the 6-digit codes in Google
// Authenticator, Authy, 1Password and friends. Small enough to own outright.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function codeAt(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  const bin =
    ((hmac[offset]! & 127) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}

export const totpNow = (secret: string, at = Date.now()) =>
  codeAt(secret, Math.floor(at / 1000 / STEP_SECONDS));

// Accepts the previous and next 30-second window too, so a slightly-off phone clock still works.
export function verifyTotp(secret: string, code: string, at = Date.now()) {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  return [-1, 0, 1].some((drift) => codeAt(secret, counter + drift) === code);
}

export const otpauthUrl = (secret: string, account: string, issuer = "Lofticore") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=${STEP_SECONDS}&digits=6`;
