export type PerformanceGranularity = "WEEK" | "MONTH" | "YEAR";

export type PerformanceOrderStatus =
  | "PENDING"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export interface PerformanceAnalyticsQuery {
  granularity: PerformanceGranularity;
  periodStart: string;
  technicianId?: string | undefined;
  clientId?: string | undefined;
  branchId?: string | undefined;
  serviceTypeId?: string | undefined;
  orderStatus?: PerformanceOrderStatus | undefined;
}

export interface ResolvedPerformancePeriod {
  granularity: PerformanceGranularity;
  periodStart: string;
  periodEnd: string;
  startInclusive: Date;
  endExclusive: Date;
}

export interface PerformanceActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
}

export type PerformanceAccessScope =
  | { kind: "GLOBAL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export function hasPerformanceOperationalFilters(query: PerformanceAnalyticsQuery): boolean {
  return Boolean(query.clientId || query.branchId || query.serviceTypeId || query.orderStatus);
}
