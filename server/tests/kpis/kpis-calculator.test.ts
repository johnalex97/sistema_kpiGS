import { describe, expect, it } from "vitest";
import { calculateWeeklyKpi } from "../../src/kpis/kpis.calculator.js";

const weights = {
  productivity: "0.2000",
  compliance: "0.2500",
  efficiency: "0.2500",
  quality: "0.3000",
} as const;

describe("weekly KPI calculator", () => {
  it("calculates all dimensions and the weighted overall score", () => {
    const result = calculateWeeklyKpi({
      completedCredits: "8.0000",
      targetJobs: 10,
      eligibleCredits: "4.0000",
      onTimeEligibleCredits: "3.0000",
      registeredMinutes: 480,
      productiveMinutes: 360,
      attributableRecurrenceCredits: "1.0000",
      weights,
    });

    expect(result.scores).toEqual({
      productivity: "80.00",
      compliance: "75.00",
      efficiency: "75.00",
      quality: "87.50",
    });
    expect(result.overallScore).toBe("79.75");
  });

  it("caps productivity, floors quality, and marks empty ratios not applicable", () => {
    const bounded = calculateWeeklyKpi({
      completedCredits: "12.0000",
      targetJobs: 10,
      eligibleCredits: "0",
      onTimeEligibleCredits: "0",
      registeredMinutes: 0,
      productiveMinutes: 0,
      attributableRecurrenceCredits: "20",
      weights,
    });
    expect(bounded.scores).toEqual({
      productivity: "100.00",
      compliance: null,
      efficiency: "0.00",
      quality: "0.00",
    });
    expect(bounded.dimensions.compliance.applicability).toBe("NOT_APPLICABLE");
    expect(bounded.dimensions.compliance.effectiveWeight).toBe("0.0000");
  });
});
