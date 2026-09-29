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
  createClient(input: CreateClientInput, signal?: AbortSignal): Promise<ClientDetail>;
  updateClient(id: string, input: UpdateClientInput, signal?: AbortSignal): Promise<ClientDetail>;
  deactivateClient(id: string, input: LifecycleInput, signal?: AbortSignal): Promise<ClientDetail>;
  reactivateClient(id: string, input: LifecycleInput, signal?: AbortSignal): Promise<ClientDetail>;
  listBranches(clientId: string, filters: BranchListFilters, signal?: AbortSignal): Promise<BranchPage>;
  createBranch(clientId: string, input: CreateBranchInput, signal?: AbortSignal): Promise<ClientBranch>;
  updateBranch(clientId: string, branchId: string, input: UpdateBranchInput, signal?: AbortSignal): Promise<ClientBranch>;
  deactivateBranch(clientId: string, branchId: string, input: LifecycleInput, signal?: AbortSignal): Promise<ClientBranch>;
  reactivateBranch(clientId: string, branchId: string, input: LifecycleInput, signal?: AbortSignal): Promise<ClientBranch>;
  listContacts(clientId: string, filters: ContactListFilters, signal?: AbortSignal): Promise<ContactPage>;
  createContact(clientId: string, input: CreateContactInput, signal?: AbortSignal): Promise<ClientContact>;
  updateContact(clientId: string, contactId: string, input: UpdateContactInput, signal?: AbortSignal): Promise<ClientContact>;
  deactivateContact(clientId: string, contactId: string, input: LifecycleInput, signal?: AbortSignal): Promise<ClientContact>;
  reactivateContact(clientId: string, contactId: string, input: LifecycleInput, signal?: AbortSignal): Promise<ClientContact>;
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

function mutation<T>(path: string, method: "POST" | "PATCH" | "DELETE", input: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, { method, body: JSON.stringify(input), signal });
}

export function createClientsApi(): ClientsApi {
  return {
    listClients: (filters, signal) => requestJson<ClientPage>(`/clients?${listQuery(filters)}`, { method: "GET", signal }),
    getClient: (id, includeInactive, signal) => requestJson<ClientDetail>(
      `${clientPath(id)}?includeInactive=${includeInactive}`, { method: "GET", signal },
    ),
    createClient: (input, signal) => mutation<ClientDetail>("/clients", "POST", input, signal),
    updateClient: (id, input, signal) => mutation<ClientDetail>(clientPath(id), "PATCH", input, signal),
    deactivateClient: (id, input, signal) => mutation<ClientDetail>(clientPath(id), "DELETE", input, signal),
    reactivateClient: (id, input, signal) => mutation<ClientDetail>(`${clientPath(id)}/reactivate`, "POST", input, signal),
    listBranches: (clientId, filters, signal) => {
      const query = listQuery(filters);
      setTrimmed(query, "city", filters.city);
      setTrimmed(query, "region", filters.region);
      return requestJson<BranchPage>(`${clientPath(clientId)}/branches?${query}`, { method: "GET", signal });
    },
    createBranch: (clientId, input, signal) => mutation<ClientBranch>(`${clientPath(clientId)}/branches`, "POST", input, signal),
    updateBranch: (clientId, branchId, input, signal) => mutation<ClientBranch>(branchPath(clientId, branchId), "PATCH", input, signal),
    deactivateBranch: (clientId, branchId, input, signal) => mutation<ClientBranch>(branchPath(clientId, branchId), "DELETE", input, signal),
    reactivateBranch: (clientId, branchId, input, signal) => mutation<ClientBranch>(`${branchPath(clientId, branchId)}/reactivate`, "POST", input, signal),
    listContacts: (clientId, filters, signal) => {
      const query = listQuery(filters);
      setTrimmed(query, "branchId", filters.branchId);
      if (filters.scope !== undefined) query.set("scope", filters.scope);
      return requestJson<ContactPage>(`${clientPath(clientId)}/contacts?${query}`, { method: "GET", signal });
    },
    createContact: (clientId, input, signal) => mutation<ClientContact>(`${clientPath(clientId)}/contacts`, "POST", input, signal),
    updateContact: (clientId, contactId, input, signal) => mutation<ClientContact>(contactPath(clientId, contactId), "PATCH", input, signal),
    deactivateContact: (clientId, contactId, input, signal) => mutation<ClientContact>(contactPath(clientId, contactId), "DELETE", input, signal),
    reactivateContact: (clientId, contactId, input, signal) => mutation<ClientContact>(`${contactPath(clientId, contactId)}/reactivate`, "POST", input, signal),
  };
}
