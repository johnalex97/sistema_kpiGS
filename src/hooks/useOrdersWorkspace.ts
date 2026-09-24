import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderLookupApi } from "../api/order-lookups";
import type { OrdersApi } from "../api/orders";
import { createEvidenceApi, type OrderEvidenceApi } from "../api/evidences";
import { ApiClientError, type ApiFieldError } from "../api/http";
import { useAuth } from "../auth/useAuth";
import type {
  OrderCatalog,
  Order,
  OrderDetail,
  OrderFilters,
  OrderHistoryPage,
  OrderPage,
  CreateOrderInput,
  UpdateOrderInput,
  OrderTechnicianRole,
  OrderActionInput,
  OrderDialogAction,
  OrderOperationalAction,
  MaterialInput,
  UpdateMaterialInput,
} from "../models/order";
import type { Evidence, EvidenceUploadInput } from "../models/evidence";
import {
  allowedOrderActions,
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
  assignment: OrderAssignmentState;
  material: OrderMaterialState;
  action: OrderOperationState;
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
  reviewOrderConflict?(): void;
  reloadOrderConflict?(): Promise<void>;
  submitOrder(input: CreateOrderInput | Omit<UpdateOrderInput, "version">): Promise<boolean>;
  assignTechnician(technicianId: string, role: OrderTechnicianRole): Promise<boolean>;
  unassignTechnician(technicianId: string, reason: string): Promise<boolean>;
  addMaterial(input: Omit<MaterialInput, "version">): Promise<boolean>;
  updateMaterial(usageId: string, input: Omit<UpdateMaterialInput, "version">): Promise<boolean>;
  removeMaterial(usageId: string): Promise<boolean>;
  openOrderAction(action: OrderDialogAction): void;
  closeOrderAction(): void;
  executeOrderAction(action: OrderOperationalAction, input: OrderActionInput): Promise<boolean>;
  evidenceApi?: OrderEvidenceApi;
  ordersApi?: Pick<OrdersApi, "history">;
  evidence?: { pending: boolean; error: string | null };
  uploadEvidence?: (input: EvidenceUploadInput) => Promise<boolean>;
  downloadEvidence?: (evidence: Evidence) => Promise<boolean>;
  archiveEvidence?: (evidence: Evidence, reason: string) => Promise<boolean>;
  invalidateEvidenceRead?: (status: 403 | 404) => void;
  invalidateLookup?: (kind: "clients" | "technicians") => void;
}

export interface OrderAssignmentState {
  pending: boolean;
  error: string | null;
}

export interface OrderMaterialState {
  pending: boolean;
  error: string | null;
}

export interface OrderOperationState {
  pending: boolean;
  error: string | null;
  dialog: OrderDialogAction | null;
  targetOrderId: string | null;
  targetVersion: number | null;
}

export interface OrderFormState {
  mode: "create" | "edit";
  order: OrderDetail | null;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  conflict: boolean;
  conflictOrder?: OrderDetail | null;
}

export interface UseOrdersWorkspaceOptions {
  api: OrdersApi;
  lookupApi: OrderLookupApi;
  search?: string;
  pollIntervalMs?: number;
  formActive?: boolean;
  evidenceApi?: OrderEvidenceApi;
}

const defaultEvidenceApi = createEvidenceApi();

function idleState<T>(): OrderReadState<T> {
  return { status: "idle", data: null, error: null, stale: false };
}

