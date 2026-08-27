import { requestJson } from "./http";
import type {
  ChangeTechnicianStatusInput,
  CreateTechnicianInput,
  DeactivateTechnicianInput,
  EligibleUserPage,
  ReactivateTechnicianInput,
  Technician,
  TechnicianListFilters,
  TechnicianPage,
  UpdateTechnicianInput,
} from "../models/technician";

export interface TechnicianApi {
  list(filters: TechnicianListFilters, signal?: AbortSignal): Promise<TechnicianPage>;
  detail(id: string, signal?: AbortSignal): Promise<Technician>;
  eligibleUsers(search: string, page: number, technicianId?: string, signal?: AbortSignal): Promise<EligibleUserPage>;
  create(input: CreateTechnicianInput): Promise<Technician>;
  update(id: string, input: UpdateTechnicianInput): Promise<Technician>;
  changeStatus(id: string, input: ChangeTechnicianStatusInput): Promise<Technician>;
  deactivate(id: string, input: DeactivateTechnicianInput): Promise<Technician>;
  reactivate(id: string, input: ReactivateTechnicianInput): Promise<Technician>;
}

function technicianPath(id: string, operation?: string): string {
  const base = `/technicians/${encodeURIComponent(id)}`;
  return operation ? `${base}/${operation}` : base;
}

function listQuery(filters: TechnicianListFilters): string {
  const query = new URLSearchParams();
  const search = filters.search?.trim();
  if (search) query.set("search", search);
  if (filters.status !== undefined) query.set("status", filters.status);
  query.set("includeInactive", String(filters.includeInactive));
  query.set("page", String(filters.page));
  query.set("pageSize", String(filters.pageSize));
  return query.toString();
}

function eligibleUsersQuery(search: string, page: number, technicianId?: string): string {
  const query = new URLSearchParams();
  const normalizedSearch = search.trim();
  if (normalizedSearch) query.set("search", normalizedSearch);
  query.set("page", String(page));
  query.set("pageSize", "20");
  if (technicianId !== undefined) query.set("technicianId", technicianId);
  return query.toString();
}

function mutation<T>(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<T> {
  return requestJson<T>(path, { method, body: JSON.stringify(body) });
}

export function createTechnicianApi(): TechnicianApi {
  return {
    list: (filters, signal) => requestJson<TechnicianPage>(`/technicians?${listQuery(filters)}`, { signal }),
    detail: (id, signal) => requestJson<Technician>(technicianPath(id), { signal }),
    eligibleUsers: (search, page, technicianId, signal) => requestJson<EligibleUserPage>(
      `/technicians/eligible-users?${eligibleUsersQuery(search, page, technicianId)}`,
      { signal },
    ),
    create: (input) => mutation<Technician>("/technicians", "POST", input),
    update: (id, input) => mutation<Technician>(technicianPath(id), "PATCH", input),
    changeStatus: (id, input) => mutation<Technician>(technicianPath(id, "status"), "PATCH", input),
    deactivate: (id, input) => mutation<Technician>(technicianPath(id), "DELETE", input),
    reactivate: (id, input) => mutation<Technician>(technicianPath(id, "reactivate"), "POST", input),
  };
}
