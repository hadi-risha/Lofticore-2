/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Google OAuth client id. Leave unset to hide the Google button.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Sentry DSN for browser error tracking. Leave unset to turn it off.
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
