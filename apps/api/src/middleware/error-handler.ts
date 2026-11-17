import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ErrorCode, HttpStatus, type ApiErrorBody } from "@lofticore/shared";
import { AppError } from "../lib/app-error";
import { logger } from "../config/logger";
import { captureError } from "../lib/sentry";
import { uploadErrorHandler } from "../modules/uploads/upload.routes";

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    code: ErrorCode.NOT_FOUND,
    message: `No route for ${req.method} ${req.path}`,
    requestId: String(req.id),
  };
  res.status(HttpStatus.NOT_FOUND).json(body);
};

// Express 5 forwards rejected promises here, so controllers don't need try/catch.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    const body: ApiErrorBody = {
      code: ErrorCode.VALIDATION_FAILED,
      message: "Some fields need your attention.",
      fields,
      requestId,
    };
    res.status(HttpStatus.UNPROCESSABLE_ENTITY).json(body);
    return;
  }

  // multer reports oversize files with its own error type
  err = uploadErrorHandler(err) ?? err;

  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      code: err.code,
      message: err.message,
      fields: err.fields,
      requestId,
    };
    res.status(err.status).json(body);
    return;
  }

  // a bug or an outage - log everything, tell the client very little
  logger.error({ err, requestId }, "unhandled error");
  captureError(err, requestId);
  const body: ApiErrorBody = {
    code: ErrorCode.INTERNAL,
    message: "Something went wrong on our side. Please try again.",
    requestId,
  };
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
};
