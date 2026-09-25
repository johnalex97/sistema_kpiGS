import { requestJson } from "./http";
import type {
  BranchListFilters,
  BranchPage,
  ClientBranch,
  ClientContact,
  ClientDetail,
  ClientListFilters,
  ClientPage,
  ContactListFilters,
  ContactPage,
  CreateBranchInput,
  CreateClientInput,
  CreateContactInput,
  LifecycleInput,
  UpdateBranchInput,
  UpdateClientInput,
  UpdateContactInput,
} from "../models/client";

export interface ClientsApi {
  listClients(filters: ClientListFilters, signal?: AbortSignal): Promise<ClientPage>;
  getClient(id: string, includeInactive: boolean, signal?: AbortSignal): Promise<ClientDetail>;
  createClient(input: CreateClientInput): Promise<ClientDetail>;
  updateClient(id: string, input: UpdateClientInput): Promise<ClientDetail>;
  deactivateClient(id: string, input: LifecycleInput): Promise<ClientDetail>;
  reactivateClient(id: string, input: LifecycleInput): Promise<ClientDetail>;
  listBranches(clientId: string, filters: BranchListFilters, signal?: AbortSignal): Promise<BranchPage>;
  createBranch(clientId: string, input: CreateBranchInput): Promise<ClientBranch>;
  updateBranch(clientId: string, branchId: string, input: UpdateBranchInput): Promise<ClientBranch>;
  deactivateBranch(clientId: string, branchId: string, input: LifecycleInput): Promise<ClientBranch>;
  reactivateBranch(clientId: string, branchId: string, input: LifecycleInput): Promise<ClientBranch>;
  listContacts(clientId: string, filters: ContactListFilters, signal?: AbortSignal): Promise<ContactPage>;
  createContact(clientId: string, input: CreateContactInput): Promise<ClientContact>;
  updateContact(clientId: string, contactId: string, input: UpdateContactInput): Promise<ClientContact>;
  deactivateContact(clientId: string, contactId: string, input: LifecycleInput): Promise<ClientContact>;
  reactivateContact(clientId: string, contactId: string, input: LifecycleInput): Promise<ClientContact>;
}

function clientPath(clientId: string): string {
  return `/clients/${encodeURIComponent(clientId)}`;
}

function branchPath(clientId: string, branchId: string): string {
  return `${clientPath(clientId)}/branches/${encodeURIComponent(branchId)}`;
}

function contactPath(clientId: string, contactId: string): string {
  return `${clientPath(clientId)}/contacts/${encodeURIComponent(contactId)}`;
}

function listQuery(filters: ClientListFilters): URLSearchParams {
  const query = new URLSearchParams();
  const search = filters.search?.trim();
  if (search) query.set("search", search);
  if (filters.isActive !== undefined) query.set("isActive", String(filters.isActive));
  query.set("includeInactive", String(filters.isActive === false || filters.includeInactive));
  query.set("page", String(filters.page));
  query.set("pageSize", String(filters.pageSize));
  return query;
}

function setTrimmed(query: URLSearchParams, key: string, value?: string): void {
  const trimmed = value?.trim();
  if (trimmed) query.set(key, trimmed);
}

function mutation<T>(path: string, method: "POST" | "PATCH" | "DELETE", input: unknown): Promise<T> {
  return requestJson<T>(path, { method, body: JSON.stringify(input) });
}

export function createClientsApi(): ClientsApi {
  return {
    listClients: (filters, signal) => requestJson<ClientPage>(`/clients?${listQuery(filters)}`, { method: "GET", signal }),
    getClient: (id, includeInactive, signal) => requestJson<ClientDetail>(
      `${clientPath(id)}?includeInactive=${includeInactive}`, { method: "GET", signal },
    ),
    createClient: (input) => mutation<ClientDetail>("/clients", "POST", input),
    updateClient: (id, input) => mutation<ClientDetail>(clientPath(id), "PATCH", input),
    deactivateClient: (id, input) => mutation<ClientDetail>(clientPath(id), "DELETE", input),
    reactivateClient: (id, input) => mutation<ClientDetail>(`${clientPath(id)}/reactivate`, "POST", input),
    listBranches: (clientId, filters, signal) => {
      const query = listQuery(filters);
      setTrimmed(query, "city", filters.city);
      setTrimmed(query, "region", filters.region);
      return requestJson<BranchPage>(`${clientPath(clientId)}/branches?${query}`, { method: "GET", signal });
    },
    createBranch: (clientId, input) => mutation<ClientBranch>(`${clientPath(clientId)}/branches`, "POST", input),
    updateBranch: (clientId, branchId, input) => mutation<ClientBranch>(branchPath(clientId, branchId), "PATCH", input),
    deactivateBranch: (clientId, branchId, input) => mutation<ClientBranch>(branchPath(clientId, branchId), "DELETE", input),
    reactivateBranch: (clientId, branchId, input) => mutation<ClientBranch>(`${branchPath(clientId, branchId)}/reactivate`, "POST", input),
    listContacts: (clientId, filters, signal) => {
      const query = listQuery(filters);
      setTrimmed(query, "branchId", filters.branchId);
      if (filters.scope !== undefined) query.set("scope", filters.scope);
      return requestJson<ContactPage>(`${clientPath(clientId)}/contacts?${query}`, { method: "GET", signal });
    },
    createContact: (clientId, input) => mutation<ClientContact>(`${clientPath(clientId)}/contacts`, "POST", input),
    updateContact: (clientId, contactId, input) => mutation<ClientContact>(contactPath(clientId, contactId), "PATCH", input),
    deactivateContact: (clientId, contactId, input) => mutation<ClientContact>(contactPath(clientId, contactId), "DELETE", input),
    reactivateContact: (clientId, contactId, input) => mutation<ClientContact>(`${contactPath(clientId, contactId)}/reactivate`, "POST", input),
  };
}
