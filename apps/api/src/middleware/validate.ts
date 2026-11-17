import type { RequestHandler, Response } from "express";
import type { ZodTypeAny, z } from "zod";

// Parses req.body with a Zod schema and replaces it with the cleaned result, so
// handlers only ever see validated, trimmed, correctly-typed data.
export const validate =
  <S extends ZodTypeAny>(schema: S): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body) satisfies z.infer<S>;
    next();
  };

// Express 5 makes req.query read-only, so the parsed query lives on res.locals.
export const validateQuery =
  <S extends ZodTypeAny>(schema: S): RequestHandler =>
  (req, res, next) => {
    res.locals.query = schema.parse(req.query);
    next();
  };

export const parsedQuery = <S extends ZodTypeAny>(res: Response, _schema?: S) =>
  res.locals.query as z.infer<S>;
