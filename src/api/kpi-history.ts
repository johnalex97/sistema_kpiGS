import { requestJson } from "./http";
import type { HistoryQuery, HistorySearch, HistorySeries, HistoryTechnician, HistoryTechnicianPage } from "../models/kpi-history";

export interface KpiHistoryApi {
  getTrend(id: string, query: HistoryQuery, signal?: AbortSignal): Promise<HistorySeries>;
  searchTechnicians(query: HistorySearch, signal?: AbortSignal): Promise<HistoryTechnicianPage>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function technician(value: unknown): value is HistoryTechnician {
  return record(value) && [value.id, value.code, value.fullName].every(v => typeof v === "string" && v.length > 0) && typeof value.inactive === "boolean";
}
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function score(value: unknown): boolean {
  return value === null || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) <= 100);
}
function series(value: unknown, id: string, query: HistoryQuery): value is HistorySeries {
  if (!record(value) || !technician(value.technician) || value.technician.id !== id || value.granularity !== query.granularity || !date(value.referenceDate) || (query.endDate && value.referenceDate !== query.endDate) || typeof value.timeZone !== "string" || !value.timeZone || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) || !Array.isArray(value.points) || value.points.length !== (query.granularity === "YEAR" ? 5 : 12)) return false;
  return value.points.every(p => {
    if (!record(p) || !date(p.periodStart) || !date(p.periodEnd) || p.periodStart > p.periodEnd || !["NO_DATA", "OFFICIAL", "REVISED"].includes(String(p.status)) || !Number.isInteger(p.officialWeeks) || !Number.isInteger(p.expectedWeeks) || Number(p.expectedWeeks) < 1 || Number(p.officialWeeks) < 0 || Number(p.officialWeeks) > Number(p.expectedWeeks) || p.partial !== (Number(p.officialWeeks) < Number(p.expectedWeeks)) || !record(p.scores)) return false;
    const scores = p.scores;
    return ["overall", "productivity", "compliance", "efficiency", "quality"].every(k => score(scores[k]) && (p.status !== "NO_DATA" || scores[k] === null)) && (p.status === "NO_DATA" ? p.officialWeeks === 0 : Number(p.officialWeeks) > 0);
  });
}

export function createKpiHistoryApi(): KpiHistoryApi {
  return {
    async getTrend(id, query, signal) {
      const params = new URLSearchParams({ granularity: query.granularity });
      if (query.endDate) params.set("endDate", query.endDate);
      const data = await requestJson<unknown>(`/kpis/technicians/${encodeURIComponent(id)}/trend?${params}`, { signal });
      if (!series(data, id, query)) throw new Error("La respuesta del historial está incompleta o no corresponde a la consulta");
      return data;
    },
    async searchTechnicians(query, signal) {
      const params = new URLSearchParams();
      if (query.search) params.set("search", query.search);
      params.set("page", String(query.page)); params.set("pageSize", String(query.pageSize));
      const data = await requestJson<unknown>(`/kpis/history/technicians?${params}`, { signal });
      if (!record(data) || !Array.isArray(data.items) || !data.items.every(technician) || !record(data.pagination) || !["page", "pageSize", "totalItems", "totalPages"].every(k => Number.isInteger((data.pagination as Record<string, unknown>)[k]) && Number((data.pagination as Record<string, unknown>)[k]) >= 0) || Number(data.pagination.page) < 1 || Number(data.pagination.pageSize) < 1) throw new Error("La búsqueda de técnicos del historial está incompleta");
      return data as unknown as HistoryTechnicianPage;
    },
  };
}
