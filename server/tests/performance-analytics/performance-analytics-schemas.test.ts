import { describe, expect, it } from "vitest";
import { parsePerformanceAnalyticsQuery } from "../../src/performance-analytics/performance-analytics.schemas.js";

describe("performance analytics query schema", () => {
  it("accepts weekly, monthly and yearly queries", () => {
    expect(parsePerformanceAnalyticsQuery({ granularity: "week", periodStart: "2026-05-04" }))
      .toMatchObject({ granularity: "WEEK", periodStart: "2026-05-04" });
    expect(parsePerformanceAnalyticsQuery({ granularity: "month", periodStart: "2026-05-01" }))
      .toMatchObject({ granularity: "MONTH", periodStart: "2026-05-01" });
    expect(parsePerformanceAnalyticsQuery({ granularity: "year", periodStart: "2026-01-01" }))
      .toMatchObject({ granularity: "YEAR", periodStart: "2026-01-01" });
  });

  it("keeps an operational filter as a typed query field", () => {
    const query = parsePerformanceAnalyticsQuery({
      granularity: "month",
      periodStart: "2026-05-01",
      technicianId: "a12f3b45-c678-4d90-8123-456789abcdef",
      clientId: "b12f3b45-c678-4d90-8123-456789abcdef",
      branchId: "c12f3b45-c678-4d90-8123-456789abcdef",
      serviceTypeId: "d12f3b45-c678-4d90-8123-456789abcdef",
      orderStatus: "COMPLETED",
    });

    expect(query).toMatchObject({
      granularity: "MONTH",
      technicianId: "a12f3b45-c678-4d90-8123-456789abcdef",
      clientId: "b12f3b45-c678-4d90-8123-456789abcdef",
      branchId: "c12f3b45-c678-4d90-8123-456789abcdef",
      serviceTypeId: "d12f3b45-c678-4d90-8123-456789abcdef",
      orderStatus: "COMPLETED",
    });
  });

  it.each([
    { granularity: "week", periodStart: "2026-02-30" },
    { granularity: "day", periodStart: "2026-05-04" },
    { granularity: "week", periodStart: "2026-05-04", technicianId: "not-a-uuid" },
    { granularity: "week", periodStart: "2026-05-04", orderStatus: "DONE" },
  ])("rejects malformed public query %#", (query) => {
    expect(() => parsePerformanceAnalyticsQuery(query)).toThrow();
  });
});
