import { requestBlob, requestJson } from "./http";
import type { PerformanceAnalyticsQuery, PerformanceAnalyticsSummary } from "../models/performance-analytics";

export interface PerformanceAnalyticsApi {
  getSummary(query: PerformanceAnalyticsQuery, signal?: AbortSignal): Promise<PerformanceAnalyticsSummary>;
  exportCsv(query: PerformanceAnalyticsQuery, signal?: AbortSignal): Promise<{ blob: Blob; filename: string | null }>;
}

function queryString(query: PerformanceAnalyticsQuery): string {
  const params = new URLSearchParams();
  params.set("granularity", query.granularity.toLowerCase());
  params.set("periodStart", query.periodStart);
  for (const [key, value] of Object.entries(query)) if (key !== "granularity" && key !== "periodStart" && value !== undefined) params.set(key, value);
  return params.toString();
}

export function createPerformanceAnalyticsApi(): PerformanceAnalyticsApi {
  return {
    getSummary: (query, signal) => requestJson(`/performance-analytics/summary?${queryString(query)}`, { signal }),
    exportCsv: (query, signal) => requestBlob(`/performance-analytics/export.csv?${queryString(query)}`, signal),
  };
}
