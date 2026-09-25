import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientsApi } from "../api/clients";
import type { ClientDetail, ClientListFilters, ClientPage, ClientTab } from "../models/client";
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
  setClientFilters(patch: Partial<ClientListFilters>): void;
  selectClient(id: string): void;
  closeDetail(): void;
  setTab(tab: ClientTab): void;
  refreshList(): Promise<void>;
  refreshDetail(): Promise<void>;
  refresh(): Promise<void>;
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function urlWith(search: URLSearchParams): string {
  const query = search.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

export function useClientsWorkspace({ api, permissions, search }: UseClientsWorkspaceOptions): ClientsWorkspace {
  const capabilities = deriveClientCapabilities(permissions);
  const [query, setQuery] = useState<ClientQueryState>(() => {
    const parsed = parseClientSearch(window.location.search);
    const externalSearch = search.trim();
    return externalSearch ? { ...parsed, clients: { ...parsed.clients, search: externalSearch, page: 1 } } : parsed;
  });
  const [list, setList] = useState<AsyncState<ClientPage>>(() => capabilities.canView
    ? { ...idle<ClientPage>(), status: "loading" }
    : idle<ClientPage>());
  const [detail, setDetail] = useState<AsyncState<ClientDetail>>(() => capabilities.canView && query.clientId
    ? { ...idle<ClientDetail>(), status: "loading" }
    : idle<ClientDetail>());

  const queryRef = useRef(query);
  const canViewRef = useRef(capabilities.canView);
  const externalSearchRef = useRef(search.trim());
  const mountedRef = useRef(true);
  const listControllerRef = useRef<AbortController | null>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const listDataKeyRef = useRef<string | null>(null);
  const detailDataKeyRef = useRef<string | null>(null);

  canViewRef.current = capabilities.canView;

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
          ? { ...incoming, items: incoming.items.map((item) => {
            const previous = current.data?.items.find((candidate) => candidate.id === item.id);
            return previous ? reconcileClient(previous, item) : item;
          }) }
          : incoming,
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
  }, [api, invalidateList]);

  const refreshDetail = useCallback(async (): Promise<void> => {
    invalidateDetail();
    const { clientId, clients } = queryRef.current;
    if (!mountedRef.current || !canViewRef.current || !clientId) {
      if (mountedRef.current) setDetail(idle<ClientDetail>());
      return;
    }
    const key = `${clientId}\u0000${clients.includeInactive}`;
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const generation = detailGenerationRef.current;
    setDetail((current) => ({
      status: "loading", data: detailDataKeyRef.current === key ? current.data : null, error: null, stale: false,
    }));
    try {
      const incoming = await api.getClient(clientId, clients.includeInactive, controller.signal);
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted
        || generation !== detailGenerationRef.current || queryRef.current.clientId !== clientId
        || queryRef.current.clients.includeInactive !== clients.includeInactive) return;
      setDetail((current) => ({
        status: "success",
        data: current.data && detailDataKeyRef.current === key ? reconcileClient(current.data, incoming) : incoming,
        error: null,
        stale: false,
      }));
      detailDataKeyRef.current = key;
    } catch (error: unknown) {
      if (!mountedRef.current || !canViewRef.current || controller.signal.aborted
        || generation !== detailGenerationRef.current || isAbortError(error)
        || queryRef.current.clientId !== clientId || queryRef.current.clients.includeInactive !== clients.includeInactive) return;
      setDetail((current) => ({
        status: "error", data: current.data, error: errorMessage(error, "No fue posible cargar el cliente"),
        stale: current.data !== null,
      }));
    } finally {
      if (detailControllerRef.current === controller) detailControllerRef.current = null;
    }
  }, [api, invalidateDetail]);

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
    const next: ClientQueryState = {
      ...current,
      clients: { ...current.clients, ...patch, page: patch.page ?? 1 },
    };
    const includeInactiveChanged = next.clients.includeInactive !== current.clients.includeInactive;
    commitQuery(next, "replace");
    void refreshList();
    if (includeInactiveChanged && next.clientId) void refreshDetail();
  }, [commitQuery, refreshDetail, refreshList]);

  const selectClient = useCallback((id: string) => {
    if (!canViewRef.current || !id.trim()) return;
    const current = queryRef.current;
    if (current.clientId === id.trim()) {
      void refreshDetail();
      return;
    }
    const defaults = parseClientSearch("");
    commitQuery({ ...current, clientId: id.trim(), tab: "summary", branches: defaults.branches, contacts: defaults.contacts }, "push");
    void refreshDetail();
  }, [commitQuery, refreshDetail]);

  const closeDetail = useCallback(() => {
    const current = queryRef.current;
    if (!current.clientId) return;
    invalidateDetail();
    const defaults = parseClientSearch("");
    detailDataKeyRef.current = null;
    setDetail(idle<ClientDetail>());
    commitQuery({ ...current, clientId: null, tab: "summary", branches: defaults.branches, contacts: defaults.contacts }, "push");
  }, [commitQuery, invalidateDetail]);

  const setTab = useCallback((tab: ClientTab) => {
    commitQuery({ ...queryRef.current, tab }, "replace");
  }, [commitQuery]);

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
      setDetail(idle<ClientDetail>());
    }
  }, [capabilities.canView, invalidateDetail, invalidateList, refreshDetail, refreshList]);

  useEffect(() => {
    const handlePopState = () => {
      const restored = parseClientSearch(window.location.search);
      queryRef.current = restored;
      setQuery(restored);
      void refreshList();
      void refreshDetail();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [refreshDetail, refreshList]);

  useEffect(() => {
    const normalized = search.trim();
    if (externalSearchRef.current === normalized) return;
    externalSearchRef.current = normalized;
    const timer = window.setTimeout(() => {
      const current = queryRef.current;
      commitQuery({
        ...current,
        clients: { ...current.clients, search: normalized || undefined, page: 1 },
      }, "replace");
      void refreshList();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [commitQuery, refreshList, search]);

  useEffect(() => () => {
    mountedRef.current = false;
    invalidateList();
    invalidateDetail();
  }, [invalidateDetail, invalidateList]);

  return { query, capabilities, list, detail, setClientFilters, selectClient, closeDetail, setTab, refreshList, refreshDetail, refresh };
}
