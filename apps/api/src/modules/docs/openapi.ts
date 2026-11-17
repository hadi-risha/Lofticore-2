import { z } from "zod";
import {
  addressSchema,
  changePasswordSchema,
  chatRequestSchema,
  checkoutSchema,
  forgotPasswordSchema,
  loginSchema,
  productInputSchema,
  productQuerySchema,
  registerSchema,
  reportSchema,
  resetPasswordSchema,
  reviewSchema,
  verifyEmailSchema,
} from "@lofticore/shared";

// The API description (OpenAPI 3.1) served as Swagger UI at /api/docs. Request bodies are
// generated from the same Zod schemas that validate them at runtime (packages/shared), so
// the docs cannot drift from the real rules.

type Json = Record<string, unknown>;

const jsonSchema = (schema: z.ZodType): Json => {
  try {
    const { $schema: _omit, ...rest } = z.toJSONSchema(schema, {
      io: "input",
      unrepresentable: "any",
    }) as Json;
    return rest;
  } catch {
    return { type: "object" };
  }
};

const body = (schema: z.ZodType) => ({
  required: true,
  content: { "application/json": { schema: jsonSchema(schema) } },
});

const errors = {
  "401": { $ref: "#/components/responses/Unauthenticated" },
  "403": { $ref: "#/components/responses/Forbidden" },
};

interface Op {
  summary: string;
  tag: string;
  auth?: "user" | "staff" | "none";
  body?: z.ZodType;
  query?: z.ZodType;
  params?: string[];
  status?: string;
  description?: string;
}

function op(o: Op): Json {
  const auth = o.auth ?? "user";
  return {
    tags: [o.tag],
    summary: o.summary,
    ...(o.description ? { description: o.description } : {}),
    ...(auth === "none" ? { security: [] } : {}),
    ...(auth === "staff"
      ? { description: `${o.description ?? ""} Admin only; needs 2FA.`.trim() }
      : {}),
    parameters: [
      ...(o.params ?? []).map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      })),
      ...(o.query
        ? Object.entries((jsonSchema(o.query).properties as Json | undefined) ?? {}).map(
            ([name, schema]) => ({ name, in: "query", required: false, schema }),
          )
        : []),
    ],
    ...(o.body ? { requestBody: body(o.body) } : {}),
    responses: {
      [o.status ?? "200"]: { description: "Success" },
      "422": { $ref: "#/components/responses/ValidationFailed" },
      ...(auth === "none" ? {} : errors),
    },
  };
}

