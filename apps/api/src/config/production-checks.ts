// Things that are fine on a laptop and dangerous on the internet. The server refuses to
// start in production while any of them is true, instead of quietly running unsafely.

export interface ProdConfig {
  JWT_ACCESS_SECRET: string;
  PAYMENT_WEBHOOK_SECRET: string;
  CLIENT_ORIGIN: string;
  MONGO_URI: string;
  SUPER_ADMIN_PASSWORD?: string;
  LOG_LEVEL?: string;
  STORAGE: "local" | "cloudinary";
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
}

const looksLikePlaceholder = (v: string) =>
  /change-?(me|this)|test-secret|dev-|example|password/i.test(v);

export function productionProblems(c: ProdConfig): string[] {
  const problems: string[] = [];

  if (looksLikePlaceholder(c.JWT_ACCESS_SECRET)) {
    problems.push(
      "JWT_ACCESS_SECRET is still a placeholder. Generate one with: openssl rand -hex 32",
    );
  }
  if (looksLikePlaceholder(c.PAYMENT_WEBHOOK_SECRET)) {
    problems.push(
      "PAYMENT_WEBHOOK_SECRET is still a placeholder. Generate one with: openssl rand -hex 32",
    );
  }
  if (c.CLIENT_ORIGIN.split(",").some((o) => !o.trim().startsWith("https://"))) {
    problems.push("CLIENT_ORIGIN must use https:// in production (cookies are Secure).");
  }
  if (/localhost|127\.0\.0\.1/.test(c.MONGO_URI)) {
    problems.push(
      "MONGO_URI points at localhost. Use your hosted database (for example MongoDB Atlas).",
    );
  }
  if (c.SUPER_ADMIN_PASSWORD && looksLikePlaceholder(c.SUPER_ADMIN_PASSWORD)) {
    problems.push(
      "SUPER_ADMIN_PASSWORD is a placeholder. Set a strong one before running seed:super-admin.",
    );
  }
  if (c.LOG_LEVEL === "debug" || c.LOG_LEVEL === "trace") {
    problems.push(
      "LOG_LEVEL is debug/trace. Verbose logs can include request details; use info or warn in production.",
    );
  }
  if (
    c.STORAGE === "cloudinary" &&
    !(c.CLOUDINARY_CLOUD_NAME && c.CLOUDINARY_API_KEY && c.CLOUDINARY_API_SECRET)
  ) {
    problems.push(
      "STORAGE=cloudinary needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
  }
  return problems;
}
