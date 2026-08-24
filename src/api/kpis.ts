import type { KpiDashboardData, KpiPeriod } from "../models/kpi";
import { ApiClientError, requestJson } from "./http";

export interface KpiApi {
  getDashboard(period: KpiPeriod, signal?: AbortSignal): Promise<KpiDashboardData>;
  getTechnicianDetails(technicianId: string, periodStart: string, signal?: AbortSignal): Promise<unknown>;
  validateWeek(periodStart: string): Promise<unknown>;
  closeWeek(periodStart: string): Promise<unknown>;
  recalculateWeek(periodStart: string, reason: string): Promise<unknown>;
  createTarget(input: Record<string, unknown>): Promise<unknown>;
  createConfiguration(input: Record<string, unknown>): Promise<unknown>;
  getVersions(periodStart: string): Promise<unknown[]>;
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
    validateWeek: (periodStart) => requestJson(`/kpis/weeks/${periodStart}/validation`),
    closeWeek: (periodStart) => requestJson(`/kpis/weeks/${periodStart}/close`, { method: "POST", body: "{}" }),
    recalculateWeek: (periodStart, reason) => requestJson(`/kpis/weeks/${periodStart}/recalculate`, { method: "POST", body: JSON.stringify({ reason }) }),
    createTarget: (input) => requestJson("/kpis/targets", { method: "POST", body: JSON.stringify(input) }),
    createConfiguration: (input) => requestJson("/kpis/configurations", { method: "POST", body: JSON.stringify(input) }),
    getVersions: (periodStart) => requestJson(`/kpis/weeks/${periodStart}/versions`),
  };
}
export { ApiClientError };
