import { describe, expect, it } from "vitest";
import { consolidateOfficialWeeks } from "../../src/kpis/kpis.consolidation.js";

describe("official KPI consolidation", () => {
  it("uses current revisions, summed ratios, and target-weighted weekly overall", () => {
    const result = consolidateOfficialWeeks({
      expectedWeeks: ["2026-08-03", "2026-08-10"],
      weeks: [
        { technicianId: "a", code: "TEC-A", fullName: "Ana", periodStart: "2026-08-03", periodEnd: "2026-08-09", revision: 1, isCurrent: false, appliedTarget: 10, completedCredits: "5.0000", eligibleCredits: "5.0000", onTimeEligibleCredits: "5.0000", registeredMinutes: 100, productiveMinutes: 100, attributableRecurrenceCredits: "0.0000", overallScore: "50.00", qualityScore: "100.00" },
        { technicianId: "a", code: "TEC-A", fullName: "Ana", periodStart: "2026-08-03", periodEnd: "2026-08-09", revision: 2, isCurrent: true, appliedTarget: 10, completedCredits: "8.0000", eligibleCredits: "8.0000", onTimeEligibleCredits: "6.0000", registeredMinutes: 600, productiveMinutes: 480, attributableRecurrenceCredits: "1.0000", overallScore: "80.00", qualityScore: "87.50" },
        { technicianId: "a", code: "TEC-A", fullName: "Ana", periodStart: "2026-08-10", periodEnd: "2026-08-16", revision: 1, isCurrent: true, appliedTarget: 20, completedCredits: "10.0000", eligibleCredits: "5.0000", onTimeEligibleCredits: "5.0000", registeredMinutes: 600, productiveMinutes: 300, attributableRecurrenceCredits: "0.0000", overallScore: "50.00", qualityScore: "100.00" },
      ],
    });
    expect(result.items[0]).toMatchObject({
      completedCredits: "18.0000", productivityScore: "60.00", complianceScore: "84.62",
      efficiencyScore: "65.00", qualityScore: "94.44", overallScore: "60.00", coverage: "2/2",
    });
  });

  it("reports missing weekly coverage", () => {
    const result = consolidateOfficialWeeks({ expectedWeeks: ["2026-08-03", "2026-08-10"], weeks: [] });
    expect(result.warnings).toEqual([{ code: "MISSING_OFFICIAL_WEEKS", missingWeekStarts: ["2026-08-03", "2026-08-10"] }]);
  });
});
