import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EvidenceApi } from "../api/evidences";
import { ApiClientError } from "../api/http";
import {
  recurrenceLookupPermissionPrerequisites,
  type RecurrenceLookupApi,
  type RecurrenceLookupOperation,
} from "../api/recurrence-lookups";
import type { RecurrenceApi } from "../api/recurrences";
import type {
  RecurrenceCatalog,
  RecurrenceDetail,
  RecurrenceListFilters,
  RecurrencePage,
  RecurrenceSummaryFilters,
  RecurrenceSummaryMetrics,
} from "../models/recurrence";
import {
  parseRecurrenceSearch,
  reconcileRecurrence,
  serializeRecurrenceSearch,
  type RecurrenceQueryState,
} from "./recurrence-workspace.helpers";

export type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

export interface RecurrenceMutationState {
  name: "report" | "evidence" | "analyze" | "correct" | "visit" | "note" | "dismiss" | "close" | "adjust";
  pending: boolean;
  error: string | null;
  conflict: boolean;
}

export type RecurrenceActionMode = RecurrenceMutationState["name"];

export interface RecurrenceCapabilities {
  canReport: boolean;
  canReview: boolean;
  canViewAll: boolean;
  canUploadEvidence: boolean;
  canViewEvidence: boolean;
  canManageEvidence: boolean;
  lookupCapabilities: Record<RecurrenceLookupOperation, boolean>;
}

export interface RecurrencesWorkspace {
  query: RecurrenceQueryState;
  catalog: RecurrenceCatalog | null;
  page: RecurrencePage | null;
  summary: RecurrenceSummaryMetrics | null;
  selected: RecurrenceDetail | null;
  catalogState: LoadState;
  listState: LoadState;
  summaryState: LoadState;
  detailState: LoadState;
  listStale: boolean;
  mutation: RecurrenceMutationState | null;
  capabilities: RecurrenceCapabilities;
  actionMode: RecurrenceActionMode | null;
  lookupApi: RecurrenceLookupApi;
  evidenceApi: EvidenceApi;
  setFilters(patch: Partial<RecurrenceListFilters>): void;
  select(id: string): void;
  closeDetail(): void;
  retryCatalog(): void;
  retryList(): void;
  retrySummary(): void;
  retryDetail(): void;
  setActionMode(mode: RecurrenceActionMode | null): void;
  clearMutationError(): void;
}

export interface UseRecurrencesWorkspaceOptions {
  api: RecurrenceApi;
  evidenceApi: EvidenceApi;
  lookupApi: RecurrenceLookupApi;
  permissions: readonly string[];
  search: string;
  now?: () => Date;
}

export class RecurrencePermissionError extends Error {
  constructor() {
    super("No tienes permiso para realizar esta consulta.");
    this.name = "RecurrencePermissionError";
  }
}

const systemNow = () => new Date();

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function abortError(): DOMException {
  return new DOMException("La lectura fue cancelada.", "AbortError");
}

function summaryFilters(filters: RecurrenceListFilters): RecurrenceSummaryFilters {
  const summary: Partial<RecurrenceListFilters> = { ...filters };
  delete summary.page;
  delete summary.pageSize;
  return summary as RecurrenceSummaryFilters;
}

function permissionKey(permissions: readonly string[]): string {
  return [...new Set(permissions)].sort().join("\u0000");
}

function deriveCapabilities(permissions: readonly string[]): RecurrenceCapabilities {
  const granted = new Set(permissions);
  const has = (permission: string) => granted.has(permission);
  const canLookup = (operation: RecurrenceLookupOperation) =>
    recurrenceLookupPermissionPrerequisites[operation].some((permission) => has(permission));
  return {
    canReport: has("RECURRENCES_REPORT_OWN") || has("RECURRENCES_REVIEW"),
    canReview: has("RECURRENCES_REVIEW"),
    canViewAll: has("RECURRENCES_VIEW_ALL") || has("RECURRENCES_REVIEW"),
    canUploadEvidence: has("EVIDENCES_UPLOAD"),
    canViewEvidence: has("EVIDENCES_VIEW"),
    canManageEvidence: has("EVIDENCES_MANAGE"),
    lookupCapabilities: {
      orders: canLookup("orders"),
      technicians: canLookup("technicians"),
      clients: canLookup("clients"),
      branches: canLookup("branches"),
    },
  };
}

