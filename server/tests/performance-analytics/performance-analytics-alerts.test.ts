import { describe, expect, it } from "vitest";
import { createPerformanceAlerts } from "../../src/performance-analytics/performance-analytics.alerts.js";

describe("performance analytics alerts", () => {
  it("prioritizes critical quality and recurrence signals", () => {
    const alerts = createPerformanceAlerts({
      dimensions: { productivity: 80, compliance: 80, efficiency: 80, quality: 58 },
      applicability: { productivity: true, compliance: true, efficiency: true, quality: true },
      recurrenceRate: 12, hasGoal: true, hasData: true,
      thresholds: { qualityCriticalThreshold: 59, recurrenceCriticalThreshold: 12, productivityAttentionThreshold: 70, complianceAttentionThreshold: 70, efficiencyAttentionThreshold: 70 },
    });
    expect(alerts.map(({ code }) => code)).toEqual(["QUALITY_LOW"]);
    expect(alerts[0]?.message).toContain("límite: 59.00%");
    expect(alerts.every(({ level }) => level === "CRITICAL")).toBe(true);
  });

  it("reports attention dimensions and insufficient inputs without inventing a score", () => {
    expect(createPerformanceAlerts({
      dimensions: { productivity: 65, compliance: null, efficiency: 69, quality: null },
      applicability: { productivity: true, compliance: false, efficiency: true, quality: false },
      recurrenceRate: null, hasGoal: false, hasData: false,
      thresholds: { qualityCriticalThreshold: 60, recurrenceCriticalThreshold: 10, productivityAttentionThreshold: 66, complianceAttentionThreshold: 70, efficiencyAttentionThreshold: 70 },
    }).map(({ code }) => code)).toEqual(["PRODUCTIVITY_LOW", "EFFICIENCY_LOW", "MISSING_GOAL", "INSUFFICIENT_DATA"]);
  });

  it("does not create threshold alerts without applicable limits", () => {
    expect(createPerformanceAlerts({
      dimensions: { productivity: 20, compliance: 20, efficiency: 20, quality: 20 },
      applicability: { productivity: true, compliance: true, efficiency: true, quality: true },
      recurrenceRate: 80, hasGoal: true, hasData: true, thresholds: null,
    })).toEqual([]);
  });
});
