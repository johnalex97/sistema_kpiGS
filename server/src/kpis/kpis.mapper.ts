import type { KpiResultRecord } from "./kpis.repository.types.js";

const fixed = (value: { toFixed(digits: number): string } | null, digits: number) => value === null ? null : value.toFixed(digits);

export function mapKpiResult(result: KpiResultRecord) {
  const metadata = typeof result.calculationMetadata === "object" && result.calculationMetadata !== null
    ? result.calculationMetadata as Record<string, unknown> : {};
  return {
    id: result.id,
    technicianId: result.tecnicoId,
    periodStart: result.periodStart.toISOString().slice(0, 10),
    periodEnd: result.periodEnd.toISOString().slice(0, 10),
    completedCredits: fixed(result.completedCredits, 4),
    appliedTarget: result.appliedTarget,
    registeredMinutes: result.registeredMinutes,
    productiveMinutes: result.productiveMinutes,
    eligibleCredits: fixed(result.eligibleCredits, 4),
    onTimeEligibleCredits: fixed(result.onTimeEligibleCredits, 4),
    attributableRecurrenceCredits: fixed(result.attributableRecurrenceCredits, 4),
    productivityScore: fixed(result.productivityScore, 2),
    complianceScore: fixed(result.complianceScore, 2),
    efficiencyScore: fixed(result.efficiencyScore, 2),
    qualityScore: fixed(result.qualityScore, 2),
    overallScore: fixed(result.overallScore, 2),
    weights: {
      productivity: fixed(result.productivityWeight, 4), compliance: fixed(result.complianceWeight, 4),
      efficiency: fixed(result.efficiencyWeight, 4), quality: fixed(result.qualityWeight, 4),
    },
    effectiveWeights: {
      productivity: fixed(result.productivityEffectiveWeight, 4), compliance: fixed(result.complianceEffectiveWeight, 4),
      efficiency: fixed(result.efficiencyEffectiveWeight, 4), quality: fixed(result.qualityEffectiveWeight, 4),
    },
    applicability: { compliance: result.complianceApplicability, quality: result.qualityApplicability },
    revision: result.revision,
    isCurrent: result.isCurrent,
    calculationType: result.calculationType,
    calculationReason: result.calculationReason,
    calculatedAt: result.calculatedAt.toISOString(),
    sourceIds: {
      orderIds: Array.isArray(metadata.orderIds) ? metadata.orderIds : [],
      recurrenceIds: Array.isArray(metadata.recurrenceIds) ? metadata.recurrenceIds : [],
    },
  };
}
