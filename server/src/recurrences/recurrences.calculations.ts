import type {
  ImpactoReincidencia,
  ResponsabilidadReincidencia,
} from "../../generated/prisma/client.js";
import type { QualityDecisionInput } from "./recurrences.types.js";

export type QualityValidationResult =
  | { valid: true }
  | { valid: false; reason: "QUALITY_TECHNICIAN_NOT_ORIGINAL" | "QUALITY_JUSTIFICATION_REQUIRED" | "NON_TECHNICAL_QUALITY_FORBIDDEN" | "TECHNICAL_WORK_QUALITY_REQUIRED" };

export function requiresPreventiveAction(impact: ImpactoReincidencia, responsibility: ResponsabilidadReincidencia): boolean {
  return impact === "HIGH" || responsibility === "TECHNICAL_WORK";
}

export function sumUniqueProductiveMinutes(rows: readonly { id: string; productiveMinutes: number }[]): number {
  const activities = new Map<string, number>();
  for (const row of rows) activities.set(row.id, row.productiveMinutes);
  return [...activities.values()].reduce((sum, minutes) => sum + minutes, 0);
}

export function validateQualityDecisions(
  responsibility: ResponsabilidadReincidencia,
  originalTechnicianIds: readonly string[],
  decisions: readonly QualityDecisionInput[],
): QualityValidationResult {
  const originalIds = new Set(originalTechnicianIds);
  const qualityDecisions = decisions.filter((decision) => decision.affectsQuality);
  if (qualityDecisions.some((decision) => !originalIds.has(decision.technicianId))) {
    return { valid: false, reason: "QUALITY_TECHNICIAN_NOT_ORIGINAL" };
  }
  if (qualityDecisions.some((decision) => !decision.justification?.trim())) {
    return { valid: false, reason: "QUALITY_JUSTIFICATION_REQUIRED" };
  }
  if (responsibility !== "TECHNICAL_WORK" && qualityDecisions.length > 0) {
    return { valid: false, reason: "NON_TECHNICAL_QUALITY_FORBIDDEN" };
  }
  if (responsibility === "TECHNICAL_WORK" && qualityDecisions.length === 0) {
    return { valid: false, reason: "TECHNICAL_WORK_QUALITY_REQUIRED" };
  }
  return { valid: true };
}