export function buildOpenApi(version: string): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "Lofticore API",
      version,
      description:
        "Furniture marketplace API: shoppers, sellers, delivery partners and admins.\n\n" +
        "**Auth:** sign in with `POST /auth/login`, then press *Authorize* and paste the " +
        "`accessToken` (15 minutes). Refresh tokens live in an httpOnly cookie.\n\n" +
        "**Errors** always look like `{ code, message, requestId, fields? }`.",
    },
    servers: [{ url: "/api", description: "This server" }],
    tags: [
      { name: "Auth" },
      { name: "Catalogue" },
      { name: "Orders" },
      { name: "Payments" },
      { name: "Trust" },
      { name: "Account" },
      { name: "Seller" },
      { name: "Admin" },
      { name: "System" },
    ],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        Error: {
          type: "object",
          required: ["code", "message", "requestId"],
          properties: {
            code: { type: "string", example: "VALIDATION_FAILED" },
            message: { type: "string" },
            requestId: { type: "string" },
            fields: { type: "object", additionalProperties: { type: "string" } },
          },
        },
      },
      responses: {
        Unauthenticated: {
          description: "Missing or expired access token",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description: "Signed in, but this role may not do that",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        ValidationFailed: {
          description: "Some fields were invalid (see `fields`)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    paths: {
      "/auth/register": {
        post: op({
          tag: "Auth",
          auth: "none",
          summary: "Create an account",
          body: registerSchema,
          status: "201",
        }),
      },
      "/auth/verify-email": {
        post: op({
          tag: "Auth",
          auth: "none",
          summary: "Confirm the 6-digit email code",
          body: verifyEmailSchema,
        }),
      },
      "/auth/login": {
        post: op({
          tag: "Auth",
          auth: "none",
          summary: "Sign in",
          description:
            "Returns an access token and sets the refresh cookie. Team accounts get a 2FA challenge instead.",
          body: loginSchema,
        }),
      },
      "/auth/refresh": {
        post: op({
          tag: "Auth",
          auth: "none",
          summary: "Swap the refresh cookie for a new access token",
        }),
      },
      "/auth/logout": { post: op({ tag: "Auth", summary: "End this session" }) },
      "/auth/forgot-password": {
        post: op({
          tag: "Auth",
          auth: "none",
          summary: "Email a reset link",
          body: forgotPasswordSchema,
        }),
      },
      "/auth/reset-password": {
        post: op({
          tag: "Auth",
          auth: "none",
          summary: "Set a new password",
          body: resetPasswordSchema,
        }),
      },
      "/auth/change-password": {
        post: op({
          tag: "Auth",
          summary: "Change password (signs out other devices)",
          body: changePasswordSchema,
        }),
      },
      "/auth/sessions": { get: op({ tag: "Auth", summary: "List signed-in devices" }) },
      "/auth/sessions/{id}": {
        delete: op({ tag: "Auth", summary: "Sign out one device", params: ["id"] }),
      },

      "/products": {
        get: op({
          tag: "Catalogue",
          auth: "none",
          summary: "Search and filter products",
          query: productQuerySchema,
        }),
      },
      "/products/{slug}": {
        get: op({
          tag: "Catalogue",
          auth: "none",
          summary: "Product detail, including 3D model",
          params: ["slug"],
        }),
      },
      "/products/suggest": {
        get: op({ tag: "Catalogue", auth: "none", summary: "As-you-type suggestions" }),
      },
      "/products/best-sellers": {
        get: op({ tag: "Catalogue", auth: "none", summary: "Best sellers" }),
      },
      "/categories": { get: op({ tag: "Catalogue", auth: "none", summary: "Category tree" }) },
      "/recommendations/for-you": {
        get: op({ tag: "Catalogue", auth: "none", summary: "Personalised picks" }),
      },
      "/products/{slug}/reviews": {
        get: op({ tag: "Trust", auth: "none", summary: "Reviews for a product", params: ["slug"] }),
        post: op({
          tag: "Trust",
          summary: "Review a product you received",
          body: reviewSchema,
          params: ["slug"],
          status: "201",
        }),
      },

      "/addresses": {
        get: op({ tag: "Account", summary: "Address book" }),
        post: op({ tag: "Account", summary: "Add an address", body: addressSchema, status: "201" }),
      },
      "/wishlist": { get: op({ tag: "Account", summary: "Wishlist" }) },
      "/notifications": { get: op({ tag: "Account", summary: "In-app notifications" }) },
      "/events": {
        get: op({
          tag: "Account",
          summary: "Live updates (server-sent events)",
          description:
            "Long-lived `text/event-stream`. Emits `change` events when an order or notification updates.",
        }),
      },

      "/checkout": {
        post: op({
          tag: "Orders",
          summary: "Place an order",
          description:
            "Idempotent per `idempotencyKey`. Prices are read from the database, never the request. Stock is held for 15 minutes for online payments.",
          body: checkoutSchema,
          status: "201",
        }),
      },
      "/orders": { get: op({ tag: "Orders", summary: "My orders" }) },
      "/orders/{id}": {
        get: op({
          tag: "Orders",
          summary: "One order, with shipments and tracking",
          params: ["id"],
        }),
      },
      "/orders/{id}/cancel": {
        post: op({
          tag: "Orders",
          summary: "Cancel until a seller packs it (paid orders are refunded)",
          params: ["id"],
        }),
      },

      "/payments/methods": {
        get: op({
          tag: "Payments",
          auth: "none",
          summary: "Which online payment options are available",
        }),
      },
      "/payments/{id}/razorpay/verify": {
        post: op({
          tag: "Payments",
          summary: "Confirm a Razorpay payment",
          description: "Verifies Razorpay's HMAC signature before trusting the result.",
          params: ["id"],
        }),
      },
      "/payments/webhook/razorpay": {
        post: op({
          tag: "Payments",
          auth: "none",
          summary: "Razorpay server-to-server callback (signed)",
        }),
      },
      "/payments/webhook/mock-upi": {
        post: op({ tag: "Payments", auth: "none", summary: "Demo UPI provider callback (signed)" }),
      },

      "/reports": {
        post: op({ tag: "Trust", summary: "Report a problem", body: reportSchema, status: "201" }),
      },
      "/assistant/chat": {
        post: op({
          tag: "Catalogue",
          auth: "none",
          summary: "Ask the shopping assistant",
          body: chatRequestSchema,
        }),
      },

      "/seller/products": {
        get: op({ tag: "Seller", summary: "My products" }),
        post: op({
          tag: "Seller",
          summary: "Create a product (draft)",
          body: productInputSchema,
          status: "201",
        }),
      },
      "/seller/orders": { get: op({ tag: "Seller", summary: "Parcels to fulfil" }) },
      "/admin/users": { get: op({ tag: "Admin", auth: "staff", summary: "People, with filters" }) },
      "/admin/orders": { get: op({ tag: "Admin", auth: "staff", summary: "All orders" }) },
      "/admin/stats": { get: op({ tag: "Admin", auth: "staff", summary: "Dashboard numbers" }) },

      "/status": {
        get: op({
          tag: "System",
          auth: "none",
          summary: "Health of each dependency (database, Redis, search, queue)",
        }),
      },
    },
  };
}
