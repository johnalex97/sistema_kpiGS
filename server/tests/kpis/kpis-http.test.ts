import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { parseEnvironment } from "../../src/config/env.js";
import { silentLogger } from "../../src/utils/logger.js";
import { database } from "../database/database-test-context.js";

const env = parseEnvironment({
  NODE_ENV: "test", LOG_LEVEL: "silent", CORS_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});

describe("KPI HTTP API", () => {
  it("protects the weekly endpoint with authentication", async () => {
    const response = await request(createApp({ env, logger: silentLogger, database }))
      .get("/api/v1/kpis/weekly?periodStart=2026-08-24")
      .expect(401);
    expect(response.body.errors[0].code).toBe("AUTHENTICATION_REQUIRED");
  });
});
