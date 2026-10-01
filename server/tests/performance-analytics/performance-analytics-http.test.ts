import { describe, expect, it, vi } from "vitest";
import { createPerformanceAnalyticsController } from "../../src/performance-analytics/performance-analytics.controller.js";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { parseEnvironment } from "../../src/config/env.js";
import { silentLogger } from "../../src/utils/logger.js";
import { database } from "../database/database-test-context.js";

function response() {
  const value = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
  value.status.mockReturnValue(value);
  return value;
}

describe("performance analytics HTTP controller", () => {
  it("returns the standard summary envelope after validating the query", async () => {
    const service = { getSummary: vi.fn(async () => ({ rows: [] })) };
    const controller = createPerformanceAnalyticsController(service as never);
    const res = response(); const next = vi.fn();
    await controller.summary({ query: { granularity: "week", periodStart: "2026-05-04" }, auth: { userId: "u", technicianId: null, permissions: ["KPI_VIEW_ALL"] }, requestId: "r" } as never, res as never, next);
    expect(service.getSummary).toHaveBeenCalledWith({ granularity: "WEEK", periodStart: "2026-05-04" }, expect.objectContaining({ permissions: ["KPI_VIEW_ALL"] }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { rows: [] } }));
  });

  it("rejects an invalid query before the service reads facts", async () => {
    const service = { getSummary: vi.fn() }; const controller = createPerformanceAnalyticsController(service as never); const res = response(); const next = vi.fn();
    await controller.summary({ query: { granularity: "week", periodStart: "bad" }, auth: { userId: "u", technicianId: null, permissions: ["KPI_VIEW_ALL"] }, requestId: "r" } as never, res as never, next);
    expect(service.getSummary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

describe("performance analytics HTTP routes", () => {
  it("requires authentication before publishing a summary", async () => {
    const env = parseEnvironment({ NODE_ENV: "test", LOG_LEVEL: "silent", CORS_ORIGIN: "http://localhost:5173", DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public", DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test" });
    const response = await request(createApp({ env, logger: silentLogger, database })).get("/api/v1/performance-analytics/summary?granularity=week&periodStart=2026-05-04");
    expect(response.status).toBe(401);
    expect(response.body.errors[0].code).toBe("AUTHENTICATION_REQUIRED");
  });
});
