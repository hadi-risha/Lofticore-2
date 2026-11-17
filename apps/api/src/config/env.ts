import { z } from "zod";
import { productionProblems } from "./production-checks";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().optional(),
  // Meilisearch powers product search (typo tolerance, as-you-type). Optional: without it
  // search falls back to MongoDB text search.
  MEILI_HOST: z.string().optional(),
  MEILI_API_KEY: z.string().optional(),
  // Sentry error tracking (optional)
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // signs access tokens and hashes OTPs - generate with: openssl rand -hex 32
  JWT_ACCESS_SECRET: z.string().min(32, "use at least 32 characters"),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // mail - Mailpit in dev (docker compose), a real SMTP/API provider in prod
  MAIL_TRANSPORT: z.enum(["smtp", "memory"]).default("smtp"),
  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Lofticore <no-reply@lofticore.local>"),

  // signs payment callbacks from the (demo) UPI provider; a real gateway gives you its own
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default("dev-payment-webhook-secret-change-me"),
  // Razorpay (test keys start with rzp_test_). Leave empty to hide the option.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  // optional: set when you add a webhook in the Razorpay dashboard (covers a closed tab)
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // the UPI id shown to customers as the payee
  PAYEE_VPA: z.string().default("lofticore@mockbank"),

  // where uploaded photos and 3D models are kept (see src/lib/storage.ts)
  STORAGE: z.enum(["local", "cloudinary"]).default("local"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // The UPI payments in this app are a demo (no real money moves). In production they're
  // switched off unless you say otherwise, for example on a staging site or a public demo.
  ALLOW_DEMO_PAYMENTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // optional: Google's free Gemini tier answers questions the built-in guide can't
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),

  // optional until you create a Google OAuth client
  GOOGLE_CLIENT_ID: z.string().optional(),

  // used by `npm run seed:super-admin`
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(10).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // logger isn't up yet, and this runs before anything else
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

if (parsed.data.NODE_ENV === "production") {
  const problems = productionProblems(parsed.data);
  if (problems.length > 0) {
    console.error("Refusing to start in production:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  clientOrigins: parsed.data.CLIENT_ORIGIN.split(",").map((o) => o.trim()),
  // first origin is the canonical web app, used in email links
  clientUrl: (parsed.data.CLIENT_ORIGIN.split(",")[0] ?? "").trim(),
};
