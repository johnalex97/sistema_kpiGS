import type {
  BranchListFilters,
  ClientBranch,
  ClientContact,
  ClientDetail,
  ClientListFilters,
  ClientSummary,
  ClientTab,
  ContactListFilters,
  ContactScope,
} from "../models/client";

export interface ClientQueryState {
  clients: ClientListFilters;
  clientId: string | null;
  tab: ClientTab;
  branches: BranchListFilters;
  contacts: ContactListFilters;
}

export interface ClientCapabilities {
  canView: boolean;
  canManage: boolean;
}

const ownedParameters = [
  "search", "isActive", "includeInactive", "page", "pageSize", "clientId", "clientTab",
  "branchSearch", "branchCity", "branchRegion", "branchIsActive", "branchIncludeInactive", "branchPage", "branchPageSize",
  "contactSearch", "contactBranchId", "contactScope", "contactIsActive", "contactIncludeInactive", "contactPage", "contactPageSize",
] as const;

function text(value: string | null | undefined, maximum = Number.MAX_SAFE_INTEGER): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function boolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function positiveInteger(value: string | null | undefined, maximum = Number.MAX_SAFE_INTEGER): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

function readFilters(query: URLSearchParams, prefix: "" | "branch" | "contact"): ClientListFilters {
  const key = (suffix: string) => prefix ? `${prefix}${suffix}` : suffix[0].toLowerCase() + suffix.slice(1);
  const isActive = boolean(query.get(key("IsActive")));
  const search = text(query.get(key("Search")), 100);
  return {
    ...(search ? { search } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    includeInactive: isActive === false || boolean(query.get(key("IncludeInactive"))) === true,
    page: positiveInteger(query.get(key("Page"))) ?? 1,
    pageSize: positiveInteger(query.get(key("PageSize")), 100) ?? 20,
  };
}

export function parseClientSearch(search: string): ClientQueryState {
  const query = new URLSearchParams(search);
  const clientId = text(query.get("clientId")) ?? null;
  const tab = query.get("clientTab");
  const branches = readFilters(query, "branch");
  const contacts = readFilters(query, "contact") as ContactListFilters;
  const city = text(query.get("branchCity"), 100);
  const region = text(query.get("branchRegion"), 100);
  const branchId = text(query.get("contactBranchId"));
  const scope = query.get("contactScope");
  if (city) Object.assign(branches, { city });
  if (region) Object.assign(branches, { region });
  if (scope === "CLIENT" || scope === "BRANCH") contacts.scope = scope;
  if (branchId && contacts.scope !== "CLIENT") contacts.branchId = branchId;
  return {
    clients: readFilters(query, ""),
    clientId,
    tab: tab === "branches" || tab === "contacts" ? tab : "summary",
    branches,
    contacts,
  };
}

function writeFilters(query: URLSearchParams, filters: ClientListFilters, prefix: "" | "branch" | "contact"): void {
  const key = (suffix: string) => prefix ? `${prefix}${suffix}` : suffix[0].toLowerCase() + suffix.slice(1);
  const search = text(filters.search, 100);
  if (search) query.set(key("Search"), search);
  if (filters.isActive !== undefined) query.set(key("IsActive"), String(filters.isActive));
  query.set(key("IncludeInactive"), String(filters.isActive === false || filters.includeInactive));
  query.set(key("Page"), String(positiveInteger(String(filters.page)) ?? 1));
  query.set(key("PageSize"), String(positiveInteger(String(filters.pageSize), 100) ?? 20));
}

export function serializeClientSearch(search: string, state: ClientQueryState): URLSearchParams {
  const query = new URLSearchParams(search);
  const previousClientId = text(query.get("clientId")) ?? null;
  ownedParameters.forEach((key) => query.delete(key));
  writeFilters(query, state.clients, "");
  const clientId = text(state.clientId);
  if (clientId) query.set("clientId", clientId);
  query.set("clientTab", state.tab === "branches" || state.tab === "contacts" ? state.tab : "summary");
  if (previousClientId !== (clientId ?? null)) return query;

  writeFilters(query, state.branches, "branch");
  const city = text(state.branches.city, 100);
  const region = text(state.branches.region, 100);
  if (city) query.set("branchCity", city);
  if (region) query.set("branchRegion", region);

  writeFilters(query, state.contacts, "contact");
  const branchId = text(state.contacts.branchId);
  if (branchId && state.contacts.scope !== "CLIENT") query.set("contactBranchId", branchId);
  const scope: ContactScope | undefined = state.contacts.scope;
  if (scope === "CLIENT" || scope === "BRANCH") query.set("contactScope", scope);
  return query;
}

export function deriveClientCapabilities(permissions: string[]): ClientCapabilities {
  return {
    canView: permissions.includes("CLIENTS_VIEW"),
    canManage: permissions.includes("CLIENTS_MANAGE"),
  };
}

export function reconcileClient<T extends ClientSummary | ClientDetail>(current: T, incoming: T): T {
  return incoming.version > current.version ? incoming : current;
}

export function reconcileBranch(current: ClientBranch, incoming: ClientBranch): ClientBranch {
  return incoming.version > current.version ? incoming : current;
}

export function reconcileContact(current: ClientContact, incoming: ClientContact): ClientContact {
  return incoming.version > current.version ? incoming : current;
}
