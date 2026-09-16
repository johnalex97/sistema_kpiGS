import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderLookupApi } from "../api/order-lookups";
import type { OrdersApi } from "../api/orders";
import { ApiClientError, type ApiFieldError } from "../api/http";
import { useAuth } from "../auth/useAuth";
import type {
  OrderCatalog,
  OrderDetail,
  OrderFilters,
  OrderHistoryPage,
  OrderPage,
  CreateOrderInput,
  UpdateOrderInput,
} from "../models/order";
import {
  deriveOrderCapabilities,
  readOrderUrlState,
  writeOrderUrlState,
  type OrderCapabilities,
} from "./order-workspace.helpers";

type ReadStatus = "idle" | "loading" | "success" | "error";

export interface OrderReadState<T> {
  status: ReadStatus;
  data: T | null;
  error: string | null;
  stale: boolean;
}

export interface OrdersWorkspace {
  filters: OrderFilters;
  selectedOrderId: string | null;
  capabilities: OrderCapabilities;
  currentTechnicianId: string | null;
  list: OrderReadState<OrderPage>;
  detail: OrderReadState<OrderDetail>;
  catalog: OrderReadState<OrderCatalog>;
  history: OrderReadState<OrderHistoryPage>;
  form: OrderFormState | null;
  setFilters(patch: Partial<OrderFilters>): void;
  setPage(page: number): void;
  selectOrder(id: string): void;
  closeDetail(): void;
  refreshList(): Promise<void>;
  refreshDetail(): Promise<void>;
  refresh(): Promise<void>;
  loadHistory(page?: number): Promise<void>;
  openCreate(): void;
  openEdit(): void;
  closeForm(): void;
  submitOrder(input: CreateOrderInput | Omit<UpdateOrderInput, "version">): Promise<boolean>;
}

export interface OrderFormState {
  mode: "create" | "edit";
  order: OrderDetail | null;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  conflict: boolean;
}

export interface UseOrdersWorkspaceOptions {
  api: OrdersApi;
  lookupApi: OrderLookupApi;
  search?: string;
  pollIntervalMs?: number;
  formActive?: boolean;
}

