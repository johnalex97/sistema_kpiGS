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

export interface WeeklySourceTechnician {
  id: string;
  code: string;
  fullName: string;
  targetJobs: number | null;
}

export interface WeeklySourceOrder {
  id: string;
  scheduledFor: Date | null;
  endedAt: Date;
}

export interface WeeklySourceActivity {
  id: string;
  orderId: string | null;
  technicianId: string;
  registeredMinutes: number;
  productiveMinutes: number;
}

export interface WeeklySourceRecurrence {
  id: string;
  originalOrderId: string;
  attributableTechnicianIds: string[];
}

export interface WeeklySourceRows {
  technicians: WeeklySourceTechnician[];
  weights: KpiWeights;
  orders: WeeklySourceOrder[];
  activities: WeeklySourceActivity[];
  recurrences: WeeklySourceRecurrence[];
}

export interface WeeklyKpiFacts extends WeeklyKpiCalculationInput {
  technicianId: string;
  code: string;
  fullName: string;
}

export interface KpiActorContext {
  userId: string;
  technicianId: string | null;
  permissions: string[];
  requestId: string;
}
