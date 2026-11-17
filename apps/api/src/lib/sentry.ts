import * as Sentry from "@sentry/node";
import { env } from "../config/env";

// Error tracking, only when SENTRY_DSN is set. Every unhandled 500 is sent with its
// request id, so a user's screenshot of the error leads straight to the Sentry event.
// Request bodies, cookies and headers are not sent (they can hold passwords and tokens).

export const sentryEnabled = Boolean(env.SENTRY_DSN) && !env.isTest;

if (sentryEnabled) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.isProd ? 0.1 : 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
      }
      return event;
    },
  });
}

export function captureError(err: unknown, requestId: string) {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("requestId", requestId);
    Sentry.captureException(err);
  });
}
