import { describe, expect, it } from "vitest";
import { resolvePerformancePeriod } from "../../src/performance-analytics/performance-analytics.period.js";

describe("performance analytics period resolver", () => {
  const timeZone = "America/Tegucigalpa";

  it("resolves a Honduras week using local inclusive and exclusive bounds", () => {
    expect(resolvePerformancePeriod({ granularity: "WEEK", periodStart: "2026-05-04" }, timeZone)).toMatchObject({
      granularity: "WEEK",
      periodStart: "2026-05-04",
      periodEnd: "2026-05-10",
      startInclusive: new Date("2026-05-04T06:00:00.000Z"),
      endExclusive: new Date("2026-05-11T06:00:00.000Z"),
    });
  });

  it("resolves calendar month and year boundaries in Honduras", () => {
    expect(resolvePerformancePeriod({ granularity: "MONTH", periodStart: "2026-05-01" }, timeZone)).toMatchObject({
      periodEnd: "2026-05-31",
      startInclusive: new Date("2026-05-01T06:00:00.000Z"),
      endExclusive: new Date("2026-06-01T06:00:00.000Z"),
    });
    expect(resolvePerformancePeriod({ granularity: "YEAR", periodStart: "2026-01-01" }, timeZone)).toMatchObject({
      periodEnd: "2026-12-31",
      startInclusive: new Date("2026-01-01T06:00:00.000Z"),
      endExclusive: new Date("2027-01-01T06:00:00.000Z"),
    });
  });

  it.each([
    [{ granularity: "WEEK" as const, periodStart: "2026-05-05" }],
    [{ granularity: "MONTH" as const, periodStart: "2026-05-02" }],
    [{ granularity: "YEAR" as const, periodStart: "2026-02-01" }],
  ])("rejects a period start outside its granularity boundary", (query) => {
    expect(() => resolvePerformancePeriod(query, timeZone)).toThrow();
  });
});