function idleState<T>(): OrderReadState<T> {
  return { status: "idle", data: null, error: null, stale: false };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function urlFor(state: { filters: OrderFilters; orderId: string | null }): string {
  const query = writeOrderUrlState(window.location.search, state).toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

export function useOrdersWorkspace({
  api,
  lookupApi,
  search = "",
  pollIntervalMs = 30_000,
  formActive = false,
}: UseOrdersWorkspaceOptions): OrdersWorkspace {
  const { user } = useAuth();
  const permissionsKey = (user?.permissions ?? []).join("\u0000");
  const grantedCapabilities = useMemo(
    () => deriveOrderCapabilities(user?.permissions ?? []),
    // permissionsKey captures in-place permission array changes from auth refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissionsKey],
  );
  const [managementForbidden, setManagementForbidden] = useState(false);
  const capabilities = useMemo(() => ({
    ...grantedCapabilities,
    canManage: grantedCapabilities.canManage && !managementForbidden,
  }), [grantedCapabilities, managementForbidden]);
  const initialRef = useRef(readOrderUrlState(window.location.search));
  const initialSearch = search.trim();
  const [filters, setFiltersState] = useState<OrderFilters>(() => ({
    ...initialRef.current.filters,
    search: initialSearch || initialRef.current.filters.search,
  }));
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialRef.current.orderId,
  );
  const [list, setList] = useState<OrderReadState<OrderPage>>(idleState);
  const [detail, setDetail] = useState<OrderReadState<OrderDetail>>(idleState);
  const [catalog, setCatalog] = useState<OrderReadState<OrderCatalog>>(idleState);
  const [history, setHistory] = useState<OrderReadState<OrderHistoryPage>>(idleState);
  const [form, setForm] = useState<OrderFormState | null>(null);

  const filtersRef = useRef(filters);
  const selectedIdRef = useRef(selectedOrderId);
  const listRef = useRef(list);
  const detailRef = useRef(detail);
  const formRef = useRef(form);
  const canManageRef = useRef(capabilities.canManage);
  const mutationPendingRef = useRef(false);
  const appliedSearchRef = useRef(initialSearch);
  const controllers = useRef({
    list: null as AbortController | null,
    detail: null as AbortController | null,
    catalog: null as AbortController | null,
    history: null as AbortController | null,
  });
  const generations = useRef({ list: 0, detail: 0, catalog: 0, history: 0 });

  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { selectedIdRef.current = selectedOrderId; }, [selectedOrderId]);
  useEffect(() => { listRef.current = list; }, [list]);
  useEffect(() => { detailRef.current = detail; }, [detail]);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { canManageRef.current = capabilities.canManage; }, [capabilities.canManage]);

  const loadList = useCallback(async (): Promise<void> => {
    if (!capabilities.canView) return;
    controllers.current.list?.abort();
    const controller = new AbortController();
    controllers.current.list = controller;
    const generation = ++generations.current.list;
    setList((current) => ({
      status: "loading",
      data: current.data,
      error: null,
      stale: false,
    }));
    try {
      const data = await api.list(filtersRef.current, controller.signal);
      if (controller.signal.aborted || generation !== generations.current.list) return;
      setList({ status: "success", data, error: null, stale: false });
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error) || generation !== generations.current.list) return;
      const previous = listRef.current.data;
      setList({
        status: previous ? "success" : "error",
        data: previous,
        error: errorMessage(error, "No fue posible cargar las órdenes"),
        stale: previous !== null,
      });
    }
  }, [api, capabilities.canView]);

  const loadDetail = useCallback(async (
    id: string,
    silent = false,
  ): Promise<void> => {
    if (!capabilities.canView) return;
    controllers.current.detail?.abort();
    const controller = new AbortController();
    controllers.current.detail = controller;
    const generation = ++generations.current.detail;
    if (!silent) {
      setDetail({ status: "loading", data: null, error: null, stale: false });
    }
    try {
      const data = await api.detail(id, controller.signal);
      if (
        controller.signal.aborted
        || generation !== generations.current.detail
        || selectedIdRef.current !== id
      ) return;
      setDetail({ status: "success", data, error: null, stale: false });
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error) || generation !== generations.current.detail) return;
      const previous = detailRef.current.data;
      setDetail({
        status: silent && previous ? "success" : "error",
        data: previous,
        error: errorMessage(error, "No fue posible cargar la orden"),
        stale: silent && previous !== null,
      });
    }
  }, [api, capabilities.canView]);

  const loadCatalog = useCallback(async (): Promise<void> => {
    if (!capabilities.canView) return;
    controllers.current.catalog?.abort();
    const controller = new AbortController();
    controllers.current.catalog = controller;
    const generation = ++generations.current.catalog;
    setCatalog((current) => ({ ...current, status: "loading", error: null }));
    try {
      const data = await lookupApi.catalog(controller.signal);
      if (controller.signal.aborted || generation !== generations.current.catalog) return;
      setCatalog({ status: "success", data, error: null, stale: false });
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error) || generation !== generations.current.catalog) return;
      setCatalog((current) => ({
        status: current.data ? "success" : "error",
        data: current.data,
        error: errorMessage(error, "No fue posible cargar el catálogo"),
        stale: current.data !== null,
      }));
    }
  }, [capabilities.canView, lookupApi]);

  const loadHistory = useCallback(async (page = 1): Promise<void> => {
    const id = selectedIdRef.current;
    if (!capabilities.canView || !id) return;
    controllers.current.history?.abort();
    const controller = new AbortController();
    controllers.current.history = controller;
    const generation = ++generations.current.history;
    setHistory((current) => ({ ...current, status: "loading", error: null }));
    try {
      const data = await api.history(id, page, controller.signal);
      if (
        controller.signal.aborted
        || generation !== generations.current.history
        || selectedIdRef.current !== id
      ) return;
      setHistory({ status: "success", data, error: null, stale: false });
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error) || generation !== generations.current.history) return;
      setHistory((current) => ({
        status: current.data ? "success" : "error",
        data: current.data,
        error: errorMessage(error, "No fue posible cargar el historial"),
        stale: current.data !== null,
      }));
    }
  }, [api, capabilities.canView]);

  const refreshList = useCallback(() => loadList(), [loadList]);
  const refreshDetail = useCallback(async (): Promise<void> => {
    const id = selectedIdRef.current;
    if (id) await loadDetail(id, true);
  }, [loadDetail]);
  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([loadList(), refreshDetail()]);
  }, [loadList, refreshDetail]);

  useEffect(() => {
    if (capabilities.canView) void loadList();
  }, [capabilities.canView, filters, loadList]);

  useEffect(() => {
    if (capabilities.canView) void loadCatalog();
  }, [capabilities.canView, loadCatalog]);

  useEffect(() => {
    if (selectedOrderId && capabilities.canView) {
      void loadDetail(selectedOrderId);
    }
  }, [capabilities.canView, loadDetail, selectedOrderId]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === appliedSearchRef.current) return;
    const timer = window.setTimeout(() => {
      appliedSearchRef.current = normalized;
      setFiltersState((current) => ({
        ...current,
        search: normalized || undefined,
        page: 1,
      }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const nextUrl = urlFor({ filters, orderId: selectedOrderId });
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [filters, selectedOrderId]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = readOrderUrlState(window.location.search);
      filtersRef.current = parsed.filters;
      selectedIdRef.current = parsed.orderId;
      setFiltersState(parsed.filters);
      setSelectedOrderId(parsed.orderId);
      setDetail(idleState());
      setHistory(idleState());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (capabilities.canView) return;
    Object.values(controllers.current).forEach((controller) => controller?.abort());
    Object.keys(generations.current).forEach((key) => {
      generations.current[key as keyof typeof generations.current] += 1;
    });
    selectedIdRef.current = null;
    setSelectedOrderId(null);
    setList(idleState());
    setDetail(idleState());
    setCatalog(idleState());
    setHistory(idleState());
  }, [capabilities.canView]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible" && !formActive && !formRef.current) void refresh();
    };
    const timer = window.setInterval(poll, pollIntervalMs);
    const handleVisibility = () => poll();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [formActive, pollIntervalMs, refresh]);

  useEffect(() => {
    if (capabilities.canManage) return;
    mutationPendingRef.current = false;
    setForm(null);
  }, [capabilities.canManage]);

  useEffect(() => () => {
    Object.values(controllers.current).forEach((controller) => controller?.abort());
    Object.keys(generations.current).forEach((key) => {
      generations.current[key as keyof typeof generations.current] += 1;
    });
  }, []);

  const setFilters = useCallback((patch: Partial<OrderFilters>) => {
    setFiltersState((current) => ({
      ...current,
      ...patch,
      page: patch.page ?? 1,
      pageSize: patch.pageSize ?? current.pageSize,
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFiltersState((current) => ({ ...current, page: Math.max(1, page) }));
  }, []);

  const selectOrder = useCallback((id: string) => {
    const normalized = id.trim();
    if (!normalized || normalized === selectedIdRef.current) return;
    controllers.current.detail?.abort();
    controllers.current.history?.abort();
    generations.current.detail += 1;
    generations.current.history += 1;
    selectedIdRef.current = normalized;
    setSelectedOrderId(normalized);
    setDetail(idleState());
    setHistory(idleState());
    window.history.pushState(
      window.history.state,
      "",
      urlFor({ filters: filtersRef.current, orderId: normalized }),
    );
  }, []);

  const closeDetail = useCallback(() => {
    controllers.current.detail?.abort();
    controllers.current.history?.abort();
    generations.current.detail += 1;
    generations.current.history += 1;
    selectedIdRef.current = null;
    setSelectedOrderId(null);
    setDetail(idleState());
    setHistory(idleState());
    window.history.pushState(
      window.history.state,
      "",
      urlFor({ filters: filtersRef.current, orderId: null }),
    );
  }, []);

  const openCreate = useCallback(() => {
    if (!canManageRef.current) return;
    setForm({ mode: "create", order: null, pending: false, error: null, fieldErrors: [], conflict: false });
  }, []);

  const openEdit = useCallback(() => {
    const current = detailRef.current.data;
    if (!canManageRef.current || !current || !["PENDING", "ASSIGNED"].includes(current.status)) return;
    setForm({ mode: "edit", order: current, pending: false, error: null, fieldErrors: [], conflict: false });
  }, []);

  const closeForm = useCallback(() => {
    if (mutationPendingRef.current) return;
    setForm(null);
  }, []);

  const submitOrder = useCallback(async (
    input: CreateOrderInput | Omit<UpdateOrderInput, "version">,
  ): Promise<boolean> => {
    const currentForm = formRef.current;
    if (!currentForm || !canManageRef.current || mutationPendingRef.current) return false;
    mutationPendingRef.current = true;
    setForm((current) => current ? { ...current, pending: true, error: null, fieldErrors: [], conflict: false } : null);
    try {
      const currentDetail = detailRef.current.data;
      const incoming = currentForm.mode === "create"
        ? await api.create(input as CreateOrderInput)
        : currentDetail && currentDetail.id === currentForm.order?.id
          ? await api.update(currentDetail.id, { ...input, version: currentDetail.version })
          : null;
      if (!incoming || !canManageRef.current) return false;
      selectedIdRef.current = incoming.id;
      setSelectedOrderId(incoming.id);
      setDetail({ status: "success", data: incoming, error: null, stale: false });
      setList((current) => current.data ? {
        ...current,
        data: {
          ...current.data,
          items: current.data.items.some((item) => item.id === incoming.id)
            ? current.data.items.map((item) => item.id === incoming.id ? incoming : item)
            : [incoming, ...current.data.items],
        },
      } : current);
      setForm(null);
      window.history.pushState(window.history.state, "", urlFor({ filters: filtersRef.current, orderId: incoming.id }));
      return true;
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        canManageRef.current = false;
        setManagementForbidden(true);
        controllers.current.catalog?.abort();
        generations.current.catalog += 1;
        setCatalog(idleState());
        setForm(null);
        return false;
      }
      const conflict = error instanceof ApiClientError && error.status === 409;
      setForm((current) => current ? {
        ...current,
        pending: false,
        error: conflict
          ? "La orden cambió en el servidor. Revisa la versión actual antes de guardar de nuevo."
          : errorMessage(error, "No fue posible guardar la orden"),
        fieldErrors: error instanceof ApiClientError ? error.fieldErrors : [],
        conflict,
      } : null);
      if (conflict && currentForm.mode === "edit") await refreshDetail();
      return false;
    } finally {
      mutationPendingRef.current = false;
      setForm((current) => current ? { ...current, pending: false } : null);
    }
  }, [api, refreshDetail]);

  return {
    filters,
    selectedOrderId,
    capabilities,
    currentTechnicianId: user?.technicianId ?? null,
    list,
    detail,
    catalog,
    history,
    form,
    setFilters,
    setPage,
    selectOrder,
    closeDetail,
    refreshList,
    refreshDetail,
    refresh,
    loadHistory,
    openCreate,
    openEdit,
    closeForm,
    submitOrder,
  };
}