function actionAllowed(mode: RecurrenceActionMode, capabilities: RecurrenceCapabilities): boolean {
  if (mode === "report") return capabilities.canReport && capabilities.lookupCapabilities.orders;
  if (mode === "evidence") return capabilities.canUploadEvidence;
  return capabilities.canReview;
}

export function useRecurrencesWorkspace({
  api,
  evidenceApi: rawEvidenceApi,
  lookupApi: rawLookupApi,
  permissions,
  search,
  now,
}: UseRecurrencesWorkspaceOptions): RecurrencesWorkspace {
  const nowRef = useRef(now);
  const clock = useCallback(() => (nowRef.current ?? systemNow)(), []);
  const [query, setQuery] = useState<RecurrenceQueryState>(() => {
    const parsed = parseRecurrenceSearch(window.location.search, (now ?? systemNow)());
    const externalSearch = search.trim();
    return externalSearch
      ? { ...parsed, filters: { ...parsed.filters, search: externalSearch, page: 1 } }
      : parsed;
  });
  const [catalog, setCatalog] = useState<RecurrenceCatalog | null>(null);
  const [page, setPage] = useState<RecurrencePage | null>(null);
  const [summary, setSummary] = useState<RecurrenceSummaryMetrics | null>(null);
  const [selected, setSelected] = useState<RecurrenceDetail | null>(null);
  const [catalogState, setCatalogState] = useState<LoadState>("loading");
  const [listState, setListState] = useState<LoadState>("loading");
  const [summaryState, setSummaryState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [listStale, setListStale] = useState(false);
  const [mutation, setMutation] = useState<RecurrenceMutationState | null>(null);
  const [actionMode, setActionModeState] = useState<RecurrenceActionMode | null>(null);

  const permissionsKey = permissionKey(permissions);
  const summaryRequestKey = JSON.stringify(summaryFilters(query.filters));
  const capabilities = useMemo(() => deriveCapabilities(permissions), [permissions]);
  const capabilitiesRef = useRef(capabilities);

  const queryRef = useRef(query);
  const pageRef = useRef(page);
  const selectedRef = useRef(selected);
  const selectedIdRef = useRef<string | null>(null);
  const externalSearchRef = useRef(search.trim());
  const catalogControllerRef = useRef<AbortController | null>(null);
  const listControllerRef = useRef<AbortController | null>(null);
  const summaryControllerRef = useRef<AbortController | null>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const catalogGenerationRef = useRef(0);
  const listGenerationRef = useRef(0);
  const summaryGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const auxiliaryGenerationRef = useRef(0);
  const auxiliaryControllersRef = useRef(new Map<string, AbortController>());
  const previousPermissionsKeyRef = useRef(permissionsKey);

  const loadCatalog = useCallback(async (): Promise<void> => {
    catalogControllerRef.current?.abort();
    const controller = new AbortController();
    catalogControllerRef.current = controller;
    const generation = ++catalogGenerationRef.current;
    try {
      const incoming = await api.catalog(controller.signal);
      if (controller.signal.aborted || generation !== catalogGenerationRef.current) return;
      setCatalog(incoming);
      setCatalogState(incoming.causes.length ? "ready" : "empty");
    } catch (error: unknown) {
      if (controller.signal.aborted || generation !== catalogGenerationRef.current || isAbortError(error)) return;
      setCatalogState("error");
    }
  }, [api]);

  const loadList = useCallback(async (
    requestedQuery: RecurrenceQueryState,
    requestedFilters: RecurrenceListFilters,
  ): Promise<void> => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    const generation = ++listGenerationRef.current;
    try {
      const incoming = await api.list(requestedFilters, controller.signal);
      if (controller.signal.aborted || generation !== listGenerationRef.current || queryRef.current !== requestedQuery) return;
      const lastPage = Math.max(1, incoming.pagination.totalPages);
      if (requestedFilters.page > lastPage) {
        setQuery((current) => current === requestedQuery
          ? { ...current, filters: { ...current.filters, page: lastPage } }
          : current);
        return;
      }
      pageRef.current = incoming;
      setPage(incoming);
      setListState(incoming.items.length ? "ready" : "empty");
      setListStale(false);
    } catch (error: unknown) {
      if (controller.signal.aborted || generation !== listGenerationRef.current || isAbortError(error)) return;
      const currentPage = pageRef.current;
      if (currentPage) {
        setListState(currentPage.items.length ? "ready" : "empty");
        setListStale(true);
      } else {
        setListState("error");
        setListStale(false);
      }
    }
  }, [api]);

  const loadSummary = useCallback(async (requestedFilters: RecurrenceSummaryFilters): Promise<void> => {
    summaryControllerRef.current?.abort();
    const controller = new AbortController();
    summaryControllerRef.current = controller;
    const generation = ++summaryGenerationRef.current;
    try {
      const incoming = await api.summary(requestedFilters, controller.signal);
      if (controller.signal.aborted || generation !== summaryGenerationRef.current) return;
      setSummary(incoming);
      setSummaryState("ready");
    } catch (error: unknown) {
      if (controller.signal.aborted || generation !== summaryGenerationRef.current || isAbortError(error)) return;
      setSummaryState("error");
    }
  }, [api]);

  const removeSelection = useCallback(() => {
    selectedIdRef.current = null;
    detailGenerationRef.current += 1;
    detailControllerRef.current?.abort();
    selectedRef.current = null;
    setSelected(null);
    setDetailState("idle");
    setActionModeState(null);
    setQuery((current) => current.selectedId === null ? current : { ...current, selectedId: null });
  }, []);

  const loadDetail = useCallback(async (id: string, silent = false): Promise<void> => {
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const generation = ++detailGenerationRef.current;
    try {
      const incoming = await api.detail(id, controller.signal);
      if (controller.signal.aborted || generation !== detailGenerationRef.current || selectedIdRef.current !== id) return;
      const next = reconcileRecurrence(selectedRef.current, incoming);
      selectedRef.current = next;
      setSelected(next);
      setDetailState("ready");
    } catch (error: unknown) {
      if (controller.signal.aborted || generation !== detailGenerationRef.current || selectedIdRef.current !== id || isAbortError(error)) return;
      if (error instanceof ApiClientError && error.status === 404) {
        removeSelection();
        return;
      }
      if (!silent || !selectedRef.current) setDetailState("error");
    }
  }, [api, removeSelection]);

  const runAuxiliary = useCallback(async <T,>(
    key: string,
    allowed: () => boolean,
    externalSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    if (!allowed()) throw new RecurrencePermissionError();
    auxiliaryControllersRef.current.get(key)?.abort();
    const controller = new AbortController();
    auxiliaryControllersRef.current.set(key, controller);
    const generation = auxiliaryGenerationRef.current;
    const abortFromCaller = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted || generation !== auxiliaryGenerationRef.current || !allowed()) throw abortError();
      return result;
    } finally {
      externalSignal?.removeEventListener("abort", abortFromCaller);
      if (auxiliaryControllersRef.current.get(key) === controller) auxiliaryControllersRef.current.delete(key);
    }
  }, []);

  const lookupApi = useMemo<RecurrenceLookupApi>(() => ({
    orders: (lookupSearch, statuses, lookupPage, signal) => runAuxiliary(
      "lookup:orders",
      () => capabilitiesRef.current.lookupCapabilities.orders,
      signal,
      (controlledSignal) => rawLookupApi.orders(lookupSearch, statuses, lookupPage, controlledSignal),
    ),
    technicians: (lookupSearch, lookupPage, signal) => runAuxiliary(
      "lookup:technicians",
      () => capabilitiesRef.current.lookupCapabilities.technicians,
      signal,
      (controlledSignal) => rawLookupApi.technicians(lookupSearch, lookupPage, controlledSignal),
    ),
    clients: (lookupSearch, lookupPage, signal) => runAuxiliary(
      "lookup:clients",
      () => capabilitiesRef.current.lookupCapabilities.clients,
      signal,
      (controlledSignal) => rawLookupApi.clients(lookupSearch, lookupPage, controlledSignal),
    ),
    branches: (clientId, lookupSearch, lookupPage, signal) => runAuxiliary(
      "lookup:branches",
      () => capabilitiesRef.current.lookupCapabilities.branches,
      signal,
      (controlledSignal) => rawLookupApi.branches(clientId, lookupSearch, lookupPage, controlledSignal),
    ),
  }), [rawLookupApi, runAuxiliary]);

  const evidenceApi = useMemo<EvidenceApi>(() => ({
    listRecurrence: (recurrenceId, evidencePage, signal) => runAuxiliary(
      "evidence:list",
      () => capabilitiesRef.current.canViewEvidence,
      signal,
      (controlledSignal) => rawEvidenceApi.listRecurrence(recurrenceId, evidencePage, controlledSignal),
    ),
    uploadRecurrence: (recurrenceId, input) => capabilitiesRef.current.canUploadEvidence
      ? rawEvidenceApi.uploadRecurrence(recurrenceId, input)
      : Promise.reject(new RecurrencePermissionError()),
    download: (id, signal) => runAuxiliary(
      "evidence:download",
      () => capabilitiesRef.current.canViewEvidence,
      signal,
      (controlledSignal) => rawEvidenceApi.download(id, controlledSignal),
    ),
    archive: (id, input) => capabilitiesRef.current.canManageEvidence
      ? rawEvidenceApi.archive(id, input)
      : Promise.reject(new RecurrencePermissionError()),
  }), [rawEvidenceApi, runAuxiliary]);

  useEffect(() => { queryRef.current = query; }, [query]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { nowRef.current = now; }, [now]);
  useEffect(() => { capabilitiesRef.current = capabilities; }, [capabilities]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => active ? loadCatalog() : undefined);
    return () => { active = false; };
  }, [loadCatalog]);

  useEffect(() => {
    let active = true;
    const snapshot = Object.freeze({ ...query.filters });
    void Promise.resolve().then(() => active ? loadList(query, snapshot) : undefined);
    return () => { active = false; };
  }, [loadList, query]);

  useEffect(() => {
    let active = true;
    const snapshot = Object.freeze(JSON.parse(summaryRequestKey) as RecurrenceSummaryFilters);
    void Promise.resolve().then(() => active ? loadSummary(snapshot) : undefined);
    return () => { active = false; };
  }, [loadSummary, summaryRequestKey]);

  useEffect(() => {
    const selectedId = query.selectedId;
    if (selectedIdRef.current === selectedId) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || queryRef.current.selectedId !== selectedId || selectedIdRef.current === selectedId) return;
      selectedIdRef.current = selectedId;
      detailGenerationRef.current += 1;
      detailControllerRef.current?.abort();
      selectedRef.current = null;
      setSelected(null);
      setActionModeState(null);
      if (!selectedId) {
        setDetailState("idle");
        return;
      }
      setDetailState("loading");
      void loadDetail(selectedId);
    });
    return () => { active = false; };
  }, [loadDetail, query.selectedId]);

  useEffect(() => {
    const serialized = serializeRecurrenceSearch(window.location.search, query, clock());
    const nextSearch = serialized.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl);
  }, [clock, query]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === externalSearchRef.current) return;
    externalSearchRef.current = normalized;
    const timer = window.setTimeout(() => {
      setListState("loading");
      setListStale(false);
      setSummaryState("loading");
      setQuery((current) => ({
        ...current,
        filters: { ...current.filters, search: normalized || undefined, page: 1 },
      }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const handlePopState = () => {
      setListState("loading");
      setListStale(false);
      setSummaryState("loading");
      setQuery(parseRecurrenceSearch(window.location.search, clock()));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [clock]);

  useEffect(() => {
    if (previousPermissionsKeyRef.current === permissionsKey) return;
    previousPermissionsKeyRef.current = permissionsKey;
    auxiliaryGenerationRef.current += 1;
    auxiliaryControllersRef.current.forEach((controller) => controller.abort());
    auxiliaryControllersRef.current.clear();
    setActionModeState((current) => current && !actionAllowed(current, capabilities) ? null : current);
  }, [capabilities, permissionsKey]);

  useEffect(() => () => {
    catalogGenerationRef.current += 1;
    listGenerationRef.current += 1;
    summaryGenerationRef.current += 1;
    detailGenerationRef.current += 1;
    auxiliaryGenerationRef.current += 1;
    catalogControllerRef.current?.abort();
    listControllerRef.current?.abort();
    summaryControllerRef.current?.abort();
    detailControllerRef.current?.abort();
    auxiliaryControllersRef.current.forEach((controller) => controller.abort());
    auxiliaryControllersRef.current.clear();
  }, []);

  const setFilters = useCallback((patch: Partial<RecurrenceListFilters>) => {
    setListState("loading");
    setListStale(false);
    setSummaryState("loading");
    setQuery((current) => ({
      ...current,
      filters: { ...current.filters, ...patch, page: patch.page ?? 1 },
    }));
  }, []);

  const select = useCallback((id: string) => {
    selectedIdRef.current = id;
    selectedRef.current = null;
    setSelected(null);
    setActionModeState(null);
    setDetailState("loading");
    setQuery((current) => current.selectedId === id ? current : { ...current, selectedId: id });
    void loadDetail(id);
  }, [loadDetail]);

  const closeDetail = useCallback(() => removeSelection(), [removeSelection]);

  const retryCatalog = useCallback(() => {
    setCatalogState("loading");
    void loadCatalog();
  }, [loadCatalog]);

  const retryList = useCallback(() => {
    const requestedQuery = queryRef.current;
    setListState("loading");
    setListStale(false);
    void loadList(requestedQuery, Object.freeze({ ...requestedQuery.filters }));
  }, [loadList]);

  const retrySummary = useCallback(() => {
    const requestedQuery = queryRef.current;
    setSummaryState("loading");
    void loadSummary(Object.freeze(summaryFilters(requestedQuery.filters)));
  }, [loadSummary]);

  const retryDetail = useCallback(() => {
    const id = selectedIdRef.current;
    if (id) {
      setDetailState("loading");
      void loadDetail(id);
    }
  }, [loadDetail]);

  const setActionMode = useCallback((mode: RecurrenceActionMode | null) => {
    setActionModeState(mode && actionAllowed(mode, capabilitiesRef.current) ? mode : null);
  }, []);

  const clearMutationError = useCallback(() => setMutation(null), []);

  return {
    query,
    catalog,
    page,
    summary,
    selected,
    catalogState,
    listState,
    summaryState,
    detailState,
    listStale,
    mutation,
    capabilities,
    actionMode,
    lookupApi,
    evidenceApi,
    setFilters,
    select,
    closeDetail,
    retryCatalog,
    retryList,
    retrySummary,
    retryDetail,
    setActionMode,
    clearMutationError,
  };
}
