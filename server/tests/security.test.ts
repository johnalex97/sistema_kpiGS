import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { silentLogger } from "../src/utils/logger.js";

const env = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGIN: "https://allowed.example.com",
  JSON_BODY_LIMIT: "1kb",
  DATABASE_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});

describe("HTTP security", () => {
  it("sets security headers and hides Express", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/health")
      .expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("authorizes an allowed CORS origin", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/health")
      .set("Origin", "https://allowed.example.com")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://allowed.example.com",
    );
  });

  it("does not authorize a disallowed CORS origin", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/health")
      .set("Origin", "https://attacker.example.com")
      .expect(403);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects JSON bodies larger than the configured limit", async () => {
    const response = await request(
      createApp({
        env,
        logger: silentLogger,
        registerRoutes: (app) => {
          app.post("/echo", (_req, res) => res.status(204).end());
        },
      }),
    )
      .post("/echo")
      .send({ content: "x".repeat(2048) })
      .expect(413);

    expect(response.body.success).toBe(false);
  });
});
