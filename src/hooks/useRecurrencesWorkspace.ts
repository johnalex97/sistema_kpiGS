import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EvidenceApi } from "../api/evidences";
import { ApiClientError } from "../api/http";
import {
  recurrenceLookupPermissionPrerequisites,
  type RecurrenceLookupApi,
  type RecurrenceLookupOperation,
} from "../api/recurrence-lookups";
import type { RecurrenceApi } from "../api/recurrences";
import type { Evidence, EvidenceUploadInput } from "../models/evidence";
import type {
  AddRecurrenceNoteInput,
  AddRecurrenceVisitInput,
  AnalyzeRecurrenceInput,
  CorrectRecurrenceInput,
  RecurrenceCatalog,
  RecurrenceDetail,
  RecurrenceListFilters,
  RecurrencePage,
  RecurrenceSummaryFilters,
  RecurrenceSummaryMetrics,
  ReportRecurrenceInput,
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
  canAddNote: boolean;
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
  evidencePromptForId: string | null;
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
  reportRecurrence(input: ReportRecurrenceInput): Promise<boolean>;
  analyzeRecurrence(input: Omit<AnalyzeRecurrenceInput, "version">): Promise<boolean>;
  correctRecurrence(input: Omit<CorrectRecurrenceInput, "version">): Promise<boolean>;
  addVisit(input: Omit<AddRecurrenceVisitInput, "version">): Promise<boolean>;
  addNote(input: AddRecurrenceNoteInput): Promise<boolean>;
  uploadEvidence(input: EvidenceUploadInput): Promise<boolean>;
  downloadEvidence(evidence: Evidence): Promise<boolean>;
  archiveEvidence(evidence: Evidence, reason: string): Promise<boolean>;
  clearEvidencePrompt(): void;
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

interface AuxiliaryRequest {
  controller: AbortController;
  cleanup(): void;
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

function summaryKey(filters: RecurrenceListFilters): string {
  return JSON.stringify(summaryFilters(filters));
}

function listKey(filters: RecurrenceListFilters): string {
  return JSON.stringify(filters);
}

function frozenArray<T>(values: T[] | undefined): T[] | undefined {
  return values ? Object.freeze([...values]) as T[] : undefined;
}

function createSummarySnapshot(filters: RecurrenceSummaryFilters): RecurrenceSummaryFilters {
  const snapshot: RecurrenceSummaryFilters = { ...filters };
  if (filters.status) snapshot.status = frozenArray(filters.status);
  if (filters.impact) snapshot.impact = frozenArray(filters.impact);
  if (filters.responsibility) snapshot.responsibility = frozenArray(filters.responsibility);
  return Object.freeze(snapshot);
}

function createListSnapshot(
  filters: RecurrenceListFilters,
  summary: RecurrenceSummaryFilters,
): RecurrenceListFilters {
  return Object.freeze({ ...summary, page: filters.page, pageSize: filters.pageSize });
}

function isolateFilterArrays(filters: RecurrenceListFilters): RecurrenceListFilters {
  const isolated = { ...filters };
  if (filters.status) isolated.status = frozenArray(filters.status);
  if (filters.impact) isolated.impact = frozenArray(filters.impact);
  if (filters.responsibility) isolated.responsibility = frozenArray(filters.responsibility);
  return isolated;
}

function deriveCapabilities(permissions: readonly string[]): RecurrenceCapabilities {
  const granted = new Set(permissions);
  const has = (permission: string) => granted.has(permission);
  const canLookup = (operation: RecurrenceLookupOperation) =>
    recurrenceLookupPermissionPrerequisites[operation].some((permission) => has(permission));
  return {
    canReport: has("RECURRENCES_REPORT_OWN") || has("RECURRENCES_REVIEW"),
    canReview: has("RECURRENCES_REVIEW"),
    canAddNote: has("RECURRENCES_VIEW_OWN") || has("RECURRENCES_REVIEW"),
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
  if (mode === "note") return capabilities.canAddNote;
  if (mode === "visit") return capabilities.canReview && capabilities.lookupCapabilities.orders;
  return capabilities.canReview;
}

function statusAllowsAction(mode: RecurrenceActionMode, status: RecurrenceDetail["status"]): boolean {
  if (mode === "analyze") return status === "OPEN";
  if (mode === "correct") return status === "ANALYSIS" || status === "CORRECTION";
  if (mode === "visit" || mode === "note") return status === "OPEN" || status === "ANALYSIS" || status === "CORRECTION";
  return true;
}

function reportMutationError(error: unknown): { message: string; conflict: boolean } {
  if (!(error instanceof ApiClientError)) return { message: "No fue posible reportar la reincidencia.", conflict: false };
  const messages: Record<string, string> = {
    RECURRENCE_DUPLICATE: "Ya existe una reincidencia para estas órdenes.",
    RECURRENCE_ORDER_MISMATCH: "Las órdenes no corresponden al mismo cliente y sucursal.",
    ORDER_NOT_FOUND: "Una de las órdenes ya no está disponible.",
  };
  if (error.status === 403) return { message: "No tienes permiso para reportar reincidencias.", conflict: false };
  return { message: messages[error.code] ?? "No fue posible reportar la reincidencia.", conflict: error.status === 409 };
}

function analysisMutationError(error: unknown): { message: string; conflict: boolean } {
  if (!(error instanceof ApiClientError)) return { message: "No fue posible guardar el análisis.", conflict: false };
  if (error.status === 403) return { message: "No tienes permiso para analizar reincidencias.", conflict: false };
  const messages: Record<string, string> = {
    VERSION_CONFLICT: "El caso cambió en el servidor. Revisa la versión actual antes de guardar de nuevo.",
    RECURRENCE_CAUSE_NOT_FOUND: "La causa seleccionada ya no está disponible. Actualiza el catálogo y elige otra.",
    RECURRENCE_QUALITY_INVALID: "Revisa las decisiones de calidad de todos los técnicos originales.",
    RECURRENCE_DOCUMENTATION_INCOMPLETE: "Completa la documentación requerida del análisis, costo o antigüedad.",
    INVALID_RECURRENCE_TRANSITION: "El caso ya no está abierto para análisis.",
    RECURRENCE_NOT_FOUND: "El caso ya no está disponible.",
  };
  return {
    message: messages[error.code] ?? "No fue posible guardar el análisis.",
    conflict: error.status === 409 && error.code === "VERSION_CONFLICT",
  };
}

function workflowMutationError(
  mode: "correct" | "visit" | "note",
  error: unknown,
): { message: string; conflict: boolean } {
  const fallback = mode === "correct"
    ? "No fue posible guardar la corrección."
    : mode === "visit" ? "No fue posible agregar la visita." : "No fue posible agregar la nota.";
  if (!(error instanceof ApiClientError)) return { message: fallback, conflict: false };
  if (error.status === 403) return { message: "Ya no tienes permiso para realizar esta acción.", conflict: false };
  const messages: Record<string, string> = {
    VERSION_CONFLICT: "El caso cambió en el servidor. Revisa la versión actual antes de guardar de nuevo.",
    RECURRENCE_DOCUMENTATION_INCOMPLETE: "Completa la documentación requerida antes de guardar.",
    INVALID_RECURRENCE_TRANSITION: "El estado actual del caso ya no permite esta acción.",
    RECURRENCE_NOT_FOUND: "El caso ya no está disponible.",
    RECURRENCE_DUPLICATE: "La orden seleccionada ya está registrada en este caso.",
    ORDER_NOT_FOUND: "La orden seleccionada ya no está disponible.",
    RECURRENCE_ORDER_MISMATCH: "La orden debe pertenecer a la misma sucursal y no estar cancelada.",
  };
  return {
    message: messages[error.code] ?? fallback,
    conflict: error.status === 409 && error.code === "VERSION_CONFLICT",
  };
}

function evidenceMutationError(error: unknown, action: "upload" | "download" | "archive"): { message: string; conflict: boolean } {
  const fallback = action === "upload"
    ? "No fue posible subir la evidencia."
    : action === "download" ? "No fue posible descargar la evidencia." : "No fue posible archivar la evidencia.";
  if (!(error instanceof ApiClientError)) return { message: fallback, conflict: false };
  if (error.status === 403) return { message: "No tienes permiso para realizar esta acción con evidencia.", conflict: false };
  if (error.code === "VERSION_CONFLICT") return { message: "La evidencia cambió en el servidor. Actualiza el caso antes de continuar.", conflict: true };
  if (error.code === "EVIDENCE_NOT_FOUND") return { message: "La evidencia ya no está disponible.", conflict: false };
  if (error.code === "EVIDENCE_TOO_LARGE") return { message: "El archivo no puede superar 10 MiB.", conflict: false };
  if (error.code === "INVALID_EVIDENCE_FILE") return { message: "El archivo debe ser JPEG, PNG, WebP o PDF.", conflict: false };
  return { message: fallback, conflict: error.status === 409 };
}

function safeDownloadFilename(value: string): string {
  const cleaned = Array.from(value).filter((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
  }).join("");
  const segments = cleaned.trim().split(/[\\/]/);
  const candidate = segments[segments.length - 1]?.trim();
  return candidate && candidate !== "." && candidate !== ".." ? candidate : "evidencia";
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
      ? { ...parsed, filters: isolateFilterArrays({ ...parsed.filters, search: externalSearch, page: 1 }) }
      : { ...parsed, filters: isolateFilterArrays(parsed.filters) };
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
  const [evidencePrompt, setEvidencePrompt] = useState<{ id: string; permissionsKey: string } | null>(null);
  const [actionMode, setActionModeState] = useState<RecurrenceActionMode | null>(null);

  const permissionsKey = permissionKey(permissions);
  const listRequestKey = listKey(query.filters);
  const summaryRequestKey = summaryKey(query.filters);
  const summarySnapshot = useMemo(
    () => createSummarySnapshot(JSON.parse(summaryRequestKey) as RecurrenceSummaryFilters),
    [summaryRequestKey],
  );
  const listSnapshot = useMemo(
    () => createListSnapshot(JSON.parse(listRequestKey) as RecurrenceListFilters, summarySnapshot),
    [listRequestKey, summarySnapshot],
  );
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
  const auxiliaryRequestsRef = useRef(new Map<string, AuxiliaryRequest>());
  const previousPermissionsKeyRef = useRef(permissionsKey);
  const mutationPendingRef = useRef(false);
  const workflowGenerationRef = useRef(0);
  const workflowPendingGenerationRef = useRef<number | null>(null);
  const actionModeRef = useRef<RecurrenceActionMode | null>(null);
  const evidencePromptRef = useRef<string | null>(null);
  const historyModeRef = useRef<"push" | "replace">("replace");
  const scheduleEvidencePromptClear = useCallback(() => {
    void Promise.resolve().then(() => setEvidencePrompt(null));
  }, []);
  const revokeEvidencePrompt = useCallback(() => {
    evidencePromptRef.current = null;
    scheduleEvidencePromptClear();
  }, [scheduleEvidencePromptClear]);

  const invalidateWorkflowOperation = useCallback(() => {
    workflowGenerationRef.current += 1;
    if (workflowPendingGenerationRef.current !== null) {
      workflowPendingGenerationRef.current = null;
      mutationPendingRef.current = false;
    }
    setMutation((current) => current && ["analyze", "correct", "visit", "note"].includes(current.name) ? null : current);
  }, []);

  const invalidateList = useCallback(() => {
    listGenerationRef.current += 1;
    listControllerRef.current?.abort();
    listControllerRef.current = null;
  }, []);

  const invalidateSummary = useCallback(() => {
    summaryGenerationRef.current += 1;
    summaryControllerRef.current?.abort();
    summaryControllerRef.current = null;
  }, []);

  const invalidateDetail = useCallback(() => {
    detailGenerationRef.current += 1;
    detailControllerRef.current?.abort();
    detailControllerRef.current = null;
  }, []);

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
    requestedKey: string,
    requestedFilters: RecurrenceListFilters,
  ): Promise<void> => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    const generation = ++listGenerationRef.current;
    try {
      const incoming = await api.list(requestedFilters, controller.signal);
      if (controller.signal.aborted || generation !== listGenerationRef.current || listKey(queryRef.current.filters) !== requestedKey) return;
      const lastPage = Math.max(1, incoming.pagination.totalPages);
      if (requestedFilters.page > lastPage) {
        invalidateList();
        setQuery((current) => {
          if (listKey(current.filters) !== requestedKey) return current;
          const next = { ...current, filters: { ...current.filters, page: lastPage } };
          queryRef.current = next;
          return next;
        });
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
  }, [api, invalidateList]);

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
    invalidateWorkflowOperation();
    selectedIdRef.current = null;
    invalidateDetail();
    selectedRef.current = null;
    setSelected(null);
    setDetailState("idle");
    actionModeRef.current = null;
    setActionModeState(null);
    const current = queryRef.current;
    const next = current.selectedId === null ? current : { ...current, selectedId: null };
    queryRef.current = next;
    setQuery(next);
  }, [invalidateWorkflowOperation, invalidateDetail]);

  const loadDetail = useCallback(async (
    id: string,
    silent = false,
    options?: { preserveAction?: RecurrenceActionMode; canPublish?: () => boolean },
  ): Promise<void> => {
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const generation = ++detailGenerationRef.current;
    try {
      const incoming = await api.detail(id, controller.signal);
      if (controller.signal.aborted || generation !== detailGenerationRef.current || selectedIdRef.current !== id || options?.canPublish?.() === false) return;
      const next = reconcileRecurrence(selectedRef.current, incoming);
      selectedRef.current = next;
      setSelected(next);
      setDetailState("ready");
      const activeAction = actionModeRef.current;
      if (activeAction && !statusAllowsAction(activeAction, next.status) && options?.preserveAction !== activeAction) {
        actionModeRef.current = null;
        setActionModeState(null);
        invalidateWorkflowOperation();
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || generation !== detailGenerationRef.current || selectedIdRef.current !== id || options?.canPublish?.() === false || isAbortError(error)) return;
      if (error instanceof ApiClientError && error.status === 404) {
        removeSelection();
        return;
      }
      if (!silent || !selectedRef.current) setDetailState("error");
    }
  }, [api, invalidateWorkflowOperation, removeSelection]);

  const runAuxiliary = useCallback(async <T,>(
    key: string,
    allowed: () => boolean,
    externalSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    if (!allowed()) throw new RecurrencePermissionError();
    if (externalSignal?.aborted) throw abortError();
    const previous = auxiliaryRequestsRef.current.get(key);
    previous?.cleanup();
    previous?.controller.abort();
    const controller = new AbortController();
    const generation = auxiliaryGenerationRef.current;
    let cleaned = false;
    function abortFromCaller() {
      cleanup();
      controller.abort();
    }
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      externalSignal?.removeEventListener("abort", abortFromCaller);
      if (auxiliaryRequestsRef.current.get(key) === request) auxiliaryRequestsRef.current.delete(key);
    }
    const request: AuxiliaryRequest = { controller, cleanup };
    auxiliaryRequestsRef.current.set(key, request);
    externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted || generation !== auxiliaryGenerationRef.current || !allowed()) throw abortError();
      return result;
    } finally {
      cleanup();
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
      && (input.accessLevel !== "INTERNAL" || capabilitiesRef.current.canManageEvidence)
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
  useEffect(() => { actionModeRef.current = actionMode; }, [actionMode]);
  useEffect(() => { nowRef.current = now; }, [now]);

  useLayoutEffect(() => {
    capabilitiesRef.current = capabilities;
    if (previousPermissionsKeyRef.current === permissionsKey) return;
    previousPermissionsKeyRef.current = permissionsKey;
    auxiliaryGenerationRef.current += 1;
    auxiliaryRequestsRef.current.forEach((request) => {
      request.cleanup();
      request.controller.abort();
    });
    auxiliaryRequestsRef.current.clear();
    const currentAction = actionModeRef.current;
    const nextAction = currentAction && !actionAllowed(currentAction, capabilities) ? null : currentAction;
    if (currentAction && ["analyze", "correct", "visit", "note"].includes(currentAction) && nextAction !== currentAction) invalidateWorkflowOperation();
    actionModeRef.current = nextAction;
    setActionModeState(nextAction);
    if (!capabilities.canUploadEvidence) revokeEvidencePrompt();
  }, [capabilities, invalidateWorkflowOperation, permissionsKey, revokeEvidencePrompt]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => active ? loadCatalog() : undefined);
    return () => { active = false; };
  }, [loadCatalog]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => active ? loadList(listRequestKey, listSnapshot) : undefined);
    return () => { active = false; };
  }, [listRequestKey, listSnapshot, loadList]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => active ? loadSummary(summarySnapshot) : undefined);
    return () => { active = false; };
  }, [loadSummary, summarySnapshot]);

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
      invalidateWorkflowOperation();
      actionModeRef.current = null;
      setActionModeState(null);
      if (!selectedId) {
        setDetailState("idle");
        return;
      }
      setDetailState("loading");
      void loadDetail(selectedId);
    });
    return () => { active = false; };
  }, [invalidateWorkflowOperation, loadDetail, query.selectedId]);

  useEffect(() => {
    const serialized = serializeRecurrenceSearch(window.location.search, query, clock());
    const nextSearch = serialized.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      const method = historyModeRef.current === "push" ? "pushState" : "replaceState";
      window.history[method](window.history.state, "", nextUrl);
    }
    historyModeRef.current = "replace";
  }, [clock, query]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === externalSearchRef.current) return;
    externalSearchRef.current = normalized;
    const timer = window.setTimeout(() => {
      const current = queryRef.current;
      const next = {
        ...current,
        filters: { ...current.filters, search: normalized || undefined, page: 1 },
      };
      if (listKey(current.filters) !== listKey(next.filters)) {
        invalidateList();
        setListState("loading");
        setListStale(false);
      }
      if (summaryKey(current.filters) !== summaryKey(next.filters)) {
        invalidateSummary();
        setSummaryState("loading");
      }
      queryRef.current = next;
      setQuery(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [invalidateList, invalidateSummary, search]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseRecurrenceSearch(window.location.search, clock());
      const globalSearch = externalSearchRef.current;
      const next = globalSearch
        ? { ...parsed, filters: isolateFilterArrays({ ...parsed.filters, search: globalSearch, page: 1 }) }
        : { ...parsed, filters: isolateFilterArrays(parsed.filters) };
      const current = queryRef.current;
      if (listKey(current.filters) !== listKey(next.filters)) {
        invalidateList();
        setListState("loading");
        setListStale(false);
      }
      if (summaryKey(current.filters) !== summaryKey(next.filters)) {
        invalidateSummary();
        setSummaryState("loading");
      }
      if (current.selectedId !== next.selectedId) {
        invalidateDetail();
        invalidateWorkflowOperation();
        selectedIdRef.current = next.selectedId;
        selectedRef.current = null;
        setSelected(null);
        actionModeRef.current = null;
        setActionModeState(null);
        setDetailState(next.selectedId ? "loading" : "idle");
        if (next.selectedId) void loadDetail(next.selectedId);
      }
      queryRef.current = next;
      setQuery(next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [clock, invalidateWorkflowOperation, invalidateDetail, invalidateList, invalidateSummary, loadDetail]);

  useEffect(() => () => {
    catalogGenerationRef.current += 1;
    listGenerationRef.current += 1;
    summaryGenerationRef.current += 1;
    detailGenerationRef.current += 1;
    auxiliaryGenerationRef.current += 1;
    workflowGenerationRef.current += 1;
    workflowPendingGenerationRef.current = null;
    mutationPendingRef.current = false;
    catalogControllerRef.current?.abort();
    listControllerRef.current?.abort();
    summaryControllerRef.current?.abort();
    detailControllerRef.current?.abort();
    auxiliaryRequestsRef.current.forEach((request) => {
      request.cleanup();
      request.controller.abort();
    });
    auxiliaryRequestsRef.current.clear();
  }, []);

  const setFilters = useCallback((patch: Partial<RecurrenceListFilters>) => {
    const current = queryRef.current;
    const next = {
      ...current,
      filters: isolateFilterArrays({ ...current.filters, ...patch, page: patch.page ?? 1 }),
    };
    if (listKey(current.filters) !== listKey(next.filters)) {
      invalidateList();
      setListState("loading");
      setListStale(false);
    }
    if (summaryKey(current.filters) !== summaryKey(next.filters)) {
      invalidateSummary();
      setSummaryState("loading");
    }
    queryRef.current = next;
    historyModeRef.current = "push";
    setQuery(next);
  }, [invalidateList, invalidateSummary]);

  const select = useCallback((id: string) => {
    invalidateWorkflowOperation();
    selectedIdRef.current = id;
    selectedRef.current = null;
    setSelected(null);
    actionModeRef.current = null;
    setActionModeState(null);
    setDetailState("loading");
    const current = queryRef.current;
    const next = current.selectedId === id ? current : { ...current, selectedId: id };
    queryRef.current = next;
    historyModeRef.current = "push";
    setQuery(next);
    void loadDetail(id);
  }, [invalidateWorkflowOperation, loadDetail]);

  const closeDetail = useCallback(() => {
    historyModeRef.current = "push";
    removeSelection();
  }, [removeSelection]);

  const retryCatalog = useCallback(() => {
    setCatalogState("loading");
    void loadCatalog();
  }, [loadCatalog]);

  const retryList = useCallback(() => {
    const requestedQuery = queryRef.current;
    const requestedSummary = createSummarySnapshot(summaryFilters(requestedQuery.filters));
    const requestedList = createListSnapshot(requestedQuery.filters, requestedSummary);
    setListState("loading");
    setListStale(false);
    void loadList(listKey(requestedQuery.filters), requestedList);
  }, [loadList]);

  const retrySummary = useCallback(() => {
    const requestedQuery = queryRef.current;
    setSummaryState("loading");
    void loadSummary(createSummarySnapshot(summaryFilters(requestedQuery.filters)));
  }, [loadSummary]);

  const retryDetail = useCallback(() => {
    const id = selectedIdRef.current;
    if (id) {
      setDetailState("loading");
      void loadDetail(id);
    }
  }, [loadDetail]);

  const reportRecurrence = useCallback(async (input: ReportRecurrenceInput): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    if (!actionAllowed("report", capabilitiesRef.current)) {
      setMutation({ name: "report", pending: false, error: "No tienes permiso para reportar reincidencias.", conflict: false });
      return false;
    }
    mutationPendingRef.current = true;
    setMutation({ name: "report", pending: true, error: null, conflict: false });
    try {
      const incoming = await api.report(input);
      invalidateDetail();
      selectedIdRef.current = incoming.id;
      selectedRef.current = incoming;
      setSelected(incoming);
      setDetailState("ready");
      const current = queryRef.current;
      const next = { ...current, selectedId: incoming.id };
      queryRef.current = next;
      setQuery(next);
      actionModeRef.current = null;
      setActionModeState(null);
      const promptId = capabilitiesRef.current.canUploadEvidence ? incoming.id : null;
      evidencePromptRef.current = promptId;
      setEvidencePrompt(promptId ? { id: promptId, permissionsKey: previousPermissionsKeyRef.current } : null);
      setMutation({ name: "report", pending: false, error: null, conflict: false });

      const requestedSummary = createSummarySnapshot(summaryFilters(current.filters));
      const requestedList = createListSnapshot(current.filters, requestedSummary);
      setListState("loading");
      setListStale(false);
      setSummaryState("loading");
      void loadList(listKey(current.filters), requestedList);
      void loadSummary(requestedSummary);
      return true;
    } catch (error: unknown) {
      const failure = reportMutationError(error);
      setMutation({ name: "report", pending: false, error: failure.message, conflict: failure.conflict });
      return false;
    } finally {
      mutationPendingRef.current = false;
    }
  }, [api, invalidateDetail, loadList, loadSummary]);

  const analyzeRecurrence = useCallback(async (
    input: Omit<AnalyzeRecurrenceInput, "version">,
  ): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    const target = selectedRef.current;
    if (!capabilitiesRef.current.canReview) {
      setMutation({ name: "analyze", pending: false, error: "No tienes permiso para analizar reincidencias.", conflict: false });
      return false;
    }
    if (!target) {
      setMutation({ name: "analyze", pending: false, error: "Selecciona un caso antes de registrar el análisis.", conflict: false });
      return false;
    }
    if (target.status !== "OPEN") {
      setMutation((current) => current?.name === "analyze" && current.conflict
        ? current
        : { name: "analyze", pending: false, error: "El caso ya no está abierto para análisis.", conflict: false });
      return false;
    }

    const generation = ++workflowGenerationRef.current;
    const mutationIsCurrent = () => workflowGenerationRef.current === generation
      && workflowPendingGenerationRef.current === generation
      && capabilitiesRef.current.canReview
      && selectedIdRef.current === target.id
      && actionModeRef.current === "analyze";
    const refreshIsCurrent = () => workflowGenerationRef.current === generation
      && capabilitiesRef.current.canReview
      && selectedIdRef.current === target.id;
    mutationPendingRef.current = true;
    workflowPendingGenerationRef.current = generation;
    setMutation({ name: "analyze", pending: true, error: null, conflict: false });
    try {
      const incoming = await api.analyze(target.id, { ...input, version: target.version });
      if (!mutationIsCurrent()) return false;
      invalidateDetail();
      const next = reconcileRecurrence(selectedRef.current, incoming);
      selectedRef.current = next;
      setSelected(next);
      setDetailState("ready");
      actionModeRef.current = null;
      setActionModeState(null);
      setMutation({ name: "analyze", pending: false, error: null, conflict: false });

      const requestedQuery = queryRef.current;
      const requestedSummary = createSummarySnapshot(summaryFilters(requestedQuery.filters));
      const requestedList = createListSnapshot(requestedQuery.filters, requestedSummary);
      setListState("loading");
      setListStale(false);
      setSummaryState("loading");
      void loadList(listKey(requestedQuery.filters), requestedList);
      void loadSummary(requestedSummary);
      void loadDetail(target.id, true, { canPublish: refreshIsCurrent });
      return true;
    } catch (error: unknown) {
      if (!mutationIsCurrent()) return false;
      const failure = analysisMutationError(error);
      if (error instanceof ApiClientError && error.code === "RECURRENCE_NOT_FOUND") {
        removeSelection();
        return false;
      }
      if (error instanceof ApiClientError && error.code === "RECURRENCE_CAUSE_NOT_FOUND") {
        await loadCatalog();
        if (!mutationIsCurrent()) return false;
      }
      if (error instanceof ApiClientError && error.code === "INVALID_RECURRENCE_TRANSITION") {
        await loadDetail(target.id, true, { canPublish: mutationIsCurrent });
        if (!mutationIsCurrent()) return false;
      }
      if (failure.conflict) {
        await loadDetail(target.id, true, { preserveAction: "analyze", canPublish: mutationIsCurrent });
        if (!mutationIsCurrent()) return false;
      }
      setMutation({ name: "analyze", pending: false, error: failure.message, conflict: failure.conflict });
      return false;
    } finally {
      if (workflowPendingGenerationRef.current === generation) {
        workflowPendingGenerationRef.current = null;
        mutationPendingRef.current = false;
      }
    }
  }, [api, invalidateDetail, loadCatalog, loadDetail, loadList, loadSummary, removeSelection]);

  const runWorkflowMutation = useCallback(async <T,>(
    mode: "correct" | "visit" | "note",
    input: T,
    operation: (target: RecurrenceDetail, input: T) => Promise<RecurrenceDetail>,
  ): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    const target = selectedRef.current;
    if (!actionAllowed(mode, capabilitiesRef.current)) {
      setMutation({ name: mode, pending: false, error: "No tienes permiso para realizar esta acción.", conflict: false });
      return false;
    }
    if (!target) {
      setMutation({ name: mode, pending: false, error: "Selecciona un caso antes de continuar.", conflict: false });
      return false;
    }
    if (!statusAllowsAction(mode, target.status)) {
      setMutation((current) => current?.name === mode && current.conflict
        ? current
        : { name: mode, pending: false, error: "El estado actual del caso ya no permite esta acción.", conflict: false });
      return false;
    }

    const generation = ++workflowGenerationRef.current;
    const mutationIsCurrent = () => workflowGenerationRef.current === generation
      && workflowPendingGenerationRef.current === generation
      && actionAllowed(mode, capabilitiesRef.current)
      && selectedIdRef.current === target.id
      && actionModeRef.current === mode;
    const refreshIsCurrent = () => workflowGenerationRef.current === generation
      && actionAllowed(mode, capabilitiesRef.current)
      && selectedIdRef.current === target.id;
    mutationPendingRef.current = true;
    workflowPendingGenerationRef.current = generation;
    setMutation({ name: mode, pending: true, error: null, conflict: false });
    try {
      const incoming = await operation(target, input);
      if (!mutationIsCurrent()) return false;
      invalidateDetail();
      const next = reconcileRecurrence(selectedRef.current, incoming);
      selectedRef.current = next;
      setSelected(next);
      setDetailState("ready");
      actionModeRef.current = null;
      setActionModeState(null);
      setMutation({ name: mode, pending: false, error: null, conflict: false });

      const requestedQuery = queryRef.current;
      const requestedSummary = createSummarySnapshot(summaryFilters(requestedQuery.filters));
      const requestedList = createListSnapshot(requestedQuery.filters, requestedSummary);
      setListState("loading");
      setListStale(false);
      setSummaryState("loading");
      void loadList(listKey(requestedQuery.filters), requestedList);
      void loadSummary(requestedSummary);
      if (mode !== "note") void loadDetail(target.id, true, { canPublish: refreshIsCurrent });
      return true;
    } catch (error: unknown) {
      if (!mutationIsCurrent()) return false;
      const failure = workflowMutationError(mode, error);
      if (error instanceof ApiClientError && error.code === "RECURRENCE_NOT_FOUND") {
        removeSelection();
        return false;
      }
      if (error instanceof ApiClientError && error.status === 403) {
        actionModeRef.current = null;
        setActionModeState(null);
        invalidateWorkflowOperation();
        return false;
      }
      if (error instanceof ApiClientError && error.code === "INVALID_RECURRENCE_TRANSITION") {
        await loadDetail(target.id, true, { canPublish: mutationIsCurrent });
        if (!mutationIsCurrent()) return false;
      }
      if (failure.conflict || error instanceof ApiClientError && mode === "visit" && error.code === "RECURRENCE_DUPLICATE") {
        await loadDetail(target.id, true, { preserveAction: mode, canPublish: mutationIsCurrent });
        if (!mutationIsCurrent()) return false;
      }
      setMutation({ name: mode, pending: false, error: failure.message, conflict: failure.conflict });
      return false;
    } finally {
      if (workflowPendingGenerationRef.current === generation) {
        workflowPendingGenerationRef.current = null;
        mutationPendingRef.current = false;
      }
    }
  }, [invalidateDetail, invalidateWorkflowOperation, loadDetail, loadList, loadSummary, removeSelection]);

  const correctRecurrence = useCallback((input: Omit<CorrectRecurrenceInput, "version">) => runWorkflowMutation(
    "correct",
    input,
    (target, value) => api.correct(target.id, { ...value, version: target.version }),
  ), [api, runWorkflowMutation]);

  const addVisit = useCallback((input: Omit<AddRecurrenceVisitInput, "version">) => runWorkflowMutation(
    "visit",
    input,
    (target, value) => api.addVisit(target.id, { ...value, version: target.version }),
  ), [api, runWorkflowMutation]);

  const addNote = useCallback((input: AddRecurrenceNoteInput) => runWorkflowMutation(
    "note",
    input,
    (target, value) => api.addNote(target.id, value),
  ), [api, runWorkflowMutation]);

  const uploadEvidence = useCallback(async (input: EvidenceUploadInput): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    const targetId = evidencePromptRef.current ?? selectedIdRef.current;
    if (!capabilitiesRef.current.canUploadEvidence || !targetId) {
      setMutation({ name: "evidence", pending: false, error: "No tienes permiso para subir evidencia.", conflict: false });
      return false;
    }
    if (input.accessLevel === "INTERNAL" && !capabilitiesRef.current.canManageEvidence) {
      setMutation({ name: "evidence", pending: false, error: "No tienes permiso para subir evidencia interna.", conflict: false });
      return false;
    }
    mutationPendingRef.current = true;
    setMutation({ name: "evidence", pending: true, error: null, conflict: false });
    try {
      await rawEvidenceApi.uploadRecurrence(targetId, input);
      if (evidencePromptRef.current === targetId) {
        evidencePromptRef.current = null;
        setEvidencePrompt(null);
      }
      setMutation({ name: "evidence", pending: false, error: null, conflict: false });
      if (selectedIdRef.current === targetId) void loadDetail(targetId, true);
      return true;
    } catch (error: unknown) {
      const failure = evidenceMutationError(error, "upload");
      setMutation({ name: "evidence", pending: false, error: failure.message, conflict: failure.conflict });
      return false;
    } finally {
      mutationPendingRef.current = false;
    }
  }, [loadDetail, rawEvidenceApi]);

  const downloadEvidence = useCallback(async (item: Evidence): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    if (!capabilitiesRef.current.canViewEvidence) {
      setMutation({ name: "evidence", pending: false, error: "No tienes permiso para descargar evidencia.", conflict: false });
      return false;
    }
    mutationPendingRef.current = true;
    setMutation({ name: "evidence", pending: true, error: null, conflict: false });
    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const downloaded = await evidenceApi.download(item.id);
      objectUrl = URL.createObjectURL(downloaded.blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = safeDownloadFilename(downloaded.filename ?? item.originalName);
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      setMutation({ name: "evidence", pending: false, error: null, conflict: false });
      return true;
    } catch (error: unknown) {
      const failure = evidenceMutationError(error, "download");
      setMutation({ name: "evidence", pending: false, error: failure.message, conflict: failure.conflict });
      return false;
    } finally {
      anchor?.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      mutationPendingRef.current = false;
    }
  }, [evidenceApi]);

  const archiveEvidence = useCallback(async (item: Evidence, rawReason: string): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    if (!capabilitiesRef.current.canManageEvidence) {
      setMutation({ name: "evidence", pending: false, error: "No tienes permiso para archivar evidencia.", conflict: false });
      return false;
    }
    const reason = rawReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setMutation({ name: "evidence", pending: false, error: "El motivo para archivar debe tener entre 10 y 500 caracteres.", conflict: false });
      return false;
    }
    mutationPendingRef.current = true;
    setMutation({ name: "evidence", pending: true, error: null, conflict: false });
    try {
      await rawEvidenceApi.archive(item.id, { version: item.version, reason });
      setMutation({ name: "evidence", pending: false, error: null, conflict: false });
      if (selectedIdRef.current === item.resourceId) void loadDetail(item.resourceId, true);
      return true;
    } catch (error: unknown) {
      const failure = evidenceMutationError(error, "archive");
      setMutation({ name: "evidence", pending: false, error: failure.message, conflict: failure.conflict });
      return false;
    } finally {
      mutationPendingRef.current = false;
    }
  }, [loadDetail, rawEvidenceApi]);

  const clearEvidencePrompt = useCallback(() => {
    evidencePromptRef.current = null;
    setEvidencePrompt(null);
    setMutation((current) => current?.name === "evidence" ? null : current);
  }, []);

  const setActionMode = useCallback((mode: RecurrenceActionMode | null) => {
    const next = mode && actionAllowed(mode, capabilitiesRef.current) ? mode : null;
    if (actionModeRef.current !== next) invalidateWorkflowOperation();
    actionModeRef.current = next;
    setActionModeState(next);
  }, [invalidateWorkflowOperation]);

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
    evidencePromptForId: capabilities.canUploadEvidence
      && evidencePrompt?.permissionsKey === permissionsKey
      ? evidencePrompt.id
      : null,
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
    reportRecurrence,
    analyzeRecurrence,
    correctRecurrence,
    addVisit,
    addNote,
    uploadEvidence,
    downloadEvidence,
    archiveEvidence,
    clearEvidencePrompt,
    setActionMode,
    clearMutationError,
  };
}
