import { describe, expect, it } from "vitest";
import {
  requiresPreventiveAction,
  sumUniqueProductiveMinutes,
  validateQualityDecisions,
} from "../../src/recurrences/recurrences.calculations.js";

describe("recurrence calculations", () => {
  it("sums each productive activity once regardless of team size", () => {
    expect(sumUniqueProductiveMinutes([
      { id: "activity-1", productiveMinutes: 40 },
      { id: "activity-1", productiveMinutes: 40 },
      { id: "activity-2", productiveMinutes: 25 },
    ])).toBe(65);
  });

  it("requires a preventive action for high impact or technical responsibility", () => {
    expect(requiresPreventiveAction("HIGH", "CLIENT")).toBe(true);
    expect(requiresPreventiveAction("LOW", "TECHNICAL_WORK")).toBe(true);
    expect(requiresPreventiveAction("MEDIUM", "EQUIPMENT")).toBe(false);
  });

  it("permits quality only for documented original snapshots and requires it for technical work", () => {
    expect(validateQualityDecisions("TECHNICAL_WORK", ["tech-1"], [
      { technicianId: "tech-1", affectsQuality: true, justification: "Intervención técnica deficiente" },
    ])).toEqual({ valid: true });
    expect(validateQualityDecisions("TECHNICAL_WORK", ["tech-1"], [
      { technicianId: "tech-1", affectsQuality: false },
    ])).toEqual({ valid: false, reason: "TECHNICAL_WORK_QUALITY_REQUIRED" });
    expect(validateQualityDecisions("EQUIPMENT", ["tech-1"], [
      { technicianId: "tech-1", affectsQuality: true, justification: "No corresponde" },
    ])).toEqual({ valid: false, reason: "NON_TECHNICAL_QUALITY_FORBIDDEN" });
    expect(validateQualityDecisions("TECHNICAL_WORK", ["tech-1"], [
      { technicianId: "tech-2", affectsQuality: true, justification: "No es snapshot original" },
    ])).toEqual({ valid: false, reason: "QUALITY_TECHNICIAN_NOT_ORIGINAL" });
  });
});
