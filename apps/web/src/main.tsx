import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Providers } from "@/app/providers";
import { router } from "@/app/router";
import "./index.css";

// Error tracking loads only when a DSN is configured, so it costs nothing otherwise.
if (import.meta.env.VITE_SENTRY_DSN) {
  void import("@sentry/react").then((Sentry) =>
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      // no session replay: forms here hold passwords and addresses
    }),
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
