import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientsApi } from "../api/clients";
import { ApiClientError, type ApiFieldError } from "../api/http";
import type { BranchInput, BranchListFilters, BranchPage, ClientBranch, ClientContact, ClientDetail, ClientListFilters, ClientPage, ClientTab, ContactListFilters, ContactPage, CreateClientInput, UpdateClientInput } from "../models/client";
import { toContactInput, type ContactFormValues } from "../components/clients/ContactForm";
import {
  deriveClientCapabilities,
  parseClientSearch,
  reconcileClient,
  serializeClientSearch,
  type ClientCapabilities,
  type ClientQueryState,
} from "./client-workspace.helpers";

export interface AsyncState<T> {
  status: "idle" | "loading" | "success" | "error";
  data: T | null;
  error: string | null;
  stale: boolean;
}

export interface ClientsWorkspace {
  query: ClientQueryState;
  capabilities: ClientCapabilities;
  list: AsyncState<ClientPage>;
  detail: AsyncState<ClientDetail>;
  branches: AsyncState<BranchPage>;
  contacts: AsyncState<ContactPage>;
  contactBranches: ClientBranch[];
  create?: { open: boolean; pending: boolean; error: string | null; fieldErrors: ApiFieldError[] };
  edit?: ClientEditState;
  lifecycle?: ClientLifecycleState;
  branchForm?: BranchFormState;
  branchLifecycle?: BranchLifecycleState;
  contactForm?: ContactFormState;
  contactLifecycle?: ContactLifecycleState;
  branchClientActive?: boolean;
  openCreate?(): void;
  closeForm?(): void;
  submitCreate?(input: CreateClientInput): Promise<void>;
  openEdit?(): void;
  changeClientEdit?(patch: Omit<UpdateClientInput, "version">): void;
  submitClientEdit?(values: Omit<UpdateClientInput, "version">): Promise<void>;
  openClientLifecycle?(action: "deactivate" | "reactivate"): void;
  changeClientLifecycleReason?(reason: string): void;
  submitClientLifecycle?(reason: string): Promise<void>;
  reviewClientConflict?(): Promise<void>;
  adoptClientConflict?(): void;
  openBranchCreate?(): void;
  openBranchEdit?(branch: ClientBranch): void;
  changeBranchForm?(patch: Partial<BranchInput>): void;
  submitBranchForm?(values: BranchInput): Promise<void>;
  openBranchLifecycle?(branch: ClientBranch, action: "deactivate" | "reactivate"): void;
  changeBranchLifecycleReason?(reason: string): void;
  submitBranchLifecycle?(reason: string): Promise<void>;
  reviewBranchConflict?(): Promise<void>;
  adoptBranchConflict?(): void;
  closeBranchDialogs?(): void;
  openContactCreate?(): void;
  openContactEdit?(contact: ClientContact): void;
  changeContactForm?(patch: Partial<ContactFormValues>): void;
  submitContactForm?(values: ContactFormValues): Promise<void>;
  openContactLifecycle?(contact: ClientContact, action: "deactivate" | "reactivate"): void;
  changeContactLifecycleReason?(reason: string): void;
  submitContactLifecycle?(reason: string): Promise<void>;
  reviewContactConflict?(): Promise<void>;
  adoptContactConflict?(): void;
  closeContactDialogs?(): void;
  setClientFilters(patch: Partial<ClientListFilters>): void;
  setBranchFilters(patch: Partial<BranchListFilters>): void;
  setContactFilters(patch: Partial<ContactListFilters>): void;
  clearClientFilters(): void;
  selectClient(id: string): void;
  closeDetail(): void;
  setTab(tab: ClientTab): void;
  refreshList(): Promise<void>;
  refreshDetail(): Promise<void>;
  refreshBranches(): Promise<void>;
  refreshContacts(): Promise<void>;
  refresh(): Promise<void>;
}

export interface ClientEditDraft {
  clientId: string;
  baseVersion: number;
  values: Omit<UpdateClientInput, "version">;
  conflict: ClientDetail | null;
}

export interface ClientEditState {
  open: boolean;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  reviewPending: boolean;
  reviewError: string | null;
  versionConflict: boolean;
  draft: ClientEditDraft | null;
}

export interface ClientLifecycleState {
  open: boolean;
  action: "deactivate" | "reactivate";
  clientId: string;
  baseVersion: number;
  reason: string;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  reviewPending: boolean;
  reviewError: string | null;
  versionConflict: boolean;
  conflict: ClientDetail | null;
}

export interface BranchFormDraft {
  clientId: string | null;
  branchId: string | null;
  baseVersion: number | null;
  values: BranchInput;
  conflict: ClientBranch | null;
}

export interface BranchFormState {
  open: boolean;
  mode: "create" | "edit";
  draft: BranchFormDraft | null;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  reviewPending: boolean;
  reviewError: string | null;
  versionConflict: boolean;
}

export interface BranchLifecycleState {
  open: boolean;
  action: "deactivate" | "reactivate";
  clientId: string;
  branchId: string;
  baseVersion: number;
  reason: string;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  reviewPending: boolean;
  reviewError: string | null;
  versionConflict: boolean;
  conflict: ClientBranch | null;
}

export interface ContactFormState {
  open: boolean;
  mode: "create" | "edit";
  draft: { clientId: string; contactId: string | null; baseVersion: number | null; values: ContactFormValues; conflict: ClientContact | null } | null;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  reviewPending: boolean;
  reviewError: string | null;
  versionConflict: boolean;
}

export interface ContactLifecycleState {
  open: boolean;
  action: "deactivate" | "reactivate";
  clientId: string;
  contactId: string;
  baseVersion: number;
  reason: string;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  reviewPending: boolean;
  reviewError: string | null;
  versionConflict: boolean;
  conflict: ClientContact | null;
}

export interface UseClientsWorkspaceOptions {
  api: ClientsApi;
  permissions: string[];
  search: string;
}

const idle = <T,>(): AsyncState<T> => ({ status: "idle", data: null, error: null, stale: false });

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function clientMutationError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return errorMessage(error, fallback);
  const messages: Record<string, string> = {
    VERSION_CONFLICT: "El cliente cambió en el servidor. Revisa la versión vigente antes de volver a guardar.",
    CLIENT_HAS_ACTIVE_WORK: "El cliente tiene trabajo activo. Resuélvelo antes de desactivarlo.",
    TAX_ID_ALREADY_EXISTS: "El RTN ya pertenece a otro cliente. Revisa el dato ingresado.",
    RESOURCE_INACTIVE: "El cliente está inactivo. Revisa su estado antes de continuar.",
    VALIDATION_ERROR: "Revisa los campos señalados antes de continuar.",
  };
  return messages[error.code] ?? (error.status === 403 ? "Ya no tienes permiso para administrar este cliente." : fallback);
}

function clientValues(client: ClientDetail): Omit<UpdateClientInput, "version"> {
  return { tradeName: client.tradeName, legalName: client.legalName, taxId: client.taxId,
    phone: client.phone, email: client.email, notes: client.notes };
}

const emptyEdit = (): ClientEditState => ({ open: false, pending: false, error: null, fieldErrors: [], reviewPending: false, reviewError: null, versionConflict: false, draft: null });
const emptyLifecycle = (): ClientLifecycleState => ({ open: false, action: "deactivate", clientId: "", baseVersion: 0, reason: "", pending: false, error: null, fieldErrors: [], reviewPending: false, reviewError: null, versionConflict: false, conflict: null });
const emptyBranchForm = (): BranchFormState => ({ open: false, mode: "create", draft: null, pending: false, error: null, fieldErrors: [], reviewPending: false, reviewError: null, versionConflict: false });
const emptyBranchLifecycle = (): BranchLifecycleState => ({ open: false, action: "deactivate", clientId: "", branchId: "", baseVersion: 0, reason: "", pending: false, error: null, fieldErrors: [], reviewPending: false, reviewError: null, versionConflict: false, conflict: null });
const emptyContactForm = (): ContactFormState => ({ open: false, mode: "create", draft: null, pending: false, error: null, fieldErrors: [], reviewPending: false, reviewError: null, versionConflict: false });
const emptyContactLifecycle = (): ContactLifecycleState => ({ open: false, action: "deactivate", clientId: "", contactId: "", baseVersion: 0, reason: "", pending: false, error: null, fieldErrors: [], reviewPending: false, reviewError: null, versionConflict: false, conflict: null });

function contactMutationError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return errorMessage(error, fallback);
  const messages: Record<string, string> = {
    VERSION_CONFLICT: "El contacto cambió en el servidor. Revisa la versión vigente antes de continuar.",
    PRIMARY_CONTACT_CONFLICT: "Desmarca o cambia el contacto principal vigente del mismo ámbito antes de reintentar. Tu borrador y motivo se conservan.",
    RESOURCE_INACTIVE: "El cliente o la sucursal está inactivo. Revisa su estado antes de continuar.",
    VALIDATION_ERROR: "Revisa los campos señalados antes de continuar.",
  };
  return messages[error.code] ?? (error.status === 403 ? "Ya no tienes permiso para administrar este contacto." : fallback);
}

