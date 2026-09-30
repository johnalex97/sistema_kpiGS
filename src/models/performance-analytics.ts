export type PerformanceGranularity = "WEEK" | "MONTH" | "YEAR";
export interface PerformanceAnalyticsQuery { granularity: PerformanceGranularity; periodStart: string; clientId?: string; branchId?: string; serviceTypeId?: string; orderStatus?: string; }
export interface PerformanceAnalyticsSummary { status: "OFFICIAL" | "PREVIEW"; period: { granularity: string; periodStart: string; periodEnd: string }; generatedAt: string; teamAverage: number | null; rows: unknown[]; }
