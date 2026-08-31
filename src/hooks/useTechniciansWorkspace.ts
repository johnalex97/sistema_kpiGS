import { useCallback, useEffect, useRef, useState } from "react";
import type { KpiApi } from "../api/kpis";
import type { TechnicianApi } from "../api/technicians";
import { ApiClientError } from "../api/http";
import type { KpiDashboardItem } from "../models/kpi";
import type {
  CreateTechnicianInput,
  DeactivateTechnicianInput,
  OperationalTechnicianStatus,
  Technician,
  TechnicianListFilters,
  TechnicianPage,
  UpdateTechnicianInput,
} from "../models/technician";
import {
  currentWeekStart,
  indexTechnicianKpis,
  parseTechnicianSearch,
  reconcileTechnician,
  serializeTechnicianSearch,
  type TechnicianQueryState,
} from "./technician-workspace.helpers";

export type TechnicianMutationName = "create" | "update" | "status" | "deactivate" | "reactivate";

export interface TechnicianMutationState {
  name: TechnicianMutationName;
  pending: boolean;
  error: string | null;
  conflict: boolean;
}

export interface TechniciansWorkspace {
  query: TechnicianQueryState;
  page: TechnicianPage | null;
  selected: Technician | null;
  kpis: Map<string, KpiDashboardItem>;
  kpiState: "idle" | "loading" | "ready" | "error";
  listState: "loading" | "ready" | "empty" | "error";
  stale: boolean;
  listError: string | null;
  detailState: "idle" | "loading" | "ready" | "error";
  mutation: TechnicianMutationState | null;
  setFilters(patch: Partial<TechnicianListFilters>): void;
  retryList(): void;
  select(id: string): void;
  closeDetail(): void;
  createTechnician(input: CreateTechnicianInput): Promise<boolean>;
  updateTechnician(input: Omit<UpdateTechnicianInput, "version">): Promise<boolean>;
  changeStatus(status: OperationalTechnicianStatus): Promise<boolean>;
  deactivate(input: Omit<DeactivateTechnicianInput, "version">): Promise<boolean>;
  reactivate(reason: string): Promise<boolean>;
  clearMutationError(): void;
}

export interface UseTechniciansWorkspaceOptions {
  api: TechnicianApi;
  kpiApi: KpiApi;
  search: string;
  canViewKpi: boolean;
  now?: () => Date;
}

interface MutationTarget {
  id: string;
  version: number;
}

const systemNow = () => new Date();

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function mutationErrorMessage(error: unknown): { message: string; conflict: boolean } {
  if (!(error instanceof ApiClientError)) return { message: errorMessage(error, "No fue posible guardar los cambios"), conflict: false };
  if (error.status === 403) return { message: "No tienes permiso para realizar esta acción.", conflict: false };
  if (error.status === 404) return { message: "El técnico ya no está disponible.", conflict: false };
  if (error.status === 409 && error.code === "VERSION_CONFLICT") {
    return { message: "El técnico cambió en el servidor. Revisa la versión actual antes de continuar.", conflict: true };
  }
  const messages: Record<string, string> = {
    WORK_EMAIL_ALREADY_EXISTS: "El correo laboral ya está registrado.",
    USER_NOT_ELIGIBLE_AS_TECHNICIAN: "El usuario seleccionado no es elegible como técnico.",
    USER_ALREADY_LINKED: "El usuario seleccionado ya está vinculado a otro técnico.",
    TECHNICIAN_HAS_ACTIVE_WORK: "No se puede desactivar el técnico porque tiene trabajo activo.",
    INVALID_TECHNICIAN_STATUS: "El estado seleccionado no es válido para el técnico.",
  };
  return { message: messages[error.code] ?? "No fue posible guardar los cambios", conflict: false };
}

