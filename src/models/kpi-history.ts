export type HistoryGranularity = "WEEK" | "MONTH" | "YEAR";
export type HistoryMetric = "overall" | "productivity" | "compliance" | "efficiency" | "quality";
export type HistoryScores = Record<HistoryMetric, string | null>;
export interface HistoryTechnician { id: string; code: string; fullName: string; inactive: boolean; }
export interface HistoryPoint {
  periodStart: string; periodEnd: string; status: "NO_DATA" | "OFFICIAL" | "REVISED";
  officialWeeks: number; expectedWeeks: number; partial: boolean; scores: HistoryScores;
}
export interface HistoryQuery { granularity: HistoryGranularity; endDate?: string; }
export interface HistorySeries {
  technician: HistoryTechnician; granularity: HistoryGranularity; referenceDate: string;
  timeZone: string; generatedAt: string; points: HistoryPoint[];
}
export interface HistorySearch { search?: string; page: number; pageSize: number; }
export interface HistoryTechnicianPage {
  items: HistoryTechnician[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; };
}
