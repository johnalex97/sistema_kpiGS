import type { Prisma } from "../../generated/prisma/client.js";
import type { PerformanceAccessScope, PerformanceAnalyticsQuery, ResolvedPerformancePeriod } from "./performance-analytics.types.js";

export interface PerformanceSnapshotInput {
  query: PerformanceAnalyticsQuery;
  period: ResolvedPerformancePeriod;
  scope: PerformanceAccessScope;
}

export interface PerformanceActivityFact {
  id: string;
  orderId: string | null;
  technicianId: string;
  registeredMinutes: number;
  productiveMinutes: number | null;
  pausedMinutes: number;
}

export interface PerformanceOrderFact {
  id: string;
  status: string;
  technicianIds?: string[];
  scheduledFor: Date | null;
  endedAt: Date | null;
  totalMinutes: number | null;
}

export interface PerformanceRecurrenceFact {
  id: string;
  originalOrderId: string;
  technicianIds: string[];
}

export interface PerformanceAnalyticsSnapshot {
  technicians: Array<{ id: string; code: string; fullName: string }>;
  orders: PerformanceOrderFact[];
  activities: PerformanceActivityFact[];
  recurrences: PerformanceRecurrenceFact[];
  officialResults: Prisma.ResultadoKPIGetPayload<object>[];
  previousResults: Prisma.ResultadoKPIGetPayload<object>[];
  previewThresholds: {
    qualityCriticalThreshold: number;
    recurrenceCriticalThreshold: number;
    productivityAttentionThreshold: number;
    complianceAttentionThreshold: number;
    efficiencyAttentionThreshold: number;
  } | null;
}

export interface PerformanceAnalyticsRepository {
  readSnapshot(input: PerformanceSnapshotInput): Promise<PerformanceAnalyticsSnapshot>;
}
