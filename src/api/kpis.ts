import type { KpiDashboardData, KpiPeriod } from "../models/kpi";
import { ApiClientError, requestJson } from "./http";

export interface KpiApi {
  getDashboard(period: KpiPeriod, signal?: AbortSignal): Promise<KpiDashboardData>;
  getTechnicianDetails(technicianId: string, periodStart: string, signal?: AbortSignal): Promise<unknown>;
}

export function createKpiApi(): KpiApi {
  return {
    getDashboard(period, signal) {
      const query = new URLSearchParams();
      Object.entries(period).forEach(([key, value]) => { if (value !== undefined) query.set(key, value); });
      return requestJson(`/kpis/weekly?${query}`, { signal });
    },
    getTechnicianDetails(technicianId, periodStart, signal) {
      return requestJson(`/kpis/technicians/${encodeURIComponent(technicianId)}/details?periodStart=${encodeURIComponent(periodStart)}`, { signal });
    },
  };
}
export { ApiClientError };
