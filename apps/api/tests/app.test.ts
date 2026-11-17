import request from "supertest";
import { describe, expect, it } from "vitest";
import { ErrorCode, HttpStatus } from "@lofticore/shared";
import { createApp } from "../src/app";

const app = createApp();

describe("app basics", () => {
  it("answers the liveness check", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.status).toBe("ok");
  });

  it("tags every response with a request id", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("keeps a sane incoming request id", async () => {
    const res = await request(app).get("/health").set("x-request-id", "abc-12345678");
    expect(res.headers["x-request-id"]).toBe("abc-12345678");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
    expect(res.body.requestId).toBeTruthy();
  });

  it("reports not ready when the db is down", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
