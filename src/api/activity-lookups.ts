import { requestJson } from "./http";
import type {
  ActivityPagination,
  BranchOption,
  ClientOption,
  LookupPage,
  OrderOption,
  TechnicianOption,
} from "../models/activity";

export interface ActivityLookupApi {
  orders(search: string, page: number, signal?: AbortSignal): Promise<LookupPage<OrderOption>>;
  clients(search: string, page: number, signal?: AbortSignal): Promise<LookupPage<ClientOption>>;
  branches(clientId: string, search: string, page: number, signal?: AbortSignal): Promise<LookupPage<BranchOption>>;
  technicians(search: string, page: number, signal?: AbortSignal): Promise<LookupPage<TechnicianOption>>;
}

interface RawLookupPage<T> {
  items: T[];
  pagination: ActivityPagination;
}

interface RawOrder {
  id: string;
  orderNumber: string;
  client: { tradeName: string };
  branch: { name: string };
  status: string;
}

interface RawClient {
  id: string;
  code: string;
  tradeName: string;
}

interface RawBranch {
  id: string;
  code: string;
  name: string;
  address: string;
  isEffectivelyActive: boolean;
}

interface RawTechnician {
  id: string;
  code: string;
  fullName: string;
  status: TechnicianOption["status"];
}

const orderStatuses = [
  "PENDING",
  "ASSIGNED",
  "ON_ROUTE",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
] as const;

function lookupQuery(search: string, page: number, includeInactive = true): URLSearchParams {
  const query = new URLSearchParams();
  const normalizedSearch = search.trim();
  if (normalizedSearch) query.set("search", normalizedSearch);
  if (!includeInactive) query.set("includeInactive", "false");
  query.set("page", String(page));
  query.set("pageSize", "20");
  return query;
}

function mapPage<TSource, TTarget>(
  page: RawLookupPage<TSource>,
  map: (item: TSource) => TTarget,
): LookupPage<TTarget> {
  return { items: page.items.map(map), pagination: page.pagination };
}

export function createActivityLookupApi(): ActivityLookupApi {
  return {
    async orders(search, page, signal) {
      const query = lookupQuery(search, page);
      orderStatuses.forEach((status) => query.append("status", status));
      const result = await requestJson<RawLookupPage<RawOrder>>(`/orders?${query}`, { signal });
      return mapPage(result, (order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        clientName: order.client.tradeName,
        branchName: order.branch.name,
        status: order.status,
      }));
    },
    async clients(search, page, signal) {
      const query = lookupQuery(search, page, false);
      const result = await requestJson<RawLookupPage<RawClient>>(`/clients?${query}`, { signal });
      return mapPage(result, ({ id, code, tradeName }) => ({ id, code, tradeName }));
    },
    async branches(clientId, search, page, signal) {
      const query = lookupQuery(search, page, false);
      const result = await requestJson<RawLookupPage<RawBranch>>(
        `/clients/${encodeURIComponent(clientId)}/branches?${query}`,
        { signal },
      );
      return mapPage(result, ({ id, code, name, address, isEffectivelyActive }) => ({
        id,
        code,
        name,
        address,
        isEffectivelyActive,
      }));
    },
    async technicians(search, page, signal) {
      const query = lookupQuery(search, page, false);
      const result = await requestJson<RawLookupPage<RawTechnician>>(`/technicians?${query}`, { signal });
      return mapPage(result, ({ id, code, fullName, status }) => ({ id, code, fullName, status }));
    },
  };
}
