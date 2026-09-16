import type {
  OrderBranchOption,
  OrderCatalog,
  OrderClientPage,
  OrderPagination,
  OrderTechnicianPage,
  OrderTechnicianStatus,
} from "../models/order";
import { requestJson } from "./http";

export interface OrderLookupApi {
  catalog(signal?: AbortSignal): Promise<OrderCatalog>;
  clients(
    search: string,
    page: number,
    signal?: AbortSignal,
  ): Promise<OrderClientPage>;
  branches(clientId: string, signal?: AbortSignal): Promise<OrderBranchOption[]>;
  technicians(
    search: string,
    page: number,
    signal?: AbortSignal,
  ): Promise<OrderTechnicianPage>;
}

interface RawPage<T> {
  items: T[];
  pagination: OrderPagination;
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
  status: OrderTechnicianStatus;
}

function activeLookupQuery(search: string, page: number): URLSearchParams {
  const query = new URLSearchParams();
  const normalizedSearch = search.trim();
  if (normalizedSearch) query.set("search", normalizedSearch);
  query.set("page", String(page));
  query.set("pageSize", "20");
  query.set("includeInactive", "false");
  return query;
}

export function createOrderLookupApi(): OrderLookupApi {
  return {
    catalog: (signal) =>
      requestJson<OrderCatalog>("/orders/catalog", { signal }),
    async clients(search, page, signal) {
      const result = await requestJson<RawPage<RawClient>>(
        `/clients?${activeLookupQuery(search, page)}`,
        { signal },
      );
      return {
        items: result.items.map(({ id, code, tradeName }) => ({
          id,
          code,
          tradeName,
        })),
        pagination: result.pagination,
      };
    },
    async branches(clientId, signal) {
      const query = new URLSearchParams({
        includeInactive: "false",
        page: "1",
        pageSize: "100",
      });
      const result = await requestJson<RawPage<RawBranch>>(
        `/clients/${encodeURIComponent(clientId)}/branches?${query}`,
        { signal },
      );
      return result.items.map(
        ({ id, code, name, address, isEffectivelyActive }) => ({
          id,
          code,
          name,
          address,
          isEffectivelyActive,
        }),
      );
    },
    async technicians(search, page, signal) {
      const result = await requestJson<RawPage<RawTechnician>>(
        `/technicians?${activeLookupQuery(search, page)}`,
        { signal },
      );
      return {
        items: result.items.map(({ id, code, fullName, status }) => ({
          id,
          code,
          fullName,
          status,
        })),
        pagination: result.pagination,
      };
    },
  };
}
