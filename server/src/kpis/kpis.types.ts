export interface KpiWeek {
  periodStart: string;
  periodEnd: string;
  startInclusive: Date;
  endExclusive: Date;
}

export interface KpiWeights {
  productivity: string;
  compliance: string;
  efficiency: string;
  quality: string;
}

export interface WeeklyKpiCalculationInput {
  completedCredits: string;
  targetJobs: number;
  eligibleCredits: string;
  onTimeEligibleCredits: string;
  registeredMinutes: number;
  productiveMinutes: number;
  attributableRecurrenceCredits: string;
  weights: KpiWeights;
}

export type KpiApplicability = "APPLICABLE" | "NOT_APPLICABLE";

export interface KpiDimensionResult {
  applicability: KpiApplicability;
  score: string | null;
  configuredWeight: string;
  effectiveWeight: string;
}

export interface WeeklyKpiCalculation {
  scores: {
    productivity: string;
    compliance: string | null;
    efficiency: string;
    quality: string | null;
  };
  dimensions: Record<keyof KpiWeights, KpiDimensionResult>;
  overallScore: string;
}
