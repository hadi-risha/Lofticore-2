import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real app in a real browser: real API, real database,
// real emails (caught by Mailpit). They need `npm run infra:up` (Mongo + Mailpit).
//
// Locally, use a browser you already have instead of downloading one:
//   PW_CHANNEL=msedge npm run e2e        (or PW_CHANNEL=chrome)
// In CI, Playwright's own Chromium is installed and PW_CHANNEL is left unset.

const channel = process.env.PW_CHANNEL || undefined;
const E2E_DB = "mongodb://localhost:27018/lofticore-e2e?replicaSet=rs0&directConnection=true";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // one retry: two tests depend on slow external things (a model download, a second browser window)
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel }, testMatch: /mobile/ },
  ],
  webServer: [
    {
      // start from a clean, seeded database BEFORE the server boots. (Dropping a database
      // under a running server makes Mongo rebuild collections in the middle of transactions.)
      command: "npm run e2e:db -w @lofticore/api && npm run dev -w @lofticore/api",
      url: "http://localhost:5000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // "test" switches off the rate limiters, which a fast test run would trip
        NODE_ENV: "test",
        MONGO_URI: E2E_DB,
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        LOG_LEVEL: "warn",
      },
    },
    {
      // the production build, not the dev server: Vite's dev server re-optimises its
      // dependencies the first time it meets a new page and reloads mid-test
      command:
        "npm run build -w @lofticore/web && npm run preview -w @lofticore/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
