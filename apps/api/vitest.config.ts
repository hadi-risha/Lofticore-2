import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // the auth tests share one real MongoDB (docker compose up), so run files one by one
    fileParallelism: false,
    // each test signs in several real users (argon2 is deliberately slow)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      MONGO_URI: "mongodb://localhost:27018/lofticore-test?replicaSet=rs0&directConnection=true",
      LOG_LEVEL: "silent",
      MAIL_TRANSPORT: "memory",
      JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123",
      GOOGLE_CLIENT_ID: "test-client-id",
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "rzp_test_secret_for_tests",
      RAZORPAY_WEBHOOK_SECRET: "webhook_secret_for_tests",
    },
  },
});
