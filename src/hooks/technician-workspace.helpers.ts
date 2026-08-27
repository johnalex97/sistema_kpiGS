import type { KpiDashboardItem } from "../models/kpi";
import type { Technician, TechnicianListFilters, TechnicianStatus } from "../models/technician";

export interface TechnicianQueryState {
  filters: TechnicianListFilters;
}

const PAGE_SIZE = 20;
const ownedSearchParams = [
  "technicianSearch",
  "technicianStatus",
  "technicianIncludeInactive",
  "technicianPage",
] as const;
const technicianStatuses: TechnicianStatus[] = ["AVAILABLE", "BUSY", "ON_ROUTE", "INACTIVE"];

function positiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function text(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function technicianStatus(value: string | null): TechnicianStatus | undefined {
  return technicianStatuses.includes(value as TechnicianStatus) ? value as TechnicianStatus : undefined;
}

export function parseTechnicianSearch(search: string): TechnicianQueryState {
  const query = new URLSearchParams(search);
  const status = technicianStatus(query.get("technicianStatus"));
  const parsedIncludeInactive = query.get("technicianIncludeInactive");
  const includeInactive = parsedIncludeInactive === "true" || parsedIncludeInactive === "false"
    ? parsedIncludeInactive === "true"
    : false;
  const filters: TechnicianListFilters = {
    ...(text(query.get("technicianSearch")) ? { search: text(query.get("technicianSearch")) } : {}),
    ...(status ? { status } : {}),
    includeInactive,
    page: positiveInteger(query.get("technicianPage")) ?? 1,
    pageSize: PAGE_SIZE,
  };
  return { filters };
}

export function serializeTechnicianSearch(search: string, state: TechnicianQueryState): URLSearchParams {
  const query = new URLSearchParams(search);
  ownedSearchParams.forEach((key) => query.delete(key));

  const normalizedSearch = state.filters.search?.trim();
  if (normalizedSearch) query.set("technicianSearch", normalizedSearch);
  if (state.filters.status && technicianStatuses.includes(state.filters.status)) {
    query.set("technicianStatus", state.filters.status);
  }
  query.set("technicianIncludeInactive", String(state.filters.includeInactive));
  query.set("technicianPage", String(Number.isSafeInteger(state.filters.page) && state.filters.page > 0 ? state.filters.page : 1));
  return query;
}

export function currentWeekStart(date: Date): string {
  const monday = new Date(date.getTime());
  const day = monday.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  monday.setDate(monday.getDate() - daysSinceMonday);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

export function indexTechnicianKpis(items: KpiDashboardItem[]): Map<string, KpiDashboardItem> {
  return new Map(items.map((item) => [item.technicianId, item]));
}

export function reconcileTechnician(current: Technician, incoming: Technician): Technician {
  return incoming.version > current.version ? incoming : current;
}
