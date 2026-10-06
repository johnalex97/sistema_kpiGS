import { describe, expect, it } from "vitest";
import { buildHistoryWindow, historyToday } from "../../src/kpis/kpis.history.period.js";

describe("history calendar", () => {
  it("uses business midnight", () => expect(historyToday(new Date("2026-10-05T05:30:00Z"), "America/Tegucigalpa")).toBe("2026-10-04"));
  it("builds twelve Monday-Sunday weeks including current", () => {
    const points = buildHistoryWindow({ granularity: "WEEK" }, "2026-10-06");
    expect(points).toHaveLength(12);
    expect(points[0]?.periodStart).toBe("2026-07-20");
    expect(points[11]).toEqual({ periodStart: "2026-10-05", periodEnd: "2026-10-11", expectedWeekStarts: ["2026-10-05"] });
  });
  it("assigns crossing weeks to the month of their Sunday", () => {
    const points = buildHistoryWindow({ granularity: "MONTH" }, "2026-10-06");
    expect(points).toHaveLength(12); expect(points[0]?.periodStart).toBe("2025-11-01");
    expect(points[11]).toEqual({ periodStart: "2026-10-01", periodEnd: "2026-10-31", expectedWeekStarts: ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"] });
    expect(points[10]?.expectedWeekStarts).not.toContain("2026-09-28");
  });
  it("includes leap days and five full calendar years", () => {
    expect(buildHistoryWindow({ granularity: "MONTH" }, "2024-02-20")[11]?.periodEnd).toBe("2024-02-29");
    const points = buildHistoryWindow({ granularity: "YEAR" }, "2026-10-06");
    expect(points).toHaveLength(5); expect(points[0]?.periodStart).toBe("2022-01-01"); expect(points[4]?.periodEnd).toBe("2026-12-31");
  });
  it("preserves four digit years and rejects windows before year one", () => {
    expect(buildHistoryWindow({ granularity: "YEAR" }, "0099-10-06")[4]?.periodStart).toBe("0099-01-01");
    expect(() => buildHistoryWindow({ granularity: "YEAR" }, "0004-10-06")).toThrow();
  });
});