function idleOperation(error: string | null = null): OrderOperationState {
  return { pending: false, error, dialog: null, targetOrderId: null, targetVersion: null };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function safeDownloadName(value: string, fallback: string): string {
  const clean = Array.from(value).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code > 0x1f && code !== 0x7f && character !== "/" && character !== "\\";
  }).join("").trim();
  return clean || fallback;
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
  evidenceApi: rawEvidenceApi = defaultEvidenceApi,
}: UseOrdersWorkspaceOptions): OrdersWorkspace {
  const { user } = useAuth();
  const currentTechnicianId = user?.technicianId ?? null;
  const permissionsKey = (user?.permissions ?? []).join("\u0000");
  const grantedCapabilities = useMemo(
    () => deriveOrderCapabilities(user?.permissions ?? []),
    // permissionsKey captures in-place permission array changes from auth refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissionsKey],
  );
  const [viewForbidden, setViewForbidden] = useState(false);
  const [managementForbidden, setManagementForbidden] = useState(false);
  const [operationsForbidden, setOperationsForbidden] = useState(false);
  const [evidenceViewForbidden, setEvidenceViewForbidden] = useState(false);
  const [evidenceUploadForbidden, setEvidenceUploadForbidden] = useState(false);
  const [evidenceManageForbidden, setEvidenceManageForbidden] = useState(false);
  const [lookupForbidden, setLookupForbidden] = useState({ clients: false, technicians: false });
  const initialRef = useRef(readOrderUrlState(window.location.search));
  const initialSearch = search.trim();
  const [filters, setFiltersState] = useState<OrderFilters>(() => ({
    ...initialRef.current.filters,
    search: initialSearch || initialRef.current.filters.search,
  }));
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialRef.current.orderId,
  );
  const [evidenceMissingOrder, setEvidenceMissingOrder] = useState<string | null>(null);
  const capabilities = useMemo(() => ({
    ...grantedCapabilities,
    canView: grantedCapabilities.canView && !viewForbidden,
    canViewAll: grantedCapabilities.canViewAll && !viewForbidden,
    canManage: grantedCapabilities.canManage && !viewForbidden && !managementForbidden && !operationsForbidden,
    canOperateOwn: grantedCapabilities.canOperateOwn && !viewForbidden && !operationsForbidden,
    canViewEvidence: grantedCapabilities.canViewEvidence && !evidenceViewForbidden && (!evidenceMissingOrder || evidenceMissingOrder !== selectedOrderId),
    canUploadEvidence: grantedCapabilities.canUploadEvidence && !evidenceUploadForbidden,
    canManageEvidence: grantedCapabilities.canManageEvidence && !evidenceManageForbidden,
    canLookupClients: grantedCapabilities.canLookupClients && !lookupForbidden.clients,
    canLookupTechnicians: grantedCapabilities.canLookupTechnicians && !lookupForbidden.technicians,
  }), [evidenceMissingOrder, selectedOrderId, evidenceManageForbidden, evidenceUploadForbidden, evidenceViewForbidden, grantedCapabilities, lookupForbidden, managementForbidden, operationsForbidden, viewForbidden]);
  const [list, setList] = useState<OrderReadState<OrderPage>>(idleState);
  const [detail, setDetail] = useState<OrderReadState<OrderDetail>>(idleState);
  const [catalog, setCatalog] = useState<OrderReadState<OrderCatalog>>(idleState);
  const [history, setHistory] = useState<OrderReadState<OrderHistoryPage>>(idleState);
  const [form, setForm] = useState<OrderFormState | null>(null);
  const [assignment, setAssignment] = useState<OrderAssignmentState>({ pending: false, error: null });
  const [material, setMaterial] = useState<OrderMaterialState>({ pending: false, error: null });
  const [action, setAction] = useState<OrderOperationState>(() => idleOperation());
  const [evidence, setEvidence] = useState({ pending: false, error: null as string | null });

  const filtersRef = useRef(filters);
  const selectedIdRef = useRef(selectedOrderId);
  const listRef = useRef(list);
  const detailRef = useRef(detail);
  const formRef = useRef(form);
  const canManageRef = useRef(capabilities.canManage);
  const capabilitiesRef = useRef(capabilities);
  const actionRef = useRef(action);
  const mutationPendingRef = useRef(false);
  const formGenerationRef = useRef(0);
  const assignmentPendingRef = useRef(false);
  const assignmentGenerationRef = useRef(0);
  const materialPendingRef = useRef(false);
  const materialGenerationRef = useRef(0);
  const actionPendingRef = useRef(false);
  const evidenceDownloadControllerRef = useRef<AbortController | null>(null);
  const evidenceGenerationRef = useRef(0);
  const evidenceMutationRef = useRef<"upload" | "download" | "archive" | null>(null);
  const actionGenerationRef = useRef(0);
  const appliedSearchRef = useRef(initialSearch);
  const controllers = useRef({
    list: null as AbortController | null,
    detail: null as AbortController | null,
    catalog: null as AbortController | null,
    history: null as AbortController | null,
  });
  const generations = useRef({ list: 0, detail: 0, catalog: 0, history: 0 });
  const confirmedOrders = useRef(new Map<string, OrderDetail>());
  const confirmedRows = useRef(new Map<string, Order>());

  const acceptRow = useCallback((incoming: Order) => {
    const confirmed = confirmedRows.current.get(incoming.id);
    if (confirmed && confirmed.version > incoming.version) return confirmed;
    confirmedRows.current.set(incoming.id, incoming);
    return incoming;
  }, []);

  const acceptOrder = useCallback((incoming: OrderDetail) => {
    const confirmed = confirmedOrders.current.get(incoming.id);
    if (confirmed && confirmed.version > incoming.version) return confirmed;
    confirmedOrders.current.set(incoming.id, incoming);
    acceptRow(incoming);
    return incoming;
  }, [acceptRow]);

  const invalidateOrderReads = useCallback(() => {
    controllers.current.detail?.abort();
    controllers.current.list?.abort();
    generations.current.detail += 1;
    generations.current.list += 1;
  }, []);

  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { selectedIdRef.current = selectedOrderId; }, [selectedOrderId]);
  useEffect(() => { listRef.current = list; }, [list]);
  useEffect(() => { detailRef.current = detail; }, [detail]);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { canManageRef.current = capabilities.canManage; }, [capabilities.canManage]);
  useEffect(() => { capabilitiesRef.current = capabilities; }, [capabilities]);
  useEffect(() => { actionRef.current = action; }, [action]);

  const clearSelectedOrder = useCallback((
    expectedId: string | null,
    historyMode: "none" | "push" | "replace" = "none",
  ) => {
    if (expectedId !== null && selectedIdRef.current !== expectedId) return;
    controllers.current.detail?.abort();
    controllers.current.history?.abort();
    evidenceDownloadControllerRef.current?.abort();
    evidenceDownloadControllerRef.current = null;
    generations.current.detail += 1;
    generations.current.history += 1;
    evidenceGenerationRef.current += 1;
    evidenceMutationRef.current = null;
    formGenerationRef.current += 1;
    mutationPendingRef.current = false;
    assignmentGenerationRef.current += 1;
    assignmentPendingRef.current = false;
    actionGenerationRef.current += 1;
    actionPendingRef.current = false;
    materialGenerationRef.current += 1;
    materialPendingRef.current = false;
    selectedIdRef.current = null;
    setSelectedOrderId(null);
    setDetail(idleState());
    setHistory(idleState());
    setEvidence({ pending: false, error: null });
    setForm(null);
    setAssignment({ pending: false, error: null });
    setMaterial({ pending: false, error: null });
    actionRef.current = idleOperation();
    setAction(actionRef.current);
    if (historyMode !== "none") {
      window.history[historyMode === "push" ? "pushState" : "replaceState"](
        window.history.state,
        "",
        urlFor({ filters: filtersRef.current, orderId: null }),
      );
    }
  }, []);

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
      const confirmed = { ...data, items: data.items.map(acceptRow) };
      listRef.current = { status: "success", data: confirmed, error: null, stale: false };
      setList(listRef.current);
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error) || generation !== generations.current.list) return;
      if (error instanceof ApiClientError && error.status === 403) {
        setViewForbidden(true);
        return;
      }
      const previous = listRef.current.data;
      setList({
        status: previous ? "success" : "error",
        data: previous,
        error: errorMessage(error, "No fue posible cargar las órdenes"),
        stale: previous !== null,
      });
    }
  }, [acceptRow, api, capabilities.canView]);

  const loadDetail = useCallback(async (
    id: string,
    silent = false,
  ): Promise<OrderDetail | undefined> => {
    if (!capabilities.canView) return;
    controllers.current.detail?.abort();
    const controller = new AbortController();
    controllers.current.detail = controller;
    const generation = ++generations.current.detail;
    if (!silent) {
      setDetail({ status: "loading", data: null, error: null, stale: false });
    }
    try {
      const incoming = await api.detail(id, controller.signal);
      if (
        controller.signal.aborted
        || generation !== generations.current.detail
        || selectedIdRef.current !== id
      ) return;
      const data = acceptOrder(incoming);
      detailRef.current = { status: "success", data, error: null, stale: false };
      setDetail(detailRef.current);
      return data;
    } catch (error: unknown) {
      if (
        controller.signal.aborted
        || isAbortError(error)
        || generation !== generations.current.detail
        || selectedIdRef.current !== id
      ) return;
      if (error instanceof ApiClientError && error.status === 403) {
        setViewForbidden(true);
        return;
      }
      if (error instanceof ApiClientError && error.status === 404) {
        clearSelectedOrder(id, "replace");
        return;
      }
      const previous = detailRef.current.data;
      setDetail({
        status: silent && previous ? "success" : "error",
        data: previous,
        error: errorMessage(error, "No fue posible cargar la orden"),
        stale: silent && previous !== null,
      });
    }
  }, [acceptOrder, api, capabilities.canView, clearSelectedOrder]);

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
      if (error instanceof ApiClientError && error.status === 403) {
        setCatalog(idleState());
        setViewForbidden(true);
        return;
      }
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
      if (
        controller.signal.aborted
        || isAbortError(error)
        || generation !== generations.current.history
        || selectedIdRef.current !== id
      ) return;
      if (error instanceof ApiClientError && error.status === 403) {
        setHistory(idleState());
        setViewForbidden(true);
        return;
      }
      if (error instanceof ApiClientError && error.status === 404) {
        clearSelectedOrder(id, "replace");
        return;
      }
      setHistory((current) => ({
        status: current.data ? "success" : "error",
        data: current.data,
        error: errorMessage(error, "No fue posible cargar el historial"),
        stale: current.data !== null,
      }));
    }
  }, [api, capabilities.canView, clearSelectedOrder]);

  const refreshList = useCallback(() => loadList(), [loadList]);
  const refreshDetail = useCallback(async (): Promise<void> => {
    const id = selectedIdRef.current;
    if (id) await loadDetail(id, true);
  }, [loadDetail]);
  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([loadList(), refreshDetail(), loadCatalog()]);
  }, [loadCatalog, loadList, refreshDetail]);

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
      const sameOrder = parsed.orderId === selectedIdRef.current;
      controllers.current.detail?.abort();
      controllers.current.history?.abort();
      evidenceDownloadControllerRef.current?.abort();
      evidenceDownloadControllerRef.current = null;
      generations.current.detail += 1;
      generations.current.history += 1;
      evidenceGenerationRef.current += 1;
      evidenceMutationRef.current = null;
      formGenerationRef.current += 1;
      mutationPendingRef.current = false;
      assignmentGenerationRef.current += 1;
      assignmentPendingRef.current = false;
      filtersRef.current = parsed.filters;
      selectedIdRef.current = parsed.orderId;
      setFiltersState(parsed.filters);
      setSelectedOrderId(parsed.orderId);
      setDetail(idleState());
      setHistory(idleState());
      setEvidence({ pending: false, error: null });
      setForm(null);
      setAssignment({ pending: false, error: null });
      actionGenerationRef.current += 1;
      materialGenerationRef.current += 1;
      materialPendingRef.current = false;
      setMaterial({ pending: false, error: null });
      actionPendingRef.current = false;
      actionRef.current = idleOperation();
      setAction(actionRef.current);
      if (sameOrder && parsed.orderId) void loadDetail(parsed.orderId);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [loadDetail]);

  useEffect(() => {
    if (capabilities.canView) return;
    Object.values(controllers.current).forEach((controller) => controller?.abort());
    Object.keys(generations.current).forEach((key) => {
      generations.current[key as keyof typeof generations.current] += 1;
    });
    clearSelectedOrder(null, "replace");
    confirmedOrders.current.clear();
    confirmedRows.current.clear();
    setList(idleState());
    setCatalog(idleState());
  }, [capabilities.canView, clearSelectedOrder]);

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
    formGenerationRef.current += 1;
    mutationPendingRef.current = false;
    setForm(null);
    assignmentGenerationRef.current += 1;
    assignmentPendingRef.current = false;
    setAssignment({ pending: false, error: null });
  }, [capabilities.canManage]);

  useEffect(() => {
    if (capabilities.canLookupClients) return;
    formGenerationRef.current += 1;
    mutationPendingRef.current = false;
    formRef.current = null;
    setForm(null);
  }, [capabilities.canLookupClients]);

  useEffect(() => {
    if (capabilities.canManage || capabilities.canOperateOwn) return;
    materialGenerationRef.current += 1;
    materialPendingRef.current = false;
    setMaterial({ pending: false, error: null });
  }, [capabilities.canManage, capabilities.canOperateOwn]);

  useEffect(() => {
    if (capabilities.canManage || capabilities.canOperateOwn) return;
    actionGenerationRef.current += 1;
    actionPendingRef.current = false;
    actionRef.current = idleOperation();
    setAction(actionRef.current);
  }, [capabilities.canManage, capabilities.canOperateOwn]);

  useEffect(() => () => {
    Object.values(controllers.current).forEach((controller) => controller?.abort());
    Object.keys(generations.current).forEach((key) => {
      generations.current[key as keyof typeof generations.current] += 1;
    });
    formGenerationRef.current += 1;
    mutationPendingRef.current = false;
    assignmentGenerationRef.current += 1;
    assignmentPendingRef.current = false;
    materialGenerationRef.current += 1;
    materialPendingRef.current = false;
    actionGenerationRef.current += 1;
    actionPendingRef.current = false;
    evidenceGenerationRef.current += 1;
    evidenceMutationRef.current = null;
    evidenceDownloadControllerRef.current?.abort();
    evidenceDownloadControllerRef.current = null;
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
    evidenceDownloadControllerRef.current?.abort();
    evidenceDownloadControllerRef.current = null;
    evidenceGenerationRef.current += 1;
    evidenceMutationRef.current = null;
    setEvidence({ pending: false, error: null });
    generations.current.detail += 1;
    generations.current.history += 1;
    formGenerationRef.current += 1;
    mutationPendingRef.current = false;
    setForm(null);
    assignmentGenerationRef.current += 1;
    assignmentPendingRef.current = false;
    setAssignment({ pending: false, error: null });
    selectedIdRef.current = normalized;
    setSelectedOrderId(normalized);
    setDetail(idleState());
    setHistory(idleState());
    actionGenerationRef.current += 1;
    materialGenerationRef.current += 1;
    materialPendingRef.current = false;
    setMaterial({ pending: false, error: null });
    actionPendingRef.current = false;
    actionRef.current = idleOperation();
    setAction(actionRef.current);
    window.history.pushState(
      window.history.state,
      "",
      urlFor({ filters: filtersRef.current, orderId: normalized }),
    );
  }, []);

  const closeDetail = useCallback(() => {
    clearSelectedOrder(selectedIdRef.current, "push");
  }, [clearSelectedOrder]);

  const invalidateEvidenceRead = useCallback((status: 403 | 404) => {
    evidenceDownloadControllerRef.current?.abort();
    if (status === 403) setEvidenceViewForbidden(true);
    else setEvidenceMissingOrder(selectedIdRef.current);
    setEvidence({ pending: false, error: "La evidencia consultada ya no está disponible para tu perfil." });
  }, []);

  const invalidateLookup = useCallback((kind: "clients" | "technicians") => {
    setLookupForbidden((current) => ({ ...current, [kind]: true }));
    if (kind === "clients") {
      formGenerationRef.current += 1;
      mutationPendingRef.current = false;
      formRef.current = null; setForm(null);
    }
  }, []);

  const openCreate = useCallback(() => {
    if (!canManageRef.current || !catalog.data) return;
    setForm({ mode: "create", order: null, pending: false, error: null, fieldErrors: [], conflict: false });
  }, [catalog.data]);

  const openEdit = useCallback(() => {
    const current = detailRef.current.data;
    if (!canManageRef.current || !current || !["PENDING", "ASSIGNED"].includes(current.status)) return;
    setForm({ mode: "edit", order: current, pending: false, error: null, fieldErrors: [], conflict: false });
  }, []);

  const closeForm = useCallback(() => {
    if (mutationPendingRef.current) return;
    formGenerationRef.current += 1;
    setForm(null);
  }, []);

  const reviewOrderConflict = useCallback(() => {
    const current = formRef.current;
    if (!current?.conflict || !current.conflictOrder || mutationPendingRef.current) return;
    formRef.current = { ...current, order: current.conflictOrder, conflict: false, conflictOrder: null };
    setForm(formRef.current);
  }, []);

  const reloadOrderConflict = useCallback(async () => {
    const current = formRef.current;
    if (!current?.conflict || !current.order || mutationPendingRef.current) return;
    const generation = formGenerationRef.current;
    setForm((state) => state ? { ...state, pending: true } : null);
    const fresh = await loadDetail(current.order.id, true);
    if (generation !== formGenerationRef.current) return;
    setForm((state) => state ? { ...state, pending: false, conflictOrder: fresh ?? null } : null);
  }, [loadDetail]);

  const submitOrder = useCallback(async (
    input: CreateOrderInput | Omit<UpdateOrderInput, "version">,
  ): Promise<boolean> => {
    const currentForm = formRef.current;
    if (!currentForm || currentForm.conflict || !canManageRef.current || mutationPendingRef.current) return false;
    const targetOrderId = currentForm.order?.id ?? null;
    const generation = ++formGenerationRef.current;
    const mutationIsCurrent = () => generation === formGenerationRef.current
      && canManageRef.current
      && (currentForm.mode === "create" || selectedIdRef.current === targetOrderId);
    mutationPendingRef.current = true;
    setForm((current) => current ? { ...current, pending: true, error: null, fieldErrors: [], conflict: false } : null);
    try {
      const currentDetail = detailRef.current.data;
      const incoming = currentForm.mode === "create"
        ? await api.create(input as CreateOrderInput)
        : currentDetail && currentDetail.id === currentForm.order?.id
          ? await api.update(currentDetail.id, { ...input, version: currentForm.order!.version })
          : null;
      if (!incoming || !mutationIsCurrent()) return false;
      invalidateOrderReads();
      const confirmed = acceptOrder(incoming);
      selectedIdRef.current = incoming.id;
      setSelectedOrderId(incoming.id);
      detailRef.current = { status: "success", data: confirmed, error: null, stale: false };
      setDetail(detailRef.current);
      setList((current) => current.data ? {
        ...current,
        status: "success",
        data: {
          ...current.data,
          items: current.data.items.some((item) => item.id === incoming.id)
            ? current.data.items.map((item) => item.id === incoming.id ? acceptRow(confirmed) : item)
            : [acceptRow(confirmed), ...current.data.items],
        },
      } : current);
      setForm(null);
      window.history.pushState(window.history.state, "", urlFor({ filters: filtersRef.current, orderId: incoming.id }));
      return true;
    } catch (error: unknown) {
      if (!mutationIsCurrent()) return false;
      if (error instanceof ApiClientError && error.status === 403) {
        canManageRef.current = false;
        setManagementForbidden(true);
        controllers.current.catalog?.abort();
        generations.current.catalog += 1;
        setCatalog(idleState());
        setForm(null);
        return false;
      }
      if (error instanceof ApiClientError && error.status === 404 && targetOrderId) {
        clearSelectedOrder(targetOrderId, "replace");
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
      if (conflict && currentForm.mode === "edit") {
        const refreshed = targetOrderId ? await loadDetail(targetOrderId, true) : undefined;
        if (mutationIsCurrent() && refreshed?.id === targetOrderId) {
          setForm((current) => current ? { ...current, conflictOrder: refreshed } : null);
        }
      }
      return false;
    } finally {
      if (generation === formGenerationRef.current) {
        mutationPendingRef.current = false;
        setForm((current) => current ? { ...current, pending: false } : null);
      }
    }
  }, [acceptOrder, acceptRow, api, clearSelectedOrder, invalidateOrderReads, loadDetail]);

  const applyOrderResult = useCallback((incoming: OrderDetail, targetOrderId: string, updateDetail = true) => {
    invalidateOrderReads();
    incoming = acceptOrder(incoming);
    if (updateDetail && selectedIdRef.current === targetOrderId && incoming.id === targetOrderId) {
      detailRef.current = { status: "success", data: incoming, error: null, stale: false };
      setDetail(detailRef.current);
    }
    setList((current) => {
      if (!current.data?.items.some((item) => item.id === incoming.id)) return current;
      const next = {
        ...current,
        status: "success" as const,
        data: { ...current.data, items: current.data.items.map((item) => item.id === incoming.id ? acceptRow(incoming) : item) },
      };
      listRef.current = next;
      return next;
    });
  }, [acceptOrder, acceptRow, invalidateOrderReads]);

  const assignmentErrorMessage = useCallback((error: unknown): string => {
    if (!(error instanceof ApiClientError)) return errorMessage(error, "No fue posible actualizar el equipo");
    const messages: Record<string, string> = {
      TECHNICIAN_BUSY: "El técnico ya tiene otro trabajo operativo.",
      TECHNICIAN_ALREADY_ASSIGNED: "El técnico ya participa en esta orden.",
      TECHNICIAN_NOT_ASSIGNED: "El técnico ya no está asignado a esta orden.",
      PRIMARY_TECHNICIAN_REQUIRED: "La orden requiere un técnico principal.",
      INVALID_ORDER_TRANSITION: "El estado actual de la orden no permite cambiar el equipo.",
    };
    return messages[error.code] ?? error.message ?? "No fue posible actualizar el equipo";
  }, []);

  const executeAssignment = useCallback(async (
    operation: (current: OrderDetail) => Promise<OrderDetail>,
  ): Promise<boolean> => {
    const current = detailRef.current.data;
    if (!current || !canManageRef.current || assignmentPendingRef.current) return false;
    const targetOrderId = current.id;
    const generation = ++assignmentGenerationRef.current;
    const mutationIsCurrent = () => generation === assignmentGenerationRef.current
      && selectedIdRef.current === targetOrderId
      && canManageRef.current;
    assignmentPendingRef.current = true;
    setAssignment({ pending: true, error: null });
    try {
      const incoming = await operation(current);
      if (!mutationIsCurrent()) return false;
      applyOrderResult(incoming, targetOrderId);
      void loadList();
      setAssignment({ pending: false, error: null });
      return true;
    } catch (error: unknown) {
      if (!mutationIsCurrent()) return false;
      if (error instanceof ApiClientError && error.status === 403) {
        canManageRef.current = false;
        setManagementForbidden(true);
      }
      if (error instanceof ApiClientError && error.status === 404) {
        clearSelectedOrder(targetOrderId, "replace");
        return false;
      }
      const versionConflict = error instanceof ApiClientError
        && error.status === 409
        && error.code === "VERSION_CONFLICT";
      setAssignment({ pending: false, error: versionConflict ? "La orden cambió en el servidor. Revisa el equipo actualizado." : assignmentErrorMessage(error) });
      if (versionConflict) await refreshDetail();
      return false;
    } finally {
      if (generation === assignmentGenerationRef.current) {
        assignmentPendingRef.current = false;
        setAssignment((currentState) => ({ ...currentState, pending: false }));
      }
    }
  }, [applyOrderResult, assignmentErrorMessage, clearSelectedOrder, loadList, refreshDetail]);

  const assignTechnician = useCallback((technicianId: string, role: OrderTechnicianRole) => executeAssignment(
    (current) => api.assign(current.id, { technicianId, role, version: current.version }),
  ), [api, executeAssignment]);

  const unassignTechnician = useCallback((technicianId: string, reason: string) => executeAssignment(
    (current) => api.unassign(current.id, technicianId, { reason, version: current.version }),
  ), [api, executeAssignment]);

  const executeMaterial = useCallback(async (
    operation: (current: OrderDetail) => Promise<OrderDetail>,
  ): Promise<boolean> => {
    const current = detailRef.current.data;
    const canManageMaterials = current
      && allowedOrderActions(current, capabilitiesRef.current, currentTechnicianId).includes("manageMaterials");
    if (!current || !canManageMaterials || materialPendingRef.current) return false;
    const targetOrderId = current.id;
    const generation = ++materialGenerationRef.current;
    const mutationIsCurrent = () => {
      const latest = detailRef.current.data;
      return generation === materialGenerationRef.current
        && selectedIdRef.current === targetOrderId
        && latest?.id === targetOrderId
        && allowedOrderActions(latest, capabilitiesRef.current, currentTechnicianId).includes("manageMaterials");
    };
    materialPendingRef.current = true;
    setMaterial({ pending: true, error: null });
    try {
      const incoming = await operation(current);
      if (!mutationIsCurrent()) return false;
      applyOrderResult(incoming, targetOrderId);
      void loadList();
      setMaterial({ pending: false, error: null });
      return true;
    } catch (error: unknown) {
      if (!mutationIsCurrent()) return false;
      const forbidden = error instanceof ApiClientError && error.status === 403;
      if (forbidden) {
        capabilitiesRef.current = {
          ...capabilitiesRef.current,
          canManage: false,
          canOperateOwn: false,
        };
        canManageRef.current = false;
        setOperationsForbidden(true);
      }
      if (error instanceof ApiClientError && error.status === 404) {
        clearSelectedOrder(targetOrderId, "replace");
        return false;
      }
      const versionConflict = error instanceof ApiClientError
        && error.status === 409
        && error.code === "VERSION_CONFLICT";
      if (generation === materialGenerationRef.current) {
        setMaterial({
          pending: false,
          error: versionConflict
            ? "La orden cambió en el servidor. Revisa los materiales actualizados."
            : errorMessage(error, "No fue posible actualizar los materiales"),
        });
      }
      if (versionConflict && selectedIdRef.current === targetOrderId) await refreshDetail();
      return false;
    } finally {
      if (generation === materialGenerationRef.current) {
        materialPendingRef.current = false;
        setMaterial((currentState) => ({ ...currentState, pending: false }));
      }
    }
  }, [applyOrderResult, clearSelectedOrder, currentTechnicianId, loadList, refreshDetail]);

  const addMaterial = useCallback((input: Omit<MaterialInput, "version">) => executeMaterial(
    (current) => api.addMaterial(current.id, { ...input, version: current.version }),
  ), [api, executeMaterial]);

  const updateMaterial = useCallback((usageId: string, input: Omit<UpdateMaterialInput, "version">) => executeMaterial(
    (current) => api.updateMaterial(current.id, usageId, { ...input, version: current.version }),
  ), [api, executeMaterial]);

  const removeMaterial = useCallback((usageId: string) => executeMaterial(
    (current) => api.removeMaterial(current.id, usageId, { version: current.version }),
  ), [api, executeMaterial]);

  const openOrderAction = useCallback((requested: OrderDialogAction) => {
    const current = detailRef.current.data;
    if (!current || actionPendingRef.current) return;
    const allowed = allowedOrderActions(current, capabilitiesRef.current, currentTechnicianId);
    if (!allowed.includes(requested)) return;
    actionRef.current = {
      pending: false,
      error: null,
      dialog: requested,
      targetOrderId: current.id,
      targetVersion: current.version,
    };
    setAction(actionRef.current);
  }, [currentTechnicianId]);

  const closeOrderAction = useCallback(() => {
    if (actionPendingRef.current) return;
    actionGenerationRef.current += 1;
    actionRef.current = idleOperation();
    setAction(actionRef.current);
  }, []);

  const executeOrderAction = useCallback(async (
    requested: OrderOperationalAction,
    input: OrderActionInput,
  ): Promise<boolean> => {
    const current = detailRef.current.data;
    if (!current || actionPendingRef.current) return false;
    const allowed = allowedOrderActions(current, capabilitiesRef.current, currentTechnicianId);
    if (!allowed.includes(requested)) return false;
    const dialogTarget = actionRef.current.dialog === requested
      && actionRef.current.targetOrderId === current.id
      ? actionRef.current
      : null;
    const targetOrderId = current.id;
    const targetVersion = dialogTarget?.targetVersion ?? current.version;
    const generation = ++actionGenerationRef.current;
    const mutationIsCurrent = () => {
      const latest = detailRef.current.data;
      return generation === actionGenerationRef.current
        && selectedIdRef.current === targetOrderId
        && latest?.id === targetOrderId
        && allowedOrderActions(latest, capabilitiesRef.current, currentTechnicianId).includes(requested);
    };
    actionPendingRef.current = true;
    actionRef.current = {
      ...actionRef.current,
      pending: true,
      error: null,
      targetOrderId,
      targetVersion,
    };
    setAction(actionRef.current);
    try {
      let incoming: OrderDetail;
      if (requested === "onRoute") incoming = await api.onRoute(targetOrderId, { version: targetVersion });
      else if (requested === "start") incoming = await api.start(targetOrderId, { version: targetVersion });
      else if (requested === "resume") incoming = await api.resume(targetOrderId, { version: targetVersion });
      else if (requested === "pause" && input.comment) incoming = await api.pause(targetOrderId, { comment: input.comment, version: targetVersion });
      else if (requested === "complete" && input.diagnosis && input.result) incoming = await api.complete(targetOrderId, { diagnosis: input.diagnosis, result: input.result, version: targetVersion });
      else if (requested === "cancel" && input.cancellationReason) incoming = await api.cancel(targetOrderId, { cancellationReason: input.cancellationReason, version: targetVersion });
      else if (requested === "adjust" && input.reason) incoming = await api.adjust(targetOrderId, {
        reason: input.reason,
        description: input.description,
        scheduledFor: input.scheduledFor,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        diagnosis: input.diagnosis,
        result: input.result,
        cancellationReason: input.cancellationReason,
        estimatedMinutes: input.estimatedMinutes,
        version: targetVersion,
      });
      else return false;
      if (!mutationIsCurrent()) return false;
      applyOrderResult(incoming, targetOrderId);
      void loadList();
      actionRef.current = idleOperation();
      setAction(actionRef.current);
      return true;
    } catch (error: unknown) {
      if (!mutationIsCurrent()) return false;
      const forbidden = error instanceof ApiClientError && error.status === 403;
      if (forbidden) {
        capabilitiesRef.current = {
          ...capabilitiesRef.current,
          canManage: false,
          canOperateOwn: false,
        };
        canManageRef.current = false;
        setOperationsForbidden(true);
      }
      if (error instanceof ApiClientError && error.status === 404) {
        clearSelectedOrder(targetOrderId, "replace");
        return false;
      }
      const versionConflict = error instanceof ApiClientError
        && error.status === 409
        && error.code === "VERSION_CONFLICT";
      const message = versionConflict
        ? "La orden cambió en el servidor. Revisa la versión actual antes de continuar."
        : errorMessage(error, "No fue posible actualizar el estado de la orden");
      if (versionConflict && actionRef.current.dialog) {
        actionRef.current = { ...actionRef.current, pending: true, error: message };
        setAction(actionRef.current);
      }
      if (versionConflict && selectedIdRef.current === targetOrderId) await refreshDetail();
      if (generation !== actionGenerationRef.current) return false;
      if (versionConflict) {
        const refreshed = detailRef.current.data;
        const canRetry = actionRef.current.dialog === requested
          && refreshed?.id === targetOrderId
          && allowedOrderActions(refreshed, capabilitiesRef.current, currentTechnicianId).includes(requested);
        actionRef.current = canRetry
          ? { ...actionRef.current, pending: false, error: message, targetVersion: refreshed.version }
          : idleOperation(message);
      } else {
        actionRef.current = forbidden
          ? idleOperation(message)
          : { ...actionRef.current, pending: false, error: message };
      }
      setAction(actionRef.current);
      return false;
    } finally {
      if (generation === actionGenerationRef.current) {
        actionPendingRef.current = false;
        if (actionRef.current.pending) {
          actionRef.current = { ...actionRef.current, pending: false };
          setAction(actionRef.current);
        }
      }
    }
  }, [api, applyOrderResult, clearSelectedOrder, currentTechnicianId, loadList, refreshDetail]);

  useEffect(() => {
    const open = actionRef.current;
    const current = detail.data;
    if (!open.dialog) return;
    const stillAllowed = current
      && current.id === open.targetOrderId
      && allowedOrderActions(current, capabilities, currentTechnicianId).includes(open.dialog);
    if (stillAllowed) return;
    actionGenerationRef.current += 1;
    actionPendingRef.current = false;
    actionRef.current = idleOperation(
      open.error ?? "La orden cambió y esta acción ya no está disponible.",
    );
    setAction(actionRef.current);
  }, [capabilities, currentTechnicianId, detail.data]);

  useEffect(() => {
    if (capabilities.canViewEvidence) return;
    evidenceGenerationRef.current += 1;
    evidenceDownloadControllerRef.current?.abort();
    evidenceDownloadControllerRef.current = null;
    evidenceMutationRef.current = null;
    setEvidence((current) => current.pending || current.error ? { pending: false, error: null } : current);
  }, [capabilities.canViewEvidence]);

  useEffect(() => {
    if (capabilities.canUploadEvidence || evidenceMutationRef.current !== "upload") return;
    evidenceGenerationRef.current += 1;
    evidenceMutationRef.current = null;
    setEvidence({ pending: false, error: null });
  }, [capabilities.canUploadEvidence]);

  useEffect(() => {
    if (capabilities.canManageEvidence || evidenceMutationRef.current !== "archive") return;
    evidenceGenerationRef.current += 1;
    evidenceMutationRef.current = null;
    setEvidence({ pending: false, error: null });
  }, [capabilities.canManageEvidence]);

  const uploadEvidence = useCallback(async (input: EvidenceUploadInput): Promise<boolean> => {
    const targetId = selectedIdRef.current;
    if (!targetId || !capabilitiesRef.current.canUploadEvidence || evidence.pending) return false;
    if (input.accessLevel === "INTERNAL" && !capabilitiesRef.current.canManageEvidence) return false;
    const generation = evidenceGenerationRef.current;
    evidenceMutationRef.current = "upload";
    setEvidence({ pending: true, error: null });
    try {
      await rawEvidenceApi.uploadOrder(targetId, input);
      if (generation !== evidenceGenerationRef.current || selectedIdRef.current !== targetId || !capabilitiesRef.current.canUploadEvidence || (input.accessLevel === "INTERNAL" && !capabilitiesRef.current.canManageEvidence)) return false;
      setEvidence({ pending: false, error: null });
      evidenceMutationRef.current = null;
      return true;
    } catch (error: unknown) {
      if (generation !== evidenceGenerationRef.current || selectedIdRef.current !== targetId) return false;
      if (error instanceof ApiClientError && error.status === 403) {
        setEvidenceUploadForbidden(true);
        setEvidence({ pending: false, error: "No tienes permiso para subir evidencia." });
      } else setEvidence({ pending: false, error: errorMessage(error, "No fue posible subir la evidencia.") });
      evidenceMutationRef.current = null;
      return false;
    }
  }, [evidence.pending, rawEvidenceApi]);

  const downloadEvidence = useCallback(async (item: Evidence): Promise<boolean> => {
    if (!capabilitiesRef.current.canViewEvidence || evidence.pending) return false;
    const targetId = selectedIdRef.current;
    if (!targetId) return false;
    const generation = evidenceGenerationRef.current;
    const controller = new AbortController();
    evidenceDownloadControllerRef.current?.abort();
    evidenceDownloadControllerRef.current = controller;
    evidenceMutationRef.current = "download";
    setEvidence({ pending: true, error: null });
    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const downloaded = await rawEvidenceApi.download(item.id, controller.signal);
      if (!capabilitiesRef.current.canViewEvidence || controller.signal.aborted || generation !== evidenceGenerationRef.current || selectedIdRef.current !== targetId) return false;
      const fallback = safeDownloadName(item.originalName, "evidencia");
      const filename = safeDownloadName(downloaded.filename ?? "", fallback);
      objectUrl = URL.createObjectURL(downloaded.blob);
      anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = filename; anchor.hidden = true; document.body.append(anchor); anchor.click();
      setEvidence({ pending: false, error: null });
      return true;
    } catch (error: unknown) {
      if (generation !== evidenceGenerationRef.current || selectedIdRef.current !== targetId) return false;
      if (error instanceof ApiClientError && error.status === 403) { setEvidenceViewForbidden(true); setEvidence({ pending: false, error: "No tienes permiso para descargar evidencia." }); }
      else if (!(error instanceof Error && error.name === "AbortError")) setEvidence({ pending: false, error: errorMessage(error, "No fue posible descargar la evidencia.") });
      return false;
    } finally {
      anchor?.remove(); if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (evidenceDownloadControllerRef.current === controller) evidenceDownloadControllerRef.current = null;
      if (generation === evidenceGenerationRef.current && evidenceMutationRef.current === "download") evidenceMutationRef.current = null;
    }
  }, [evidence.pending, rawEvidenceApi]);

  const archiveEvidence = useCallback(async (item: Evidence, reason: string): Promise<boolean> => {
    if (!capabilitiesRef.current.canManageEvidence || evidence.pending) return false;
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) return false;
    const targetId = selectedIdRef.current;
    if (!targetId) return false;
    const generation = evidenceGenerationRef.current;
    evidenceMutationRef.current = "archive";
    setEvidence({ pending: true, error: null });
    try {
      await rawEvidenceApi.archive(item.id, { version: item.version, reason: normalizedReason });
      if (!capabilitiesRef.current.canManageEvidence || generation !== evidenceGenerationRef.current || selectedIdRef.current !== targetId) return false;
      setEvidence({ pending: false, error: null });
      evidenceMutationRef.current = null;
      return true;
    } catch (error: unknown) {
      if (generation !== evidenceGenerationRef.current || selectedIdRef.current !== targetId) return false;
      if (error instanceof ApiClientError && error.status === 403) { setEvidenceManageForbidden(true); setEvidence({ pending: false, error: "No tienes permiso para archivar evidencia." }); }
      else setEvidence({ pending: false, error: errorMessage(error, "No fue posible archivar la evidencia.") });
      evidenceMutationRef.current = null;
      return false;
    }
  }, [evidence.pending, rawEvidenceApi]);

  return {
    filters,
    selectedOrderId,
    capabilities,
    currentTechnicianId,
    list,
    detail,
    catalog,
    history,
    form,
    assignment,
    material,
    action,
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
    reviewOrderConflict,
    reloadOrderConflict,
    submitOrder,
    assignTechnician,
    unassignTechnician,
    addMaterial,
    updateMaterial,
    removeMaterial,
    openOrderAction,
    closeOrderAction,
    executeOrderAction,
    evidenceApi: rawEvidenceApi,
    ordersApi: api,
    evidence,
    uploadEvidence,
    downloadEvidence,
    archiveEvidence,
    invalidateEvidenceRead,
    invalidateLookup,
  };
}
