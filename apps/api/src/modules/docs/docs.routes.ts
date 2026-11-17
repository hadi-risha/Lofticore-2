import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApi } from "./openapi";

export const docsRouter = Router();

const spec = buildOpenApi(process.env.npm_package_version ?? "0.1.0");

// the raw description, for Postman, code generators and tests
docsRouter.get("/openapi.json", (_req, res) => {
  res.json(spec);
});

// Swagger UI needs inline scripts and styles, which the API's strict default policy
// forbids. This page only, and it serves no user data, gets a relaxed policy.
docsRouter.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
  );
  next();
});
docsRouter.use("/", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Lofticore API" }));
