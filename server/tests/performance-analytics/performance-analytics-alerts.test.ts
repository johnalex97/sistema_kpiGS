import { describe, expect, it } from "vitest";
import { createPerformanceAlerts } from "../../src/performance-analytics/performance-analytics.alerts.js";

describe("performance analytics alerts", () => {
  it("prioritizes critical quality and recurrence signals", () => {
    const alerts = createPerformanceAlerts({
      dimensions: { productivity: 80, compliance: 80, efficiency: 80, quality: 59 },
      applicability: { productivity: true, compliance: true, efficiency: true, quality: true },
      recurrenceRate: 12, hasGoal: true, hasData: true,
    });
    expect(alerts.map(({ code }) => code)).toEqual(["QUALITY_LOW", "RECURRENCE_RATE_HIGH"]);
    expect(alerts.every(({ level }) => level === "CRITICAL")).toBe(true);
  });

  it("reports attention dimensions and insufficient inputs without inventing a score", () => {
    expect(createPerformanceAlerts({
      dimensions: { productivity: 65, compliance: null, efficiency: 69, quality: null },
      applicability: { productivity: true, compliance: false, efficiency: true, quality: false },
      recurrenceRate: null, hasGoal: false, hasData: false,
    }).map(({ code }) => code)).toEqual(["PRODUCTIVITY_LOW", "EFFICIENCY_LOW", "MISSING_GOAL", "INSUFFICIENT_DATA"]);
  });
});
