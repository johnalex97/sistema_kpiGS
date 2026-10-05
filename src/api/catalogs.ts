import { requestJson } from "./http";
import type { CatalogFields, CatalogHistoryEntry, CatalogItem, CatalogKind, CatalogPage } from "../models/catalog";

export const catalogsApi = {
  list(kind: CatalogKind, search: string, page: number, signal: AbortSignal) {
    const query = new URLSearchParams({ search: search.trim(), page: String(page), pageSize: "20" });
    return requestJson<CatalogPage<CatalogItem>>(`/catalogs/${kind}?${query}`, { signal });
  },
  create(kind: CatalogKind, input: CatalogFields & { code: string }) {
    return requestJson<CatalogItem>(`/catalogs/${kind}`, { method: "POST", body: JSON.stringify(input) });
  },
  update(kind: CatalogKind, item: CatalogItem, input: CatalogFields) {
    return requestJson<CatalogItem>(`/catalogs/${kind}/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ ...input, updatedAt: item.updatedAt }) });
  },
  history(kind: CatalogKind, id: string, page: number, signal: AbortSignal) {
    return requestJson<CatalogPage<CatalogHistoryEntry>>(`/catalogs/${kind}/${encodeURIComponent(id)}/history?page=${page}&pageSize=20`, { signal });
  },
};