function contactValues(contact: ClientContact): ContactFormValues {
  return { scope: contact.scope, branchId: contact.branchId, fullName: contact.fullName, position: contact.position,
    phone: contact.phone, email: contact.email, isPrimary: contact.isPrimary };
}

function branchMutationError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return errorMessage(error, fallback);
  const messages: Record<string, string> = {
    VERSION_CONFLICT: "La sucursal cambió en el servidor. Revisa la versión vigente antes de continuar.",
    BRANCH_HAS_ACTIVE_WORK: "La sucursal tiene trabajo activo y no puede desactivarse.",
    CLIENT_REQUIRES_ACTIVE_BRANCH: "El cliente debe conservar al menos una sucursal activa.",
    RESOURCE_INACTIVE: "El cliente o la sucursal está inactivo. Revisa su estado antes de continuar.",
    VALIDATION_ERROR: "Revisa los campos señalados antes de continuar.",
  };
  return messages[error.code] ?? (error.status === 403 ? "Ya no tienes permiso para administrar esta sucursal." : fallback);
}

function branchValues(branch: ClientBranch): BranchInput {
  return { name: branch.name, address: branch.address, city: branch.city, region: branch.region, country: branch.country, lat: branch.lat, long: branch.long, locationReference: branch.locationReference };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function urlWith(search: URLSearchParams): string {
  const query = search.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

export function useClientsWorkspace({ api, permissions, search }: UseClientsWorkspaceOptions) {
  const capabilities = deriveClientCapabilities(permissions);
  const [query, setQuery] = useState<ClientQueryState>(() => {
    const parsed = parseClientSearch(window.location.search);
    const externalSearch = search.trim();
    return externalSearch ? { ...parsed, clients: { ...parsed.clients, search: externalSearch, page: 1 } } : parsed;
  });
  const [list, setList] = useState<AsyncState<ClientPage>>(() => capabilities.canView
    ? { ...idle<ClientPage>(), status: "loading" }
    : idle<ClientPage>());
  const [detailSnapshot, setDetailSnapshot] = useState<{ key: string | null; state: AsyncState<ClientDetail> }>(() => ({
    key: query.clientId ? `${query.clientId}\u0000${query.clients.includeInactive}` : null,
    state: capabilities.canView && query.clientId
      ? { ...idle<ClientDetail>(), status: "loading" }
      : idle<ClientDetail>(),
  }));
  const detail = detailSnapshot.state;
  const [branchSnapshot, setBranchSnapshot] = useState<{ key: string | null; state: AsyncState<BranchPage> }>(() => ({
    key: null, state: idle<BranchPage>(),
  }));
  const branches = branchSnapshot.state;
  const [contactSnapshot, setContactSnapshot] = useState<{ key: string | null; state: AsyncState<ContactPage> }>(() => ({ key: null, state: idle<ContactPage>() }));
  const contacts = contactSnapshot.state;
  const [create, setCreate] = useState<NonNullable<ClientsWorkspace["create"]>>({ open: false, pending: false, error: null, fieldErrors: [] });
  const [edit, setEdit] = useState<ClientEditState>(emptyEdit);
  const [lifecycle, setLifecycle] = useState<ClientLifecycleState>(emptyLifecycle);
  const [branchForm, setBranchForm] = useState<BranchFormState>(emptyBranchForm);
  const [branchLifecycle, setBranchLifecycle] = useState<BranchLifecycleState>(emptyBranchLifecycle);
  const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm);
  const [contactLifecycle, setContactLifecycle] = useState<ContactLifecycleState>(emptyContactLifecycle);
  const createPendingRef = useRef(false);
  const editPendingRef = useRef(false);
  const lifecyclePendingRef = useRef(false);
  const branchPendingRef = useRef(false);
  const contactPendingRef = useRef(false);
  const contactReviewControllerRef = useRef<AbortController | null>(null);
  const contactFormRef = useRef(contactForm);
  const contactLifecycleRef = useRef(contactLifecycle);
  const branchFormRef = useRef(branchForm);
  const branchLifecycleRef = useRef(branchLifecycle);
  const editRef = useRef(edit);
  const lifecycleRef = useRef(lifecycle);
  const detailRef = useRef(detail);
  editRef.current = edit;
  lifecycleRef.current = lifecycle;
  branchFormRef.current = branchForm;
  branchLifecycleRef.current = branchLifecycle;
  contactFormRef.current = contactForm;
  contactLifecycleRef.current = contactLifecycle;
  detailRef.current = detail;

  const updateEdit = useCallback((next: ClientEditState) => { editRef.current = next; setEdit(next); }, []);
  const updateLifecycle = useCallback((next: ClientLifecycleState) => { lifecycleRef.current = next; setLifecycle(next); }, []);
  const updateBranchForm = useCallback((next: BranchFormState) => { branchFormRef.current = next; setBranchForm(next); }, []);
  const updateBranchLifecycle = useCallback((next: BranchLifecycleState) => { branchLifecycleRef.current = next; setBranchLifecycle(next); }, []);
  const updateContactForm = useCallback((next: ContactFormState) => { contactFormRef.current = next; setContactForm(next); }, []);
  const updateContactLifecycle = useCallback((next: ContactLifecycleState) => { contactLifecycleRef.current = next; setContactLifecycle(next); }, []);

  const queryRef = useRef(query);
  const canViewRef = useRef(capabilities.canView);
  const canManageRef = useRef(capabilities.canManage);
  const externalSearchRef = useRef(search.trim());
  const mountedRef = useRef(true);
  const listControllerRef = useRef<AbortController | null>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const branchControllerRef = useRef<AbortController | null>(null);
  const contactControllerRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const branchGenerationRef = useRef(0);
  const contactGenerationRef = useRef(0);
  const listDataKeyRef = useRef<string | null>(null);
  const confirmedClientsRef = useRef<Map<string, ClientDetail>>(new Map());
  const observedSummariesRef = useRef<Map<string, ClientPage["items"][number]>>(new Map());
  const mutationWatchedIdsRef = useRef<Set<string>>(new Set());
  const knownClientStatesRef = useRef<Map<string, { version: number; isActive: boolean }>>(new Map());
  const confirmedBranchesRef = useRef<Map<string, ClientBranch>>(new Map());
  const confirmedContactsRef = useRef<Map<string, ClientContact>>(new Map());
  const searchTimerRef = useRef<number | null>(null);
  const searchGenerationRef = useRef(0);

  const observeClientState = useCallback((client: { id: string; version: number; isActive: boolean }) => {
    const known = knownClientStatesRef.current.get(client.id);
    if (!known || client.version > known.version) knownClientStatesRef.current.set(client.id, { version: client.version, isActive: client.isActive });
  }, []);

  const withKnownBranch = useCallback((branch: ClientBranch): ClientBranch => {
    const key = `${branch.clientId}\u0000${branch.id}`;
    const known = confirmedBranchesRef.current.get(key);
    if (known && known.version > branch.version) return known;
    confirmedBranchesRef.current.set(key, branch);
    return branch;
  }, []);

  const withKnownBranches = useCallback((client: ClientDetail): ClientDetail => ({
    ...client, branches: client.branches.map(withKnownBranch),
  }), [withKnownBranch]);

  const withKnownContact = useCallback((contact: ClientContact): ClientContact => {
    const key = `${contact.clientId}\u0000${contact.id}`;
    const known = confirmedContactsRef.current.get(key);
    if (known && known.version > contact.version) return known;
    confirmedContactsRef.current.set(key, contact);
    return contact;
  }, []);

  const withKnownContacts = useCallback((client: ClientDetail): ClientDetail => ({
    ...client, contacts: client.contacts.map(withKnownContact),
  }), [withKnownContact]);

  const withConfirmedDetail = useCallback((incoming: ClientDetail): ClientDetail => {
    observeClientState(incoming);
    const normalized = withKnownContacts(withKnownBranches(incoming));
    const confirmed = confirmedClientsRef.current.get(incoming.id);
    if (confirmed && confirmed.version > incoming.version) return withKnownContacts(withKnownBranches(confirmed));
    if (!confirmed || incoming.version > confirmed.version) confirmedClientsRef.current.set(incoming.id, normalized);
    return normalized;
  }, [observeClientState, withKnownBranches, withKnownContacts]);

  const withConfirmedSummary = useCallback((incoming: ClientPage["items"][number]): ClientPage["items"][number] => {
    observeClientState(incoming);
    const observed = observedSummariesRef.current.get(incoming.id);
    if (!observed || incoming.version > observed.version) observedSummariesRef.current.set(incoming.id, incoming);
    if (!mutationWatchedIdsRef.current.has(incoming.id)) return incoming;
    const highestSummary = observed && observed.version > incoming.version ? observed : incoming;
    const confirmed = confirmedClientsRef.current.get(incoming.id);
    if (!confirmed || confirmed.version <= highestSummary.version) return highestSummary;
    return { ...highestSummary, tradeName: confirmed.tradeName, legalName: confirmed.legalName, taxId: confirmed.taxId,
      phone: confirmed.phone, email: confirmed.email, isActive: confirmed.isActive,
      createdAt: confirmed.createdAt, updatedAt: confirmed.updatedAt, version: confirmed.version };
  }, [observeClientState]);

  canViewRef.current = capabilities.canView;
  canManageRef.current = capabilities.canManage;

  const invalidateList = useCallback(() => {
    listGenerationRef.current += 1;
    listControllerRef.current?.abort();
    listControllerRef.current = null;
  }, []);

  const invalidateDetail = useCallback(() => {
    detailGenerationRef.current += 1;
    detailControllerRef.current?.abort();
    detailControllerRef.current = null;
  }, []);

  const invalidateBranches = useCallback(() => {
    branchGenerationRef.current += 1;
    branchControllerRef.current?.abort();
    branchControllerRef.current = null;
  }, []);

  const invalidateContacts = useCallback(() => {
    contactGenerationRef.current += 1;
    contactControllerRef.current?.abort();
    contactControllerRef.current = null;
  }, []);

  const refreshList = useCallback(async (): Promise<void> => {
    invalidateList();
    if (!mountedRef.current || !canViewRef.current) return;
    const filters = { ...queryRef.current.clients };
    const key = JSON.stringify(filters);
    const controller = new AbortController();
    listControllerRef.current = controller;
    const generation = listGenerationRef.current;
    setList((current) => ({
      status: "loading", data: listDataKeyRef.current === key ? current.data : null, error: null, stale: false,
    }));
    try {
      const incoming = await api.listClients(filters, controller.signal);
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted
        || generation !== listGenerationRef.current || JSON.stringify(queryRef.current.clients) !== key) return;
      const sameDataKey = listDataKeyRef.current === key;
      listDataKeyRef.current = key;
      setList((current) => ({
        status: "success",
        data: current.data && sameDataKey
          ? { ...incoming, items: incoming.items.map((raw) => {
            const item = withConfirmedSummary(raw);
            const previous = current.data?.items.find((candidate) => candidate.id === item.id);
            return previous ? reconcileClient(previous, item) : item;
          }) }
          : { ...incoming, items: incoming.items.map(withConfirmedSummary) },
        error: null,
        stale: false,
      }));
    } catch (error: unknown) {
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted
        || generation !== listGenerationRef.current || isAbortError(error)
        || JSON.stringify(queryRef.current.clients) !== key) return;
      setList((current) => ({
        status: "error", data: current.data, error: errorMessage(error, "No fue posible cargar los clientes"),
        stale: current.data !== null,
      }));
    } finally {
      if (listControllerRef.current === controller) listControllerRef.current = null;
    }
  }, [api, invalidateList, withConfirmedSummary]);

  const refreshDetail = useCallback(async (): Promise<void> => {
    invalidateDetail();
    const { clientId, clients } = queryRef.current;
    if (!mountedRef.current || !canViewRef.current || !clientId) {
      if (mountedRef.current) setDetailSnapshot({ key: null, state: idle<ClientDetail>() });
      return;
    }
    const key = `${clientId}\u0000${clients.includeInactive}`;
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const generation = detailGenerationRef.current;
    setDetailSnapshot((current) => ({
      key,
      state: {
        status: "loading", data: current.key === key ? current.state.data : null, error: null, stale: false,
      },
    }));
    try {
      const incoming = await api.getClient(clientId, clients.includeInactive, controller.signal);
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted
        || generation !== detailGenerationRef.current || queryRef.current.clientId !== clientId
        || queryRef.current.clients.includeInactive !== clients.includeInactive) return;
      const authoritative = withConfirmedDetail(incoming);
      setDetailSnapshot((current) => ({
        key,
        state: {
          status: "success",
          data: current.key === key && current.state.data
            ? withKnownContacts(withKnownBranches(reconcileClient(current.state.data, authoritative))) : authoritative,
          error: null,
          stale: false,
        },
      }));
    } catch (error: unknown) {
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted
        || generation !== detailGenerationRef.current || isAbortError(error)
        || queryRef.current.clientId !== clientId || queryRef.current.clients.includeInactive !== clients.includeInactive) return;
      setDetailSnapshot((current) => {
        const data = current.key === key ? current.state.data : null;
        return {
          key,
          state: {
            status: "error", data, error: errorMessage(error, "No fue posible cargar el cliente"),
            stale: data !== null,
          },
        };
      });
    } finally {
      if (detailControllerRef.current === controller) detailControllerRef.current = null;
    }
  }, [api, invalidateDetail, withConfirmedDetail, withKnownBranches, withKnownContacts]);

  const refreshBranches = useCallback(async (): Promise<void> => {
    invalidateBranches();
    const { clientId, tab, branches: filters } = queryRef.current;
    if (!mountedRef.current || !canViewRef.current || !clientId || tab !== "branches") {
      if (mountedRef.current) setBranchSnapshot({ key: null, state: idle<BranchPage>() });
      return;
    }
    const key = JSON.stringify([clientId, filters]);
    const controller = new AbortController();
    const generation = branchGenerationRef.current;
    branchControllerRef.current = controller;
    setBranchSnapshot((current) => ({ key, state: {
      status: "loading", data: current.key === key ? current.state.data : null, error: null, stale: false,
    } }));
    try {
      const incoming = await api.listBranches(clientId, { ...filters }, controller.signal);
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted || generation !== branchGenerationRef.current
        || queryRef.current.clientId !== clientId || queryRef.current.tab !== "branches"
        || JSON.stringify([queryRef.current.clientId, queryRef.current.branches]) !== key) return;
      const normalized = { ...incoming, items: incoming.items.map(withKnownBranch) };
      setBranchSnapshot({ key, state: { status: "success", data: normalized, error: null, stale: false } });
      setDetailSnapshot((current) => current.state.data?.id === clientId
        ? { ...current, state: { ...current.state, data: withKnownBranches(current.state.data) } }
        : current);
    } catch (error: unknown) {
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted || generation !== branchGenerationRef.current
        || isAbortError(error) || queryRef.current.clientId !== clientId || queryRef.current.tab !== "branches"
        || JSON.stringify([queryRef.current.clientId, queryRef.current.branches]) !== key) return;
      setBranchSnapshot((current) => {
        const data = current.key === key ? current.state.data : null;
        return { key, state: { status: "error", data, error: errorMessage(error, "No fue posible cargar las sucursales"), stale: data !== null } };
      });
    } finally {
      if (branchControllerRef.current === controller) branchControllerRef.current = null;
    }
  }, [api, invalidateBranches, withKnownBranch, withKnownBranches]);

  const refreshContacts = useCallback(async (): Promise<void> => {
    invalidateContacts();
    const { clientId, tab, contacts: filters } = queryRef.current;
    if (!mountedRef.current || !canViewRef.current || !clientId || tab !== "contacts") {
      if (mountedRef.current) setContactSnapshot({ key: null, state: idle<ContactPage>() });
      return;
    }
    const key = JSON.stringify([clientId, filters]);
    const controller = new AbortController();
    const generation = contactGenerationRef.current;
    contactControllerRef.current = controller;
    setContactSnapshot((current) => ({ key, state: {
      status: "loading", data: current.key === key ? current.state.data : null, error: null, stale: false,
    } }));
    try {
      const incoming = await api.listContacts(clientId, { ...filters }, controller.signal);
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted || generation !== contactGenerationRef.current
        || queryRef.current.clientId !== clientId || queryRef.current.tab !== "contacts"
        || JSON.stringify([queryRef.current.clientId, queryRef.current.contacts]) !== key) return;
      setContactSnapshot({ key, state: { status: "success", data: { ...incoming, items: incoming.items.map(withKnownContact) }, error: null, stale: false } });
    } catch (error: unknown) {
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted || generation !== contactGenerationRef.current
        || isAbortError(error) || queryRef.current.clientId !== clientId || queryRef.current.tab !== "contacts"
        || JSON.stringify([queryRef.current.clientId, queryRef.current.contacts]) !== key) return;
      setContactSnapshot((current) => {
        const data = current.key === key ? current.state.data : null;
        return { key, state: { status: "error", data, error: errorMessage(error, "No fue posible cargar los contactos"), stale: data !== null } };
      });
    } finally {
      if (contactControllerRef.current === controller) contactControllerRef.current = null;
    }
  }, [api, invalidateContacts, withKnownContact]);

  const refresh = useCallback(async (): Promise<void> => {
    const activeTab = queryRef.current.tab;
    await Promise.all([refreshList(), refreshDetail(),
      activeTab === "branches" ? refreshBranches() : activeTab === "contacts" ? refreshContacts() : Promise.resolve()]);
  }, [refreshBranches, refreshContacts, refreshDetail, refreshList]);

  const commitQuery = useCallback((next: ClientQueryState, navigation: "push" | "replace") => {
    queryRef.current = next;
    setQuery(next);
    const nextUrl = urlWith(serializeClientSearch(window.location.search, next));
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history[navigation === "push" ? "pushState" : "replaceState"](window.history.state, "", nextUrl);
    }
  }, []);

  const setClientFilters = useCallback((patch: Partial<ClientListFilters>) => {
    const current = queryRef.current;
    const clients = { ...current.clients, ...patch, page: patch.page ?? 1 };
    if (clients.isActive === false) clients.includeInactive = true;
    else if (Object.prototype.hasOwnProperty.call(patch, "isActive")
      && !Object.prototype.hasOwnProperty.call(patch, "includeInactive")) clients.includeInactive = false;
    const next: ClientQueryState = {
      ...current,
      clients,
    };
    const includeInactiveChanged = next.clients.includeInactive !== current.clients.includeInactive;
    commitQuery(next, "replace");
    void refreshList();
    if (includeInactiveChanged && next.clientId) void refreshDetail();
  }, [commitQuery, refreshDetail, refreshList]);

  const setBranchFilters = useCallback((patch: Partial<BranchListFilters>) => {
    const current = queryRef.current;
    if (!current.clientId) return;
    const filters = { ...current.branches, ...patch, page: patch.page ?? 1 };
    if (filters.isActive === false) filters.includeInactive = true;
    else if (Object.prototype.hasOwnProperty.call(patch, "isActive")
      && !Object.prototype.hasOwnProperty.call(patch, "includeInactive")) filters.includeInactive = false;
    commitQuery({ ...current, branches: filters }, "replace");
    if (current.tab === "branches") void refreshBranches();
  }, [commitQuery, refreshBranches]);

  const setContactFilters = useCallback((patch: Partial<ContactListFilters>) => {
    const current = queryRef.current;
    if (!current.clientId) return;
    const filters = { ...current.contacts, ...patch, page: patch.page ?? 1 };
    if (filters.scope === "CLIENT") delete filters.branchId;
    if (filters.isActive === false) filters.includeInactive = true;
    else if (Object.prototype.hasOwnProperty.call(patch, "isActive")
      && !Object.prototype.hasOwnProperty.call(patch, "includeInactive")) filters.includeInactive = false;
    commitQuery({ ...current, contacts: filters }, "replace");
    if (current.tab === "contacts") void refreshContacts();
  }, [commitQuery, refreshContacts]);

  const clearClientFilters = useCallback(() => {
    updateEdit(emptyEdit());
    updateLifecycle(emptyLifecycle());
    updateBranchForm(emptyBranchForm());
    updateBranchLifecycle(emptyBranchLifecycle());
    updateContactForm(emptyContactForm());
    updateContactLifecycle(emptyContactLifecycle());
    searchGenerationRef.current += 1;
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    invalidateDetail();
    invalidateBranches();
    setBranchSnapshot({ key: null, state: idle<BranchPage>() });
    invalidateContacts();
    setContactSnapshot({ key: null, state: idle<ContactPage>() });
    setDetailSnapshot({ key: null, state: idle<ClientDetail>() });
    const defaults = parseClientSearch("");
    commitQuery({ ...defaults, clients: defaults.clients }, "replace");
    void refreshList();
  }, [commitQuery, invalidateBranches, invalidateContacts, invalidateDetail, refreshList, updateBranchForm, updateBranchLifecycle, updateContactForm, updateContactLifecycle, updateEdit, updateLifecycle]);

  const selectClient = useCallback((id: string) => {
    if (!canViewRef.current || !id.trim()) return;
    const current = queryRef.current;
    if (current.clientId === id.trim()) {
      void refreshDetail();
      return;
    }
    updateEdit(emptyEdit());
    updateLifecycle(emptyLifecycle());
    updateBranchForm(emptyBranchForm());
    updateBranchLifecycle(emptyBranchLifecycle());
    updateContactForm(emptyContactForm());
    updateContactLifecycle(emptyContactLifecycle());
    invalidateBranches();
    setBranchSnapshot({ key: null, state: idle<BranchPage>() });
    invalidateContacts();
    setContactSnapshot({ key: null, state: idle<ContactPage>() });
    const defaults = parseClientSearch("");
    commitQuery({ ...current, clientId: id.trim(), tab: "summary", branches: defaults.branches, contacts: defaults.contacts }, "push");
    void refreshDetail();
  }, [commitQuery, invalidateBranches, invalidateContacts, refreshDetail, updateBranchForm, updateBranchLifecycle, updateContactForm, updateContactLifecycle, updateEdit, updateLifecycle]);

  const closeDetail = useCallback(() => {
    const current = queryRef.current;
    if (!current.clientId) return;
    updateEdit(emptyEdit());
    updateLifecycle(emptyLifecycle());
    updateBranchForm(emptyBranchForm());
    updateBranchLifecycle(emptyBranchLifecycle());
    updateContactForm(emptyContactForm());
    updateContactLifecycle(emptyContactLifecycle());
    invalidateDetail();
    invalidateBranches();
    invalidateContacts();
    const defaults = parseClientSearch("");
    setDetailSnapshot({ key: null, state: idle<ClientDetail>() });
    setBranchSnapshot({ key: null, state: idle<BranchPage>() });
    setContactSnapshot({ key: null, state: idle<ContactPage>() });
    commitQuery({ ...current, clientId: null, tab: "summary", branches: defaults.branches, contacts: defaults.contacts }, "push");
  }, [commitQuery, invalidateBranches, invalidateContacts, invalidateDetail, updateBranchForm, updateBranchLifecycle, updateContactForm, updateContactLifecycle, updateEdit, updateLifecycle]);

  const setTab = useCallback((tab: ClientTab) => {
    const previous = queryRef.current.tab;
    if (previous === tab) return;
    commitQuery({ ...queryRef.current, tab }, "replace");
    if (tab === "branches") void refreshBranches();
    else {
      invalidateBranches();
      setBranchSnapshot({ key: null, state: idle<BranchPage>() });
    }
    if (tab === "contacts") void refreshContacts();
    else {
      invalidateContacts();
      setContactSnapshot({ key: null, state: idle<ContactPage>() });
    }
  }, [commitQuery, invalidateBranches, invalidateContacts, refreshBranches, refreshContacts]);

  const openCreate = useCallback(() => {
    if (!canManageRef.current || createPendingRef.current) return;
    setCreate({ open: true, pending: false, error: null, fieldErrors: [] });
  }, []);

  const closeForm = useCallback(() => {
    if (createPendingRef.current) return;
    setCreate({ open: false, pending: false, error: null, fieldErrors: [] });
  }, []);

  const submitCreate = useCallback(async (input: CreateClientInput): Promise<void> => {
    if (!canManageRef.current || createPendingRef.current) return;
    createPendingRef.current = true;
    setCreate((current) => ({ ...current, pending: true, error: null, fieldErrors: [] }));
    try {
      const created = await api.createClient(input);
      if (!mountedRef.current) return;
      invalidateDetail();
      const defaults = parseClientSearch("");
      commitQuery({ ...queryRef.current, clientId: created.id, tab: "summary", branches: defaults.branches, contacts: defaults.contacts }, "push");
      setDetailSnapshot({ key: `${created.id}\u0000${queryRef.current.clients.includeInactive}`, state: { status: "success", data: created, error: null, stale: false } });
      setCreate({ open: false, pending: false, error: null, fieldErrors: [] });
      void refreshList();
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      const fieldErrors = error && typeof error === "object" && "fieldErrors" in error && Array.isArray(error.fieldErrors)
        ? error.fieldErrors as ApiFieldError[] : [];
      setCreate((current) => ({ ...current, pending: false, error: errorMessage(error, "No fue posible crear el cliente"), fieldErrors }));
    } finally {
      createPendingRef.current = false;
    }
  }, [api, commitQuery, invalidateDetail, refreshList]);

  const closeClientForms = useCallback(() => {
    if (editPendingRef.current || lifecyclePendingRef.current) return;
    updateEdit(emptyEdit());
    updateLifecycle(emptyLifecycle());
  }, [updateEdit, updateLifecycle]);

  const openEdit = useCallback(() => {
    const client = detailRef.current.data;
    if (!canViewRef.current || !canManageRef.current || !client || client.id !== queryRef.current.clientId || !client.isActive || editPendingRef.current || lifecyclePendingRef.current) return;
    updateLifecycle(emptyLifecycle());
    updateEdit({ ...emptyEdit(), open: true, draft: { clientId: client.id, baseVersion: client.version, values: clientValues(client), conflict: null } });
  }, [updateEdit, updateLifecycle]);

  const changeClientEdit = useCallback((patch: Omit<UpdateClientInput, "version">) => {
    const current = editRef.current;
    if (!current.open || !current.draft || editPendingRef.current) return;
    updateEdit({ ...current, error: null, fieldErrors: [], draft: { ...current.draft, values: { ...current.draft.values, ...patch } } });
  }, [updateEdit]);

  const reconcileMutation = useCallback((incoming: ClientDetail) => {
    if (incoming.id !== queryRef.current.clientId) return;
    const authoritative = withConfirmedDetail(incoming);
    setDetailSnapshot((current) => current.state.data?.id === incoming.id
      ? { ...current, state: { status: "success", data: reconcileClient(current.state.data, authoritative), error: null, stale: false } }
      : current);
    setList((current) => current.data ? { ...current, data: { ...current.data, items: current.data.items.map((item) => item.id === incoming.id ? reconcileClient(item, { ...authoritative, activeBranchCount: item.activeBranchCount, activeContactCount: item.activeContactCount }) : item) } } : current);
  }, [withConfirmedDetail]);

  const handleMissingClient = useCallback(() => {
    closeDetail();
    void refreshList();
  }, [closeDetail, refreshList]);

  const submitClientEdit = useCallback(async (values: Omit<UpdateClientInput, "version">): Promise<void> => {
    const current = editRef.current;
    if (!canViewRef.current || !canManageRef.current || !current.open || !current.draft || editPendingRef.current || current.draft.clientId !== queryRef.current.clientId) return;
    const known = knownClientStatesRef.current.get(current.draft.clientId);
    if (known && !known.isActive) {
      updateEdit({ ...current, error: "El cliente ahora está inactivo. Revisa su estado antes de guardar.", draft: { ...current.draft, values: { ...current.draft.values, ...values } } });
      return;
    }
    editPendingRef.current = true;
    mutationWatchedIdsRef.current.add(current.draft.clientId);
    const draft = { ...current.draft, values: { ...current.draft.values, ...values } };
    updateEdit({ ...current, pending: true, error: null, fieldErrors: [], draft });
    try {
      const updated = await api.updateClient(draft.clientId, { version: draft.baseVersion, ...values });
      if (!mountedRef.current || queryRef.current.clientId !== draft.clientId) return;
      reconcileMutation(updated);
      updateEdit(emptyEdit());
      void refreshList();
      void refreshDetail();
    } catch (error: unknown) {
      if (!mountedRef.current || queryRef.current.clientId !== draft.clientId) return;
      if (error instanceof ApiClientError && error.status === 404) { handleMissingClient(); return; }
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) { updateEdit(emptyEdit()); return; }
      const fieldErrors = error instanceof ApiClientError ? error.fieldErrors : [];
      const versionConflict = error instanceof ApiClientError && error.status === 409 && error.code === "VERSION_CONFLICT";
      const reviewed = editRef.current.draft?.conflict;
      updateEdit({ ...editRef.current, pending: Boolean(versionConflict && reviewed), error: clientMutationError(error, "No fue posible actualizar el cliente."), fieldErrors,
        versionConflict: editRef.current.versionConflict || versionConflict });
      if (versionConflict && reviewed) {
        try {
          const latest = withConfirmedDetail(await api.getClient(draft.clientId, true));
          const state = editRef.current;
          if (mountedRef.current && state.open && state.draft?.clientId === draft.clientId && state.draft.baseVersion === draft.baseVersion) {
            updateEdit({ ...state, reviewError: null, draft: { ...state.draft, conflict: latest.version > draft.baseVersion ? latest : reviewed } });
          }
        } catch {
          if (mountedRef.current && editRef.current.open && editRef.current.draft?.clientId === draft.clientId) {
            updateEdit({ ...editRef.current, reviewError: "No fue posible actualizar la versión vigente. Reintenta la consulta." });
          }
        }
      }
    } finally {
      editPendingRef.current = false;
      if (editRef.current.pending) updateEdit({ ...editRef.current, pending: false });
    }
  }, [api, handleMissingClient, reconcileMutation, refreshDetail, refreshList, updateEdit, withConfirmedDetail]);

  const openClientLifecycle = useCallback((action: "deactivate" | "reactivate") => {
    const client = detailRef.current.data;
    if (!canViewRef.current || !canManageRef.current || !client || client.id !== queryRef.current.clientId || client.isActive !== (action === "deactivate") || editPendingRef.current || lifecyclePendingRef.current) return;
    updateEdit(emptyEdit());
    updateLifecycle({ ...emptyLifecycle(), open: true, action, clientId: client.id, baseVersion: client.version });
  }, [updateEdit, updateLifecycle]);

  const changeClientLifecycleReason = useCallback((reason: string) => {
    const current = lifecycleRef.current;
    if (!current.open || lifecyclePendingRef.current) return;
    updateLifecycle({ ...current, reason, error: null, fieldErrors: [] });
  }, [updateLifecycle]);

  const submitClientLifecycle = useCallback(async (reason: string): Promise<void> => {
    const current = lifecycleRef.current;
    if (!canViewRef.current || !canManageRef.current || !current.open || lifecyclePendingRef.current || current.clientId !== queryRef.current.clientId) return;
    const normalized = reason.trim();
    if (normalized.length < 10 || normalized.length > 500) {
      updateLifecycle({ ...current, reason, error: "El motivo debe tener entre 10 y 500 caracteres.", fieldErrors: [] });
      return;
    }
    const known = knownClientStatesRef.current.get(current.clientId);
    if (known && known.isActive !== (current.action === "deactivate")) {
      updateLifecycle({ ...current, reason, error: known.isActive
        ? "El cliente ahora está activo. Revisa su estado antes de reactivarlo."
        : "El cliente ahora está inactivo. Revisa su estado antes de desactivarlo." });
      return;
    }
    lifecyclePendingRef.current = true;
    mutationWatchedIdsRef.current.add(current.clientId);
    updateLifecycle({ ...current, reason, pending: true, error: null, fieldErrors: [] });
    try {
      const updated = await (current.action === "deactivate" ? api.deactivateClient : api.reactivateClient)(current.clientId, { version: current.baseVersion, reason: normalized });
      if (!mountedRef.current || queryRef.current.clientId !== current.clientId) return;
      reconcileMutation(updated);
      updateLifecycle(emptyLifecycle());
      if (!updated.isActive && !queryRef.current.clients.includeInactive) {
        const query = queryRef.current;
        commitQuery({ ...query, clients: { ...query.clients, includeInactive: true } }, "replace");
      }
      void refreshList();
      void refreshDetail();
    } catch (error: unknown) {
      if (!mountedRef.current || queryRef.current.clientId !== current.clientId) return;
      if (error instanceof ApiClientError && error.status === 404) { handleMissingClient(); return; }
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) { updateLifecycle(emptyLifecycle()); return; }
      const versionConflict = error instanceof ApiClientError && error.status === 409 && error.code === "VERSION_CONFLICT";
      const reviewed = lifecycleRef.current.conflict;
      updateLifecycle({ ...lifecycleRef.current, pending: Boolean(versionConflict && reviewed), error: clientMutationError(error, "No fue posible cambiar el estado del cliente."),
        fieldErrors: error instanceof ApiClientError ? error.fieldErrors : [],
        versionConflict: lifecycleRef.current.versionConflict || versionConflict });
      if (versionConflict && reviewed) {
        try {
          const latest = withConfirmedDetail(await api.getClient(current.clientId, true));
          const state = lifecycleRef.current;
          if (mountedRef.current && state.open && state.clientId === current.clientId && state.baseVersion === current.baseVersion) {
            updateLifecycle({ ...state, reviewError: null, conflict: latest.version > current.baseVersion ? latest : reviewed });
          }
        } catch {
          if (mountedRef.current && lifecycleRef.current.open && lifecycleRef.current.clientId === current.clientId) {
            updateLifecycle({ ...lifecycleRef.current, reviewError: "No fue posible actualizar la versión vigente. Reintenta la consulta." });
          }
        }
      }
    } finally {
      lifecyclePendingRef.current = false;
      if (lifecycleRef.current.pending) updateLifecycle({ ...lifecycleRef.current, pending: false });
    }
  }, [api, commitQuery, handleMissingClient, reconcileMutation, refreshDetail, refreshList, updateLifecycle, withConfirmedDetail]);

  const reviewClientConflict = useCallback(async (): Promise<void> => {
    const editNow = editRef.current;
    const lifeNow = lifecycleRef.current;
    const clientId = editNow.open ? editNow.draft?.clientId : lifeNow.open ? lifeNow.clientId : null;
    if (!clientId || !canViewRef.current || clientId !== queryRef.current.clientId || editNow.reviewPending || lifeNow.reviewPending) return;
    if (editNow.open) updateEdit({ ...editNow, reviewPending: true, reviewError: null });
    else updateLifecycle({ ...lifeNow, reviewPending: true, reviewError: null });
    try {
      const current = withConfirmedDetail(await api.getClient(clientId, true));
      if (!mountedRef.current || queryRef.current.clientId !== clientId) return;
      if (editRef.current.open && editRef.current.draft?.clientId === clientId) {
        const state = editRef.current;
        const draft = state.draft;
        if (!draft) return;
        updateEdit({ ...state, reviewPending: false, draft: { ...draft, conflict: current.version > draft.baseVersion ? current : null }, reviewError: current.version > draft.baseVersion ? null : "No hay una versión más reciente disponible." });
      } else if (lifecycleRef.current.open && lifecycleRef.current.clientId === clientId) {
        const state = lifecycleRef.current;
        updateLifecycle({ ...state, reviewPending: false, conflict: current.version > state.baseVersion ? current : null, reviewError: current.version > state.baseVersion ? null : "No hay una versión más reciente disponible." });
      }
    } catch (error: unknown) {
      if (!mountedRef.current || queryRef.current.clientId !== clientId) return;
      if (error instanceof ApiClientError && error.status === 404) { handleMissingClient(); return; }
      if (editRef.current.open) updateEdit({ ...editRef.current, reviewPending: false, reviewError: "No fue posible cargar la versión vigente. Reintenta la consulta." });
      else if (lifecycleRef.current.open) updateLifecycle({ ...lifecycleRef.current, reviewPending: false, reviewError: "No fue posible cargar la versión vigente. Reintenta la consulta." });
    }
  }, [api, handleMissingClient, updateEdit, updateLifecycle, withConfirmedDetail]);

  const adoptClientConflict = useCallback(() => {
    const editNow = editRef.current;
    if (editNow.open && editNow.draft?.conflict && !editNow.pending && !editNow.reviewPending) {
      updateEdit({ ...editNow, error: null, reviewError: null, versionConflict: false, draft: { ...editNow.draft, baseVersion: editNow.draft.conflict.version, conflict: null } });
      return;
    }
    const lifeNow = lifecycleRef.current;
    if (lifeNow.open && lifeNow.conflict && !lifeNow.pending && !lifeNow.reviewPending) {
      updateLifecycle({ ...lifeNow, baseVersion: lifeNow.conflict.version, conflict: null, error: null, reviewError: null, versionConflict: false });
    }
  }, [updateEdit, updateLifecycle]);

  const canMutateBranch = useCallback((clientId: string): boolean => {
    const client = detailRef.current.data;
    const known = knownClientStatesRef.current.get(clientId);
    return Boolean(canViewRef.current && canManageRef.current && client?.id === clientId
      && queryRef.current.clientId === clientId && client.isActive && known?.isActive !== false);
  }, []);

  const closeBranchDialogs = useCallback(() => {
    if (branchPendingRef.current) return;
    updateBranchForm(emptyBranchForm());
    updateBranchLifecycle(emptyBranchLifecycle());
  }, [updateBranchForm, updateBranchLifecycle]);

  const openBranchCreate = useCallback(() => {
    const client = detailRef.current.data;
    if (!client || !canMutateBranch(client.id) || branchPendingRef.current) return;
    updateBranchLifecycle(emptyBranchLifecycle());
    updateBranchForm({ ...emptyBranchForm(), open: true, draft: { clientId: client.id, branchId: null, baseVersion: null,
      values: { name: "", address: "", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null }, conflict: null } });
  }, [canMutateBranch, updateBranchForm, updateBranchLifecycle]);

  const openBranchEdit = useCallback((branch: ClientBranch) => {
    if (!canMutateBranch(branch.clientId) || !branch.isActive || branchPendingRef.current) return;
    updateBranchLifecycle(emptyBranchLifecycle());
    updateBranchForm({ ...emptyBranchForm(), open: true, mode: "edit", draft: { clientId: branch.clientId,
      branchId: branch.id, baseVersion: branch.version, values: branchValues(branch), conflict: null } });
  }, [canMutateBranch, updateBranchForm, updateBranchLifecycle]);

  const changeBranchForm = useCallback((patch: Partial<BranchInput>) => {
    const state = branchFormRef.current;
    if (!state.open || !state.draft || branchPendingRef.current) return;
    updateBranchForm({ ...state, error: null, fieldErrors: [], draft: { ...state.draft, values: { ...state.draft.values, ...patch } } });
  }, [updateBranchForm]);

  const reconcileBranchMutation = useCallback((branch: ClientBranch) => {
    const authoritative = withKnownBranch(branch);
    setDetailSnapshot((current) => {
      const client = current.state.data;
      if (!client || client.id !== branch.clientId) return current;
      const exists = client.branches.some((item) => item.id === branch.id);
      return { ...current, state: { ...current.state, data: { ...client, branches: exists
        ? client.branches.map((item) => item.id === branch.id ? authoritative : item)
        : [...client.branches, authoritative] } } };
    });
    setBranchSnapshot((current) => current.state.data && queryRef.current.clientId === branch.clientId
      ? { ...current, state: { ...current.state, data: { ...current.state.data, items: current.state.data.items.map((item) => item.id === branch.id ? authoritative : item) } } }
      : current);
  }, [withKnownBranch]);

  const afterBranchSuccess = useCallback((branch: ClientBranch) => {
    invalidateBranches();
    invalidateDetail();
    invalidateList();
    reconcileBranchMutation(branch);
    void refreshBranches();
    void refreshDetail();
    void refreshList();
  }, [invalidateBranches, invalidateDetail, invalidateList, reconcileBranchMutation, refreshBranches, refreshDetail, refreshList]);

  const submitBranchForm = useCallback(async (values: BranchInput): Promise<void> => {
    const state = branchFormRef.current;
    const draft = state.draft;
    if (!state.open || !draft?.clientId || !canMutateBranch(draft.clientId) || branchPendingRef.current) return;
    branchPendingRef.current = true;
    const nextDraft = { ...draft, values };
    updateBranchForm({ ...state, draft: nextDraft, pending: true, error: null, fieldErrors: [] });
    try {
      const branch = state.mode === "create"
        ? await api.createBranch(draft.clientId, values)
        : await api.updateBranch(draft.clientId, draft.branchId!, { ...values, version: draft.baseVersion! });
      if (!mountedRef.current || queryRef.current.clientId !== draft.clientId) return;
      updateBranchForm(emptyBranchForm());
      afterBranchSuccess(branch);
    } catch (error: unknown) {
      if (!mountedRef.current || queryRef.current.clientId !== draft.clientId) return;
      const versionConflict = error instanceof ApiClientError && error.status === 409 && error.code === "VERSION_CONFLICT";
      updateBranchForm({ ...branchFormRef.current, pending: false, error: branchMutationError(error, "No fue posible guardar la sucursal."),
        fieldErrors: error instanceof ApiClientError ? error.fieldErrors : [], versionConflict });
    } finally {
      branchPendingRef.current = false;
    }
  }, [afterBranchSuccess, api, canMutateBranch, updateBranchForm]);

  const openBranchLifecycle = useCallback((branch: ClientBranch, action: "deactivate" | "reactivate") => {
    if (!canMutateBranch(branch.clientId) || branch.isActive !== (action === "deactivate") || branchPendingRef.current) return;
    updateBranchForm(emptyBranchForm());
    updateBranchLifecycle({ ...emptyBranchLifecycle(), open: true, action, clientId: branch.clientId, branchId: branch.id, baseVersion: branch.version });
  }, [canMutateBranch, updateBranchForm, updateBranchLifecycle]);

  const changeBranchLifecycleReason = useCallback((reason: string) => {
    const state = branchLifecycleRef.current;
    if (!state.open || branchPendingRef.current) return;
    updateBranchLifecycle({ ...state, reason, error: null, fieldErrors: [] });
  }, [updateBranchLifecycle]);

  const submitBranchLifecycle = useCallback(async (reason: string): Promise<void> => {
    const state = branchLifecycleRef.current;
    if (!state.open || !canMutateBranch(state.clientId) || branchPendingRef.current) return;
    const normalized = reason.trim();
    if (normalized.length < 10 || normalized.length > 500) {
      updateBranchLifecycle({ ...state, reason, error: "El motivo debe tener entre 10 y 500 caracteres." });
      return;
    }
    branchPendingRef.current = true;
    updateBranchLifecycle({ ...state, reason, pending: true, error: null, fieldErrors: [] });
    try {
      const branch = await (state.action === "deactivate" ? api.deactivateBranch : api.reactivateBranch)(state.clientId, state.branchId, { version: state.baseVersion, reason: normalized });
      if (!mountedRef.current || queryRef.current.clientId !== state.clientId) return;
      updateBranchLifecycle(emptyBranchLifecycle());
      afterBranchSuccess(branch);
    } catch (error: unknown) {
      if (!mountedRef.current || queryRef.current.clientId !== state.clientId) return;
      const versionConflict = error instanceof ApiClientError && error.status === 409 && error.code === "VERSION_CONFLICT";
      updateBranchLifecycle({ ...branchLifecycleRef.current, pending: false, error: branchMutationError(error, "No fue posible cambiar el estado de la sucursal."),
        fieldErrors: error instanceof ApiClientError ? error.fieldErrors : [], versionConflict });
    } finally {
      branchPendingRef.current = false;
    }
  }, [afterBranchSuccess, api, canMutateBranch, updateBranchLifecycle]);

  const reviewBranchConflict = useCallback(async (): Promise<void> => {
    const form = branchFormRef.current;
    const life = branchLifecycleRef.current;
    const clientId = form.open ? form.draft?.clientId : life.open ? life.clientId : null;
    const branchId = form.open ? form.draft?.branchId : life.open ? life.branchId : null;
    const baseVersion = form.open ? form.draft?.baseVersion : life.open ? life.baseVersion : null;
    if (!clientId || !branchId || baseVersion === null || baseVersion === undefined || !canViewRef.current || queryRef.current.clientId !== clientId) return;
    if (form.open) updateBranchForm({ ...form, reviewPending: true, reviewError: null });
    else updateBranchLifecycle({ ...life, reviewPending: true, reviewError: null });
    try {
      const client = await api.getClient(clientId, true);
      if (!mountedRef.current || queryRef.current.clientId !== clientId) return;
      observeClientState(client);
      const current = client.branches.find((item) => item.id === branchId) ?? null;
      const observed = current ? withKnownBranch(current) : null;
      const latest = observed && observed.version > baseVersion ? observed : null;
      const reviewError = latest ? null : "No hay una versión más reciente disponible.";
      if (form.open && branchFormRef.current.open && branchFormRef.current.draft?.branchId === branchId) {
        const state = branchFormRef.current;
        updateBranchForm({ ...state, reviewPending: false, reviewError, draft: { ...state.draft!, conflict: latest } });
      } else if (life.open && branchLifecycleRef.current.open && branchLifecycleRef.current.branchId === branchId) {
        updateBranchLifecycle({ ...branchLifecycleRef.current, reviewPending: false, reviewError, conflict: latest });
      }
    } catch {
      if (form.open && branchFormRef.current.open) updateBranchForm({ ...branchFormRef.current, reviewPending: false, reviewError: "No fue posible cargar la versión vigente. Reintenta la consulta." });
      else if (life.open && branchLifecycleRef.current.open) updateBranchLifecycle({ ...branchLifecycleRef.current, reviewPending: false, reviewError: "No fue posible cargar la versión vigente. Reintenta la consulta." });
    }
  }, [api, observeClientState, updateBranchForm, updateBranchLifecycle, withKnownBranch]);

  const adoptBranchConflict = useCallback(() => {
    const form = branchFormRef.current;
    if (form.open && form.draft?.conflict && !form.pending && !form.reviewPending) {
      updateBranchForm({ ...form, error: null, reviewError: null, versionConflict: false,
        draft: { ...form.draft, baseVersion: form.draft.conflict.version, conflict: null } });
      return;
    }
    const life = branchLifecycleRef.current;
    if (life.open && life.conflict && !life.pending && !life.reviewPending) {
      updateBranchLifecycle({ ...life, baseVersion: life.conflict.version, conflict: null, error: null, reviewError: null, versionConflict: false });
    }
  }, [updateBranchForm, updateBranchLifecycle]);

  const canMutateContact = useCallback((clientId: string): boolean => {
    const client = detailRef.current.data;
    const known = knownClientStatesRef.current.get(clientId);
    return Boolean(canViewRef.current && canManageRef.current && client?.id === clientId
      && queryRef.current.clientId === clientId && client.isActive && known?.isActive !== false);
  }, []);

  const closeContactDialogs = useCallback(() => {
    if (contactPendingRef.current) return;
    contactReviewControllerRef.current?.abort();
    contactReviewControllerRef.current = null;
    updateContactForm(emptyContactForm());
    updateContactLifecycle(emptyContactLifecycle());
  }, [updateContactForm, updateContactLifecycle]);

  const openContactCreate = useCallback(() => {
    const client = detailRef.current.data;
    if (!client || !canMutateContact(client.id) || contactPendingRef.current) return;
    updateContactLifecycle(emptyContactLifecycle());
    updateContactForm({ ...emptyContactForm(), open: true, draft: { clientId: client.id, contactId: null, baseVersion: null,
      values: { scope: "CLIENT", branchId: null, fullName: "", position: null, phone: null, email: null, isPrimary: false }, conflict: null } });
  }, [canMutateContact, updateContactForm, updateContactLifecycle]);

  const openContactEdit = useCallback((contact: ClientContact) => {
    if (!canMutateContact(contact.clientId) || !contact.isActive || contactPendingRef.current) return;
    updateContactLifecycle(emptyContactLifecycle());
    updateContactForm({ ...emptyContactForm(), mode: "edit", open: true, draft: { clientId: contact.clientId,
      contactId: contact.id, baseVersion: contact.version, values: contactValues(contact), conflict: null } });
  }, [canMutateContact, updateContactForm, updateContactLifecycle]);

  const changeContactForm = useCallback((patch: Partial<ContactFormValues>) => {
    const state = contactFormRef.current;
    if (!state.open || !state.draft || contactPendingRef.current) return;
    updateContactForm({ ...state, error: null, fieldErrors: [], draft: { ...state.draft, values: { ...state.draft.values, ...patch } } });
  }, [updateContactForm]);

  const reconcileContactMutation = useCallback((contact: ClientContact) => {
    const authoritative = withKnownContact(contact);
    setDetailSnapshot((current) => {
      const client = current.state.data;
      if (!client || client.id !== contact.clientId) return current;
      const exists = client.contacts.some((item) => item.id === contact.id);
      return { ...current, state: { ...current.state, data: { ...client, contacts: exists
        ? client.contacts.map((item) => item.id === contact.id ? authoritative : item)
        : [...client.contacts, authoritative] } } };
    });
    setContactSnapshot((current) => current.state.data && queryRef.current.clientId === contact.clientId
      ? { ...current, state: { ...current.state, data: { ...current.state.data, items: current.state.data.items.map((item) => item.id === contact.id ? authoritative : item) } } }
      : current);
  }, [withKnownContact]);

  const afterContactSuccess = useCallback((contact: ClientContact) => {
    invalidateContacts();
    invalidateDetail();
    invalidateList();
    reconcileContactMutation(contact);
    void refreshContacts();
    void refreshDetail();
    void refreshList();
  }, [invalidateContacts, invalidateDetail, invalidateList, reconcileContactMutation, refreshContacts, refreshDetail, refreshList]);

  const submitContactForm = useCallback(async (values: ContactFormValues): Promise<void> => {
    const state = contactFormRef.current;
    const draft = state.draft;
    if (!state.open || !draft || !canMutateContact(draft.clientId) || contactPendingRef.current) return;
    const client = detailRef.current.data;
    const branchMap = new Map<string, ClientBranch>();
    for (const branch of client?.branches ?? []) branchMap.set(branch.id, branch);
    for (const branch of confirmedBranchesRef.current.values()) {
      if (branch.clientId === draft.clientId && (!branchMap.has(branch.id) || branch.version > branchMap.get(branch.id)!.version)) branchMap.set(branch.id, branch);
    }
    const nextDraft = { ...draft, values };
    let input;
    try { input = toContactInput(values, [...branchMap.values()], draft.clientId); }
    catch (error) {
      updateContactForm({ ...state, draft: nextDraft, error: errorMessage(error, "Revisa los datos del contacto.") });
      return;
    }
    contactPendingRef.current = true;
    updateContactForm({ ...state, draft: nextDraft, pending: true, error: null, fieldErrors: [] });
    try {
      const contact = state.mode === "create"
        ? await api.createContact(draft.clientId, input)
        : await api.updateContact(draft.clientId, draft.contactId!, { ...input, version: draft.baseVersion! });
      if (!mountedRef.current || queryRef.current.clientId !== draft.clientId) return;
      updateContactForm(emptyContactForm());
      afterContactSuccess(contact);
    } catch (error: unknown) {
      if (!mountedRef.current || queryRef.current.clientId !== draft.clientId) return;
      const versionConflict = error instanceof ApiClientError && error.status === 409 && error.code === "VERSION_CONFLICT";
      updateContactForm({ ...contactFormRef.current, pending: false, error: contactMutationError(error, "No fue posible guardar el contacto."),
        fieldErrors: error instanceof ApiClientError ? error.fieldErrors : [], versionConflict: contactFormRef.current.versionConflict || versionConflict });
    } finally { contactPendingRef.current = false; }
  }, [afterContactSuccess, api, canMutateContact, updateContactForm]);

  const openContactLifecycle = useCallback((contact: ClientContact, action: "deactivate" | "reactivate") => {
    if (!canMutateContact(contact.clientId) || contact.isActive !== (action === "deactivate") || contactPendingRef.current) return;
    updateContactForm(emptyContactForm());
    updateContactLifecycle({ ...emptyContactLifecycle(), open: true, action, clientId: contact.clientId, contactId: contact.id, baseVersion: contact.version });
  }, [canMutateContact, updateContactForm, updateContactLifecycle]);

  const changeContactLifecycleReason = useCallback((reason: string) => {
    const state = contactLifecycleRef.current;
    if (!state.open || contactPendingRef.current) return;
    updateContactLifecycle({ ...state, reason, error: null, fieldErrors: [] });
  }, [updateContactLifecycle]);

  const submitContactLifecycle = useCallback(async (reason: string): Promise<void> => {
    const state = contactLifecycleRef.current;
    if (!state.open || !canMutateContact(state.clientId) || contactPendingRef.current) return;
    const normalized = reason.trim();
    if (normalized.length < 10 || normalized.length > 500) {
      updateContactLifecycle({ ...state, reason, error: "El motivo debe tener entre 10 y 500 caracteres." });
      return;
    }
    contactPendingRef.current = true;
    updateContactLifecycle({ ...state, reason, pending: true, error: null, fieldErrors: [] });
    try {
      const contact = await (state.action === "deactivate" ? api.deactivateContact : api.reactivateContact)(state.clientId, state.contactId, { version: state.baseVersion, reason: normalized });
      if (!mountedRef.current || queryRef.current.clientId !== state.clientId) return;
      updateContactLifecycle(emptyContactLifecycle());
      afterContactSuccess(contact);
    } catch (error: unknown) {
      if (!mountedRef.current || queryRef.current.clientId !== state.clientId) return;
      const versionConflict = error instanceof ApiClientError && error.status === 409 && error.code === "VERSION_CONFLICT";
      updateContactLifecycle({ ...contactLifecycleRef.current, pending: false, error: contactMutationError(error, "No fue posible cambiar el estado del contacto."),
        fieldErrors: error instanceof ApiClientError ? error.fieldErrors : [], versionConflict: contactLifecycleRef.current.versionConflict || versionConflict });
    } finally { contactPendingRef.current = false; }
  }, [afterContactSuccess, api, canMutateContact, updateContactLifecycle]);

  const reviewContactConflict = useCallback(async (): Promise<void> => {
    const form = contactFormRef.current;
    const life = contactLifecycleRef.current;
    const reviewingForm = form.open && form.mode === "edit" && Boolean(form.draft);
    const clientId = reviewingForm ? form.draft!.clientId : life.open ? life.clientId : null;
    const contactId = reviewingForm ? form.draft!.contactId : life.open ? life.contactId : null;
    const baseVersion = reviewingForm ? form.draft!.baseVersion : life.open ? life.baseVersion : null;
    if (!clientId || !contactId || baseVersion == null || !canViewRef.current || queryRef.current.clientId !== clientId
      || contactReviewControllerRef.current || (reviewingForm ? form.pending || form.reviewPending : life.pending || life.reviewPending)) return;
    const controller = new AbortController();
    contactReviewControllerRef.current = controller;
    if (reviewingForm) updateContactForm({ ...form, reviewPending: true, reviewError: null });
    else updateContactLifecycle({ ...life, reviewPending: true, reviewError: null });
    try {
      const response = await api.getClient(clientId, true, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || queryRef.current.clientId !== clientId) return;
      if (response.id !== clientId) throw new Error("El servidor devolvió otro cliente.");
      const observed = response.contacts.find((item) => item.id === contactId && item.clientId === clientId);
      const latest = observed ? withKnownContact(observed) : null;
      const conflict = latest && latest.version > baseVersion ? latest : null;
      const reviewError = conflict ? null : "No hay una versión más reciente disponible para este contacto.";
      if (reviewingForm && contactFormRef.current.open && contactFormRef.current.draft?.clientId === clientId
        && contactFormRef.current.draft.contactId === contactId && contactFormRef.current.draft.baseVersion === baseVersion) {
        const current = contactFormRef.current;
        updateContactForm({ ...current, reviewPending: false, reviewError, draft: { ...current.draft!, conflict: conflict ?? current.draft!.conflict } });
      } else if (!reviewingForm && contactLifecycleRef.current.open && contactLifecycleRef.current.clientId === clientId
        && contactLifecycleRef.current.contactId === contactId && contactLifecycleRef.current.baseVersion === baseVersion) {
        const current = contactLifecycleRef.current;
        updateContactLifecycle({ ...current, reviewPending: false, reviewError, conflict: conflict ?? current.conflict });
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || !mountedRef.current || queryRef.current.clientId !== clientId) return;
      const reviewError = error instanceof ApiClientError && error.status === 404
        ? "El contacto ya no está disponible. Cancela y actualiza la ficha."
        : "No fue posible cargar la versión vigente. Reintenta la consulta.";
      if (reviewingForm && contactFormRef.current.open && contactFormRef.current.draft?.clientId === clientId
        && contactFormRef.current.draft.contactId === contactId) updateContactForm({ ...contactFormRef.current, reviewPending: false, reviewError });
      else if (!reviewingForm && contactLifecycleRef.current.open && contactLifecycleRef.current.clientId === clientId
        && contactLifecycleRef.current.contactId === contactId) updateContactLifecycle({ ...contactLifecycleRef.current, reviewPending: false, reviewError });
    } finally {
      if (contactReviewControllerRef.current === controller) contactReviewControllerRef.current = null;
    }
  }, [api, updateContactForm, updateContactLifecycle, withKnownContact]);

  const adoptContactConflict = useCallback(() => {
    const form = contactFormRef.current;
    if (form.open && form.draft?.conflict && !form.pending && !form.reviewPending) {
      updateContactForm({ ...form, error: null, reviewError: null, versionConflict: false,
        draft: { ...form.draft, baseVersion: form.draft.conflict.version, conflict: null } });
      return;
    }
    const life = contactLifecycleRef.current;
    if (life.open && life.conflict && !life.pending && !life.reviewPending) {
      updateContactLifecycle({ ...life, baseVersion: life.conflict.version, conflict: null, error: null, reviewError: null, versionConflict: false });
    }
  }, [updateContactForm, updateContactLifecycle]);

  useEffect(() => {
    if (!capabilities.canManage || !capabilities.canView) {
      updateEdit(emptyEdit());
      updateLifecycle(emptyLifecycle());
      updateBranchForm(emptyBranchForm());
      updateBranchLifecycle(emptyBranchLifecycle());
      updateContactForm(emptyContactForm());
      updateContactLifecycle(emptyContactLifecycle());
    }
  }, [capabilities.canManage, capabilities.canView, updateBranchForm, updateBranchLifecycle, updateContactForm, updateContactLifecycle, updateEdit, updateLifecycle]);

  useEffect(() => {
    mountedRef.current = true;
    const normalizedUrl = urlWith(serializeClientSearch(window.location.search, queryRef.current));
    if (normalizedUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", normalizedUrl);
    }
    if (capabilities.canView) {
      void refreshList();
      if (queryRef.current.clientId) void refreshDetail();
      if (queryRef.current.clientId && queryRef.current.tab === "branches") void refreshBranches();
      if (queryRef.current.clientId && queryRef.current.tab === "contacts") void refreshContacts();
    } else {
      invalidateList();
      invalidateDetail();
      invalidateBranches();
      invalidateContacts();
      setList(idle<ClientPage>());
      setDetailSnapshot({ key: null, state: idle<ClientDetail>() });
      setBranchSnapshot({ key: null, state: idle<BranchPage>() });
      setContactSnapshot({ key: null, state: idle<ContactPage>() });
    }
  }, [capabilities.canView, invalidateBranches, invalidateContacts, invalidateDetail, invalidateList, refreshBranches, refreshContacts, refreshDetail, refreshList]);

  useEffect(() => {
    const handlePopState = () => {
      searchGenerationRef.current += 1;
      if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
      const restored = parseClientSearch(window.location.search);
      if (restored.clientId !== queryRef.current.clientId) {
        updateEdit(emptyEdit());
        updateLifecycle(emptyLifecycle());
        updateBranchForm(emptyBranchForm());
        updateBranchLifecycle(emptyBranchLifecycle());
        updateContactForm(emptyContactForm());
        updateContactLifecycle(emptyContactLifecycle());
      }
      queryRef.current = restored;
      setQuery(restored);
      void refreshList();
      void refreshDetail();
      void refreshBranches();
      void refreshContacts();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [refreshBranches, refreshContacts, refreshDetail, refreshList, updateBranchForm, updateBranchLifecycle, updateContactForm, updateContactLifecycle, updateEdit, updateLifecycle]);

  useEffect(() => {
    const normalized = search.trim();
    if (externalSearchRef.current === normalized) return;
    externalSearchRef.current = normalized;
    const generation = ++searchGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (generation !== searchGenerationRef.current || !mountedRef.current) return;
      searchTimerRef.current = null;
      const current = queryRef.current;
      commitQuery({
        ...current,
        clients: { ...current.clients, search: normalized || undefined, page: 1 },
      }, "replace");
      void refreshList();
    }, 300);
    searchTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (searchTimerRef.current === timer) searchTimerRef.current = null;
    };
  }, [commitQuery, refreshList, search]);

  useEffect(() => () => {
    mountedRef.current = false;
    invalidateList();
    invalidateDetail();
    invalidateBranches();
    invalidateContacts();
  }, [invalidateBranches, invalidateContacts, invalidateDetail, invalidateList]);

  const currentClient = detail.data?.id === query.clientId ? detail.data : null;
  const knownClient = currentClient ? knownClientStatesRef.current.get(currentClient.id) : null;
  const branchClientActive = Boolean(currentClient?.isActive && knownClient?.isActive !== false);
  const contactBranchMap = new Map<string, ClientBranch>();
  if (currentClient) {
    for (const branch of currentClient.branches) contactBranchMap.set(branch.id, branch);
    for (const known of confirmedBranchesRef.current.values()) {
      if (known.clientId !== currentClient.id) continue;
      const current = contactBranchMap.get(known.id);
      if (!current || known.version > current.version) contactBranchMap.set(known.id, known);
    }
  }
  const contactBranches = [...contactBranchMap.values()];

  return { query, capabilities, list, detail, branches, contacts, contactBranches, create, edit, lifecycle, branchForm, branchLifecycle, contactForm, contactLifecycle, branchClientActive,
    openCreate, closeForm: () => { closeForm(); closeClientForms(); closeBranchDialogs(); closeContactDialogs(); }, submitCreate, openEdit,
    changeClientEdit, submitClientEdit, openClientLifecycle, changeClientLifecycleReason, submitClientLifecycle,
    reviewClientConflict, adoptClientConflict, openBranchCreate, openBranchEdit, changeBranchForm, submitBranchForm,
    openBranchLifecycle, changeBranchLifecycleReason, submitBranchLifecycle, reviewBranchConflict, adoptBranchConflict,
    closeBranchDialogs, openContactCreate, openContactEdit, changeContactForm, submitContactForm, openContactLifecycle,
    changeContactLifecycleReason, submitContactLifecycle, closeContactDialogs,
    reviewContactConflict, adoptContactConflict,
    setClientFilters, setBranchFilters, setContactFilters, clearClientFilters, selectClient, closeDetail, setTab,
    refreshList, refreshDetail, refreshBranches, refreshContacts, refresh };
}