export function useTechniciansWorkspace({
  api,
  kpiApi,
  search,
  canViewKpi,
  now,
}: UseTechniciansWorkspaceOptions): TechniciansWorkspace {
  const nowRef = useRef(now);
  const clock = useCallback(() => (nowRef.current ?? systemNow)(), []);
  const [query, setQuery] = useState<TechnicianQueryState>(() => {
    const parsed = parseTechnicianSearch(window.location.search);
    const externalSearch = search.trim();
    return externalSearch
      ? { ...parsed, filters: { ...parsed.filters, search: externalSearch, page: 1 } }
      : parsed;
  });
  const [page, setPage] = useState<TechnicianPage | null>(null);
  const [selected, setSelected] = useState<Technician | null>(null);
  const [kpis, setKpis] = useState<Map<string, KpiDashboardItem>>(() => new Map());
  const [kpiState, setKpiState] = useState<TechniciansWorkspace["kpiState"]>("idle");
  const [listState, setListState] = useState<TechniciansWorkspace["listState"]>("loading");
  const [stale, setStale] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<TechniciansWorkspace["detailState"]>("idle");
  const [mutation, setMutation] = useState<TechnicianMutationState | null>(null);

  const queryRef = useRef(query);
  const pageRef = useRef(page);
  const selectedRef = useRef(selected);
  const selectedIdRef = useRef<string | null>(null);
  const canViewKpiRef = useRef(canViewKpi);
  const externalSearchRef = useRef(search.trim());
  const listControllerRef = useRef<AbortController | null>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const kpiControllerRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const kpiGenerationRef = useRef(0);
  const mutationPendingRef = useRef(false);

  const invalidateKpis = useCallback(() => {
    kpiGenerationRef.current += 1;
    kpiControllerRef.current?.abort();
    kpiControllerRef.current = null;
    setKpis((current) => current.size === 0 ? current : new Map());
    setKpiState((current) => current === "idle" ? current : "idle");
  }, []);

  const beginListLoading = useCallback(() => {
    setListState("loading");
    setStale(false);
    setListError(null);
  }, []);

  const loadList = useCallback(async (): Promise<void> => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    const generation = ++listGenerationRef.current;
    const requestedQuery = queryRef.current;
    try {
      const nextPage = await api.list(requestedQuery.filters, controller.signal);
      if (controller.signal.aborted || generation !== listGenerationRef.current || queryRef.current !== requestedQuery) return;
      const lastAvailablePage = Math.max(1, nextPage.pagination.totalPages);
      if (requestedQuery.filters.page > lastAvailablePage) {
        setQuery((current) => current === requestedQuery
          ? { ...current, filters: { ...current.filters, page: lastAvailablePage } }
          : current);
        return;
      }
      pageRef.current = nextPage;
      setPage(nextPage);
      setListState(nextPage.items.length ? "ready" : "empty");
      setStale(false);
      setListError(null);
    } catch (error: unknown) {
      if (controller.signal.aborted || generation !== listGenerationRef.current || isAbortError(error)) return;
      const message = errorMessage(error, "No fue posible cargar los técnicos");
      setListError(message);
      if (pageRef.current) {
        setListState(pageRef.current.items.length ? "ready" : "empty");
        setStale(true);
      } else {
        setListState("error");
        setStale(false);
      }
    }
  }, [api]);

  const loadKpis = useCallback(async (): Promise<void> => {
    if (!canViewKpiRef.current) return;
    kpiControllerRef.current?.abort();
    const controller = new AbortController();
    kpiControllerRef.current = controller;
    const generation = ++kpiGenerationRef.current;
    setKpiState("loading");
    try {
      const dashboard = await kpiApi.getDashboard({ periodStart: currentWeekStart(clock()), granularity: "WEEK" }, controller.signal);
      if (!canViewKpiRef.current || controller.signal.aborted || generation !== kpiGenerationRef.current) return;
      setKpis(indexTechnicianKpis(dashboard.items));
      setKpiState("ready");
    } catch (error: unknown) {
      if (!canViewKpiRef.current || controller.signal.aborted || generation !== kpiGenerationRef.current || isAbortError(error)) return;
      setKpiState("error");
    }
  }, [clock, kpiApi]);

  const loadDetail = useCallback(async (id: string, silent: boolean): Promise<void> => {
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const generation = ++detailGenerationRef.current;
    try {
      const incoming = await api.detail(id, controller.signal);
      if (controller.signal.aborted || generation !== detailGenerationRef.current || selectedIdRef.current !== id) return;
      const next = selectedRef.current ? reconcileTechnician(selectedRef.current, incoming) : incoming;
      selectedRef.current = next;
      setSelected(next);
      setDetailState("ready");
    } catch (error: unknown) {
      if (controller.signal.aborted || generation !== detailGenerationRef.current || isAbortError(error)) return;
      if (!silent || !selectedRef.current) setDetailState("error");
    }
  }, [api]);

  const refresh = useCallback(async (): Promise<void> => {
    const selectedId = selectedIdRef.current;
    await Promise.all([
      loadList(),
      loadKpis(),
      ...(selectedId ? [loadDetail(selectedId, true)] : []),
    ]);
  }, [loadDetail, loadKpis, loadList]);

  useEffect(() => { queryRef.current = query; }, [query]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { nowRef.current = now; }, [now]);
  useEffect(() => { canViewKpiRef.current = canViewKpi; }, [canViewKpi]);

  useEffect(() => { void loadList(); }, [loadList, query]);
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!canViewKpiRef.current) return invalidateKpis();
      return loadKpis();
    });
  }, [canViewKpi, invalidateKpis, loadKpis]);

  useEffect(() => {
    const normalized = search.trim();
    const previous = externalSearchRef.current;
    if (normalized === previous) return;
    externalSearchRef.current = normalized;
    const timer = window.setTimeout(() => {
      beginListLoading();
      setQuery((current) => ({ ...current, filters: { ...current.filters, search: normalized || undefined, page: 1 } }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [beginListLoading, search]);

  useEffect(() => {
    const serialized = serializeTechnicianSearch(window.location.search, query);
    const nextSearch = serialized.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl);
  }, [query]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseTechnicianSearch(window.location.search);
      beginListLoading();
      setQuery(parsed);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [beginListLoading]);

  useEffect(() => () => {
    listGenerationRef.current += 1;
    detailGenerationRef.current += 1;
    kpiGenerationRef.current += 1;
    listControllerRef.current?.abort();
    detailControllerRef.current?.abort();
    kpiControllerRef.current?.abort();
  }, []);

  const setFilters = useCallback((patch: Partial<TechnicianListFilters>) => {
    beginListLoading();
    setQuery((current) => ({
      ...current,
      filters: { ...current.filters, ...patch, page: patch.page ?? 1, pageSize: 20 },
    }));
  }, [beginListLoading]);

  const retryList = useCallback(() => {
    beginListLoading();
    void loadList();
  }, [beginListLoading, loadList]);

  const select = useCallback((id: string) => {
    selectedIdRef.current = id;
    selectedRef.current = null;
    setSelected(null);
    setDetailState("loading");
    void loadDetail(id, false);
  }, [loadDetail]);

  const closeDetail = useCallback(() => {
    selectedIdRef.current = null;
    detailGenerationRef.current += 1;
    detailControllerRef.current?.abort();
    selectedRef.current = null;
    setSelected(null);
    setDetailState("idle");
  }, []);

  const applyTechnician = useCallback((incoming: Technician) => {
    const currentSelected = selectedRef.current;
    if (selectedIdRef.current === incoming.id) {
      const nextSelected = currentSelected ? reconcileTechnician(currentSelected, incoming) : incoming;
      selectedRef.current = nextSelected;
      setSelected(nextSelected);
      setDetailState("ready");
    }
    const currentPage = pageRef.current;
    if (!currentPage?.items.some((item) => item.id === incoming.id)) return;
    const nextPage = {
      ...currentPage,
      items: currentPage.items.map((item) => item.id === incoming.id ? reconcileTechnician(item, incoming) : item),
    };
    pageRef.current = nextPage;
    setPage(nextPage);
  }, []);

  const handleMutationError = useCallback(async (
    name: TechnicianMutationName,
    target: MutationTarget | null,
    error: unknown,
  ): Promise<boolean> => {
    const { message, conflict } = mutationErrorMessage(error);
    const targetRemainsSelected = target?.id === selectedIdRef.current;
    if (error instanceof ApiClientError && error.status === 404 && targetRemainsSelected) {
      closeDetail();
      await loadList();
    }
    if (conflict && target && targetRemainsSelected) await loadDetail(target.id, true);
    setMutation({ name, pending: false, error: message, conflict });
    return false;
  }, [closeDetail, loadDetail, loadList]);

  const executeMutation = useCallback(async (
    name: TechnicianMutationName,
    target: MutationTarget | null,
    operation: () => Promise<Technician>,
  ): Promise<boolean> => {
    if (mutationPendingRef.current) return false;
    mutationPendingRef.current = true;
    setMutation({ name, pending: true, error: null, conflict: false });
    try {
      const technicianResult = await operation();
      applyTechnician(technicianResult);
      await refresh();
      applyTechnician(technicianResult);
      setMutation({ name, pending: false, error: null, conflict: false });
      return true;
    } catch (error: unknown) {
      return await handleMutationError(name, target, error);
    } finally {
      mutationPendingRef.current = false;
    }
  }, [applyTechnician, handleMutationError, refresh]);

  const createTechnician = useCallback((input: CreateTechnicianInput) => executeMutation("create", null, () => api.create(input)), [api, executeMutation]);
  const updateTechnician = useCallback((input: Omit<UpdateTechnicianInput, "version">) => {
    const current = selectedRef.current;
    const target = current && { id: current.id, version: current.version };
    return target ? executeMutation("update", target, () => api.update(target.id, { ...input, version: target.version })) : Promise.resolve(false);
  }, [api, executeMutation]);
  const changeStatus = useCallback((status: OperationalTechnicianStatus) => {
    const current = selectedRef.current;
    const target = current && { id: current.id, version: current.version };
    return target ? executeMutation("status", target, () => api.changeStatus(target.id, { status, version: target.version })) : Promise.resolve(false);
  }, [api, executeMutation]);
  const deactivate = useCallback((input: Omit<DeactivateTechnicianInput, "version">) => {
    const current = selectedRef.current;
    const target = current && { id: current.id, version: current.version };
    return target ? executeMutation("deactivate", target, () => api.deactivate(target.id, { ...input, version: target.version })) : Promise.resolve(false);
  }, [api, executeMutation]);
  const reactivate = useCallback((reason: string) => {
    const current = selectedRef.current;
    const target = current && { id: current.id, version: current.version };
    return target ? executeMutation("reactivate", target, () => api.reactivate(target.id, { reason, version: target.version })) : Promise.resolve(false);
  }, [api, executeMutation]);
  const clearMutationError = useCallback(() => setMutation(null), []);

  return {
    query, page, selected, kpis, kpiState, listState, stale, listError, detailState, mutation,
    setFilters, retryList, select, closeDetail, createTechnician, updateTechnician, changeStatus, deactivate, reactivate, clearMutationError,
  };
}
