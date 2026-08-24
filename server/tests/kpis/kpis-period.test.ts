import { describe, expect, it } from "vitest";
import { parseWeekStart, resolveWeek } from "../../src/kpis/kpis.period.js";

describe("KPI weekly periods", () => {
  it("resolves Monday through Sunday in the company timezone", () => {
    expect(resolveWeek(new Date("2026-08-24T15:00:00.000Z"), "America/Tegucigalpa"))
      .toEqual({
        periodStart: "2026-08-24",
        periodEnd: "2026-08-30",
        startInclusive: new Date("2026-08-24T06:00:00.000Z"),
        endExclusive: new Date("2026-08-31T06:00:00.000Z"),
      });
  });

  it("rejects invalid dates and non-Monday starts", () => {
    expect(parseWeekStart("2026-08-25", "America/Tegucigalpa"))
      .toEqual({ kind: "INVALID_WEEK_START" });
    expect(parseWeekStart("not-a-date", "America/Tegucigalpa"))
      .toEqual({ kind: "INVALID_WEEK_START" });
  });
});
