import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { silentLogger } from "../src/utils/logger.js";

const testEnv = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});

describe("GET /api/v1/health", () => {
  it("returns service health using the API contract", async () => {
    const response = await request(createApp({ env: testEnv, logger: silentLogger }))
      .get("/api/v1/health")
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      message: "Servicio disponible",
      data: {
        status: "ok",
        service: "geek-solution-service-control-api",
        version: "0.1.0",
        environment: "test",
      },
      errors: [],
      meta: { requestId: expect.any(String) },
    });
    expect(response.body.data.timestamp).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).toBe(response.body.meta.requestId);
  });

  it("preserves a valid request identifier", async () => {
    const requestId = "8a942f39-8ec7-42ea-b2d4-9f0121e57016";
    const response = await request(createApp({ env: testEnv, logger: silentLogger }))
      .get("/api/v1/health")
      .set("x-request-id", requestId)
      .expect(200);

    expect(response.headers["x-request-id"]).toBe(requestId);
    expect(response.body.meta.requestId).toBe(requestId);
  });

  it("replaces an invalid request identifier", async () => {
    const response = await request(createApp({ env: testEnv, logger: silentLogger }))
      .get("/api/v1/health")
      .set("x-request-id", "<script>alert(1)</script>")
      .expect(200);

    expect(response.body.meta.requestId).not.toBe("<script>alert(1)</script>");
    expect(response.body.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
