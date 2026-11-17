import { ErrorCode, HttpStatus } from "@lofticore/shared";

// Throw this from services when something is the caller's fault. Anything else
// that bubbles up is treated as a bug and answered with a generic 500.
export class AppError extends Error {
  constructor(
    public readonly status: HttpStatus,
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, code: ErrorCode = ErrorCode.VALIDATION_FAILED) {
    return new AppError(HttpStatus.BAD_REQUEST, code, message);
  }

  static unauthenticated(message = "Please sign in to continue.") {
    return new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_UNAUTHENTICATED, message);
  }

  static forbidden(message = "You don't have permission to do that.") {
    return new AppError(HttpStatus.FORBIDDEN, ErrorCode.AUTH_FORBIDDEN, message);
  }

  static notFound(message = "We couldn't find what you were looking for.") {
    return new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message);
  }

  static conflict(code: ErrorCode, message: string) {
    return new AppError(HttpStatus.CONFLICT, code, message);
  }
}
