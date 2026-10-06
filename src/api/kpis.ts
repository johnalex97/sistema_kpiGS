import type { KpiDashboardData, KpiDashboardItem, KpiPeriod, KpiWeights } from "../models/kpi";
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

interface PreviewItem {
  technicianId: string; code: string; fullName: string; overallScore: string;
  scores: { productivity: string; compliance: string | null; efficiency: string; quality: string | null };
  facts: { completedCredits: string; targetJobs: number; registeredMinutes: number; productiveMinutes: number; weights: KpiWeights };
}
type WireDashboard = Omit<KpiDashboardData, "items"> & {
  periodStart?: string; periodEnd?: string; items: Array<KpiDashboardItem | PreviewItem>;
};

export function createKpiApi(): KpiApi {
  return {
    async getDashboard(period, signal) {
      const query = new URLSearchParams();
      Object.entries(period).forEach(([key, value]) => { if (value !== undefined) query.set(key, value); });
      const data = await requestJson<WireDashboard>(`/kpis/weekly?${query}`, { signal });
      if (!data || !Array.isArray(data.items) || !Array.isArray(data.warnings) || !data.capabilities) {
        throw new Error("La respuesta KPI está incompleta; vuelve a consultar el periodo.");
      }
      return { ...data, items: data.items.map(item => "facts" in item ? {
        technicianId: item.technicianId, code: item.code, fullName: item.fullName,
        periodStart: data.periodStart, periodEnd: data.periodEnd,
        completedCredits: item.facts.completedCredits, appliedTarget: item.facts.targetJobs,
        registeredMinutes: item.facts.registeredMinutes, productiveMinutes: item.facts.productiveMinutes,
        productivityScore: item.scores.productivity, complianceScore: item.scores.compliance,
        efficiencyScore: item.scores.efficiency, qualityScore: item.scores.quality,
        overallScore: item.overallScore, weights: item.facts.weights,
      } : item) };
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
