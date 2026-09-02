import { requestJson } from "./http";
import { createTechnicianApi } from "./technicians";
import type { TechnicianPage } from "../models/technician";
import type {
  BranchLookupPage,
  ClientLookupPage,
  LookupPagination,
  OrderLookupPage,
  OrderStatus,
} from "../models/order-lookup";

export interface RecurrenceLookupApi {
  orders(search: string, statuses: OrderStatus[], page: number, signal?: AbortSignal): Promise<OrderLookupPage>;
  technicians(search: string, page: number, signal?: AbortSignal): Promise<TechnicianPage>;
  clients(search: string, page: number, signal?: AbortSignal): Promise<ClientLookupPage>;
  branches(clientId: string, search: string, page: number, signal?: AbortSignal): Promise<BranchLookupPage>;
}

export type RecurrenceLookupOperation = keyof RecurrenceLookupApi;
export type RecurrenceLookupPermission =
  | "ORDERS_VIEW_ALL"
  | "ORDERS_VIEW_OWN"
  | "TECHNICIANS_VIEW"
  | "CLIENTS_VIEW";

/**
 * Frontend prerequisites for the existing auxiliary endpoints. Having at
 * least one listed permission lets consumers avoid unsupported lookups, but a
 * backend 403 remains authoritative after revocation or for a custom role.
 */
export const recurrenceLookupPermissionPrerequisites = {
  orders: ["ORDERS_VIEW_ALL", "ORDERS_VIEW_OWN"],
  technicians: ["TECHNICIANS_VIEW"],
  clients: ["CLIENTS_VIEW"],
  branches: ["CLIENTS_VIEW"],
} as const satisfies Record<
  RecurrenceLookupOperation,
  readonly RecurrenceLookupPermission[]
>;

interface RawPage<T> {
  items: T[];
  pagination: LookupPagination;
}

interface RawOrder {
  id: string;
  orderNumber: string;
  client: { tradeName: string };
  branch: { name: string };
  status: OrderStatus;
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
}

function lookupQuery(search: string, page: number): URLSearchParams {
  const query = new URLSearchParams();
  const normalizedSearch = search.trim();
  if (normalizedSearch) query.set("search", normalizedSearch);
  query.set("page", String(page));
  query.set("pageSize", "20");
  return query;
}

function orderLookupQuery(search: string, statuses: OrderStatus[], page: number): URLSearchParams {
  const query = new URLSearchParams();
  const normalizedSearch = search.trim();
  if (normalizedSearch) query.set("search", normalizedSearch);
  statuses.forEach((status) => query.append("status", status));
  query.set("page", String(page));
  query.set("pageSize", "20");
  return query;
}

function activeLookupQuery(search: string, page: number): URLSearchParams {
  const query = lookupQuery(search, page);
  query.set("includeInactive", "false");
  return query;
}

export function createRecurrenceLookupApi(): RecurrenceLookupApi {
  const technicians = createTechnicianApi();
  return {
    async orders(search, statuses, page, signal) {
      const query = orderLookupQuery(search, statuses, page);
      const result = await requestJson<RawPage<RawOrder>>(`/orders?${query}`, { signal });
      return {
        items: result.items.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          clientName: order.client.tradeName,
          branchName: order.branch.name,
          status: order.status,
        })),
        pagination: result.pagination,
      };
    },
    technicians: (search, page, signal) => technicians.list({
      search: search.trim() || undefined,
      page,
      pageSize: 20,
      includeInactive: false,
    }, signal),
    async clients(search, page, signal) {
      const result = await requestJson<RawPage<RawClient>>(
        `/clients?${activeLookupQuery(search, page)}`,
        { signal },
      );
      return {
        items: result.items.map(({ id, code, tradeName }) => ({ id, code, name: tradeName })),
        pagination: result.pagination,
      };
    },
    async branches(clientId, search, page, signal) {
      const result = await requestJson<RawPage<RawBranch>>(
        `/clients/${encodeURIComponent(clientId)}/branches?${activeLookupQuery(search, page)}`,
        { signal },
      );
      return {
        items: result.items.map(({ id, code, name }) => ({ id, code, name })),
        pagination: result.pagination,
      };
    },
  };
}
