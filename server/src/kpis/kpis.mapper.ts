import type { KpiResultRecord } from "./kpis.repository.types.js";

const fixed = (value: { toFixed(digits: number): string } | null, digits: number) => value === null ? null : value.toFixed(digits);

const thresholdKeys = [
  "qualityCriticalThreshold", "recurrenceCriticalThreshold", "productivityAttentionThreshold",
  "complianceAttentionThreshold", "efficiencyAttentionThreshold",
] as const;

function mapAlertThresholds(metadata: Record<string, unknown>) {
  if (metadata.alertThresholdSource !== "SNAPSHOT" || typeof metadata.alertThresholds !== "object" || metadata.alertThresholds === null) return null;
  const thresholds = metadata.alertThresholds as Record<string, unknown>;
  const mapped = Object.fromEntries(thresholdKeys.map((key) => {
    const value = Number(thresholds[key]);
    return [key, Number.isFinite(value) ? value.toFixed(2) : null];
  }));
  return Object.values(mapped).every((value) => value !== null) ? mapped : null;
}

export function mapKpiResult(result: KpiResultRecord) {
  const metadata = typeof result.calculationMetadata === "object" && result.calculationMetadata !== null
    ? result.calculationMetadata as Record<string, unknown> : {};
  const alertThresholds = mapAlertThresholds(metadata);
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
    ...(alertThresholds !== null && { alertThresholds, alertThresholdSource: "SNAPSHOT" as const }),
  };
}
