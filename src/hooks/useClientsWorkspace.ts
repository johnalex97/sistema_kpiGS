import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientsApi } from "../api/clients";
import { ApiClientError, type ApiFieldError } from "../api/http";
import type { ClientDetail, ClientListFilters, ClientPage, ClientTab, CreateClientInput, UpdateClientInput } from "../models/client";
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
  create?: { open: boolean; pending: boolean; error: string | null; fieldErrors: ApiFieldError[] };
  edit?: ClientEditState;
  lifecycle?: ClientLifecycleState;
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
  setClientFilters(patch: Partial<ClientListFilters>): void;
  clearClientFilters(): void;
  selectClient(id: string): void;
  closeDetail(): void;
  setTab(tab: ClientTab): void;
  refreshList(): Promise<void>;
  refreshDetail(): Promise<void>;
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
  const [create, setCreate] = useState<NonNullable<ClientsWorkspace["create"]>>({ open: false, pending: false, error: null, fieldErrors: [] });
  const [edit, setEdit] = useState<ClientEditState>(emptyEdit);
  const [lifecycle, setLifecycle] = useState<ClientLifecycleState>(emptyLifecycle);
  const createPendingRef = useRef(false);
  const editPendingRef = useRef(false);
  const lifecyclePendingRef = useRef(false);
  const editRef = useRef(edit);
  const lifecycleRef = useRef(lifecycle);
  const detailRef = useRef(detail);
  editRef.current = edit;
  lifecycleRef.current = lifecycle;
  detailRef.current = detail;

  const updateEdit = useCallback((next: ClientEditState) => { editRef.current = next; setEdit(next); }, []);
  const updateLifecycle = useCallback((next: ClientLifecycleState) => { lifecycleRef.current = next; setLifecycle(next); }, []);

  const queryRef = useRef(query);
  const canViewRef = useRef(capabilities.canView);
  const canManageRef = useRef(capabilities.canManage);
  const externalSearchRef = useRef(search.trim());
  const mountedRef = useRef(true);
  const listControllerRef = useRef<AbortController | null>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const listDataKeyRef = useRef<string | null>(null);
  const confirmedClientsRef = useRef<Map<string, ClientDetail>>(new Map());
  const observedSummariesRef = useRef<Map<string, ClientPage["items"][number]>>(new Map());
  const mutationWatchedIdsRef = useRef<Set<string>>(new Set());
  const knownClientStatesRef = useRef<Map<string, { version: number; isActive: boolean }>>(new Map());
  const searchTimerRef = useRef<number | null>(null);
  const searchGenerationRef = useRef(0);

  const observeClientState = useCallback((client: { id: string; version: number; isActive: boolean }) => {
    const known = knownClientStatesRef.current.get(client.id);
    if (!known || client.version > known.version) knownClientStatesRef.current.set(client.id, { version: client.version, isActive: client.isActive });
  }, []);

  const withConfirmedDetail = useCallback((incoming: ClientDetail): ClientDetail => {
    observeClientState(incoming);
    const confirmed = confirmedClientsRef.current.get(incoming.id);
    if (confirmed && confirmed.version > incoming.version) return confirmed;
    if (!confirmed || incoming.version > confirmed.version) confirmedClientsRef.current.set(incoming.id, incoming);
    return incoming;
  }, [observeClientState]);

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
          data: current.key === key && current.state.data ? reconcileClient(current.state.data, authoritative) : authoritative,
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
  }, [api, invalidateDetail, withConfirmedDetail]);

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([refreshList(), refreshDetail()]);
  }, [refreshDetail, refreshList]);

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

  const clearClientFilters = useCallback(() => {
    updateEdit(emptyEdit());
    updateLifecycle(emptyLifecycle());
    searchGenerationRef.current += 1;
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    invalidateDetail();
    setDetailSnapshot({ key: null, state: idle<ClientDetail>() });
    const defaults = parseClientSearch("");
    commitQuery({ ...defaults, clients: defaults.clients }, "replace");
    void refreshList();
  }, [commitQuery, invalidateDetail, refreshList, updateEdit, updateLifecycle]);

  const selectClient = useCallback((id: string) => {
    if (!canViewRef.current || !id.trim()) return;
    const current = queryRef.current;
    if (current.clientId === id.trim()) {
      void refreshDetail();
      return;
    }
    updateEdit(emptyEdit());
    updateLifecycle(emptyLifecycle());
    const defaults = parseClientSearch("");
    commitQuery({ ...current, clientId: id.trim(), tab: "summary", branches: defaults.branches, contacts: defaults.contacts }, "push");
    void refreshDetail();
  }, [commitQuery, refreshDetail, updateEdit, updateLifecycle]);

  const closeDetail = useCallback(() => {
    const current = queryRef.current;
    if (!current.clientId) return;
    updateEdit(emptyEdit());
    updateLifecycle(emptyLifecycle());
    invalidateDetail();
    const defaults = parseClientSearch("");
    setDetailSnapshot({ key: null, state: idle<ClientDetail>() });
    commitQuery({ ...current, clientId: null, tab: "summary", branches: defaults.branches, contacts: defaults.contacts }, "push");
  }, [commitQuery, invalidateDetail, updateEdit, updateLifecycle]);

  const setTab = useCallback((tab: ClientTab) => {
    commitQuery({ ...queryRef.current, tab }, "replace");
  }, [commitQuery]);

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

  useEffect(() => {
    if (!capabilities.canManage || !capabilities.canView) {
      updateEdit(emptyEdit());
      updateLifecycle(emptyLifecycle());
    }
  }, [capabilities.canManage, capabilities.canView, updateEdit, updateLifecycle]);

  useEffect(() => {
    mountedRef.current = true;
    const normalizedUrl = urlWith(serializeClientSearch(window.location.search, queryRef.current));
    if (normalizedUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", normalizedUrl);
    }
    if (capabilities.canView) {
      void refreshList();
      if (queryRef.current.clientId) void refreshDetail();
    } else {
      invalidateList();
      invalidateDetail();
      setList(idle<ClientPage>());
      setDetailSnapshot({ key: null, state: idle<ClientDetail>() });
    }
  }, [capabilities.canView, invalidateDetail, invalidateList, refreshDetail, refreshList]);

  useEffect(() => {
    const handlePopState = () => {
      searchGenerationRef.current += 1;
      if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
      const restored = parseClientSearch(window.location.search);
      if (restored.clientId !== queryRef.current.clientId) {
        updateEdit(emptyEdit());
        updateLifecycle(emptyLifecycle());
      }
      queryRef.current = restored;
      setQuery(restored);
      void refreshList();
      void refreshDetail();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [refreshDetail, refreshList, updateEdit, updateLifecycle]);

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
  }, [invalidateDetail, invalidateList]);

  return { query, capabilities, list, detail, create, edit, lifecycle, openCreate, closeForm: () => { closeForm(); closeClientForms(); }, submitCreate, openEdit, changeClientEdit, submitClientEdit, openClientLifecycle, changeClientLifecycleReason, submitClientLifecycle, reviewClientConflict, adoptClientConflict, setClientFilters, clearClientFilters, selectClient, closeDetail, setTab, refreshList, refreshDetail, refresh };
}
