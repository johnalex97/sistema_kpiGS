export type KpiGranularity = "WEEK" | "MONTH" | "YEAR";
export interface KpiPeriod { periodStart: string; granularity: KpiGranularity; technicianId?: string; serviceTypeId?: string; workStatus?: string; }
export interface KpiWeights { productivity: string; compliance: string; efficiency: string; quality: string; }
export interface KpiDashboardItem {
  technicianId: string; code: string; fullName: string; periodStart?: string; periodEnd?: string;
  completedCredits: string; appliedTarget?: number; registeredMinutes?: number; productiveMinutes?: number;
  productivityScore: string; complianceScore: string | null; efficiencyScore: string; qualityScore: string | null;
  overallScore: string; weights?: KpiWeights; coverage?: string;
}
export interface KpiCapabilities { manageTargets?: boolean; manageConfiguration?: boolean; closeWeek?: boolean; recalculate?: boolean; }
export interface KpiDashboardData { status: "PREVIEW" | "OFFICIAL" | "REVISED"; granularity?: KpiGranularity; items: KpiDashboardItem[]; warnings: Array<{ code: string }>; capabilities: KpiCapabilities; }
