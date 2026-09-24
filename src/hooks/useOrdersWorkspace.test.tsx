import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderLookupApi } from "../api/order-lookups";
import type { OrderEvidenceApi } from "../api/evidences";
import { ApiClientError } from "../api/http";
import type { OrdersApi } from "../api/orders";
import { AuthContext } from "../auth/AuthContext";
import type { AuthUser } from "../models/auth";
import type { Evidence } from "../models/evidence";
import type { OrderDetail, OrderPage } from "../models/order";
import { authContext } from "../test/auth-test-utils";
import { useOrdersWorkspace } from "./useOrdersWorkspace";

const order: OrderDetail = {
  id: "order-1",
  orderNumber: "OT-2026-0001",
  client: { id: "client-1", code: "CLI-1", tradeName: "Acme" },
  branch: { id: "branch-1", code: "MAIN", name: "Principal" },
  serviceType: { id: "service-1", code: "SUPPORT", name: "Soporte" },
  priority: "HIGH",
  status: "ASSIGNED",
  reportedProblem: "Sin red",
  scheduledFor: null,
  primaryTechnician: { id: "tech-1", code: "TEC-1", fullName: "Ana" },
  supportCount: 0,
  overdue: false,
  startedAt: null,
  endedAt: null,
  estimatedMinutes: 60,
  totalMinutes: null,
  createdAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
  version: 1,
  description: null,
  diagnosis: null,
  result: null,
  cancellationReason: null,
  participants: [],
  materials: [],
};
const page: OrderPage = {
  items: [order],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};
const catalog = { serviceTypes: [], materials: [] };

function apiMock(overrides: Partial<OrdersApi> = {}): OrdersApi {
  return {
    list: vi.fn(async () => page),
    detail: vi.fn(async () => order),
    history: vi.fn(async () => ({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    })),
    ...overrides,
  } as OrdersApi;
}

function lookupMock(overrides: Partial<OrderLookupApi> = {}): OrderLookupApi {
  return {
    catalog: vi.fn(async () => catalog),
    clients: vi.fn(),
    branches: vi.fn(),
    technicians: vi.fn(),
    ...overrides,
  } as OrderLookupApi;
}

function user(permissions: string[]): AuthUser {
  return {
    id: "user-1",
    email: "user@geek.test",
    displayName: "Usuario",
    mustChangePassword: false,
    technicianId: "tech-1",
    roles: ["TECHNICIAN"],
    permissions,
  };
}

function wrapperFor(getUser: () => AuthUser | null) {
  return function Wrapper({ children }: PropsWithChildren) {
    const currentUser = getUser();
    return (
      <AuthContext.Provider value={authContext({ user: currentUser })}>
        {children}
      </AuthContext.Provider>
    );
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/ordenes");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useOrdersWorkspace", () => {
  it.each([true, false])("residual B: asignación repone la consulta de filtros nuevos (fila presente: %s)", async (rowPresent) => {
    const assigning = deferred<OrderDetail>();
    const interruptedList = deferred<OrderPage>();
    const filteredOrder = { ...order, id: "filtered-order", status: "PAUSED" as const, version: 17 };
    let filteredReads = 0;
    let interruptedSignal: AbortSignal | undefined;
    const api = apiMock({
      list: vi.fn(async (filters, signal) => {
        if (!filters.statuses?.includes("PAUSED")) return { ...page, items: [{ ...order, id: rowPresent ? order.id : "another-order" }] };
        filteredReads += 1;
        if (filteredReads === 1) { interruptedSignal = signal; return interruptedList.promise; }
        return { ...page, items: [filteredOrder] };
      }),
      assign: vi.fn(() => assigning.promise),
    });
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.id).toBe(order.id));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.assignTechnician("tech-2", "SUPPORT"); });
    act(() => result.current.setFilters({ statuses: ["PAUSED"] }));
    await waitFor(() => expect(filteredReads).toBe(1));
    expect(result.current.list.status).toBe("loading");
    await act(async () => { assigning.resolve({ ...order, version: 9 }); await mutation; });
    await waitFor(() => expect(result.current.list.data?.items.map((item) => item.id)).toEqual(["filtered-order"]));
    expect(result.current.list.status).toBe("success");
    expect(result.current.filters.statuses).toEqual(["PAUSED"]);
    expect(interruptedSignal?.aborted).toBe(true);
    await act(async () => { interruptedList.resolve({ ...page, items: [{ ...filteredOrder, version: 3 }] }); await interruptedList.promise; });
    expect(result.current.list.data?.items[0].version).toBe(17);
    expect(result.current.detail.data?.version).toBe(9);
    expect(api.assign).toHaveBeenCalledOnce();
  });
  it("no adopta la versión vieja si falla la recarga del conflicto y permite reintentar lectura", async () => {
    const api = apiMock({ detail: vi.fn().mockResolvedValueOnce({ ...order, version: 3 }).mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValue({ ...order, version: 9 }), update: vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "Conflicto")) });
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    await act(async () => { await result.current.submitOrder({ description: "Mi borrador" }); });
    expect(result.current.form?.conflictOrder ?? null).toBeNull();
    act(() => result.current.reviewOrderConflict?.());
    expect(result.current.form?.conflict).toBe(true);
    await act(async () => { await result.current.reloadOrderConflict?.(); });
    expect(result.current.form?.conflictOrder?.version).toBe(9);
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it("403 auxiliar cierra borrador y desactiva sólo la consulta afectada", async () => {
    const api = apiMock(); const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW", "TECHNICIANS_VIEW"])) });
    await waitFor(() => expect(result.current.catalog.status).toBe("success"));
    act(() => result.current.openCreate());
    act(() => result.current.invalidateLookup?.("clients"));
    expect(result.current.form).toBeNull();
    expect(result.current.capabilities.canLookupClients).toBe(false);
    expect(result.current.capabilities.canLookupTechnicians).toBe(true);
    expect(result.current.capabilities.canManage).toBe(true);
  });

  it("403 de evidencia no revoca carga ni gestión ni lectura de órdenes", async () => {
    const api = apiMock(); const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW", "EVIDENCES_UPLOAD", "EVIDENCES_MANAGE"])) });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.invalidateEvidenceRead?.(403));
    expect(result.current.capabilities.canViewEvidence).toBe(false);
    expect(result.current.capabilities.canUploadEvidence).toBe(true);
    expect(result.current.capabilities.canManageEvidence).toBe(true);
    expect(result.current.capabilities.canView).toBe(true);
  });

  it("404 de evidencia invalida sólo la orden consultada", async () => {
    const api = apiMock({ detail: vi.fn(async (id) => ({ ...order, id })) }); const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW", "EVIDENCES_UPLOAD"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.id).toBe(order.id));
    act(() => result.current.invalidateEvidenceRead?.(404));
    expect(result.current.capabilities.canViewEvidence).toBe(false);
    expect(result.current.capabilities.canUploadEvidence).toBe(true);
    act(() => result.current.selectOrder("order-2"));
    await waitFor(() => expect(result.current.detail.data?.id).toBe("order-2"));
    expect(result.current.capabilities.canViewEvidence).toBe(true);
  });
  it("no retrocede la lista v17 por respuesta de mutación v9", async () => {
    const api = apiMock({ list: vi.fn().mockResolvedValueOnce(page).mockResolvedValue({ ...page, items: [{ ...order, version: 17 }] }), detail: vi.fn().mockResolvedValue({ ...order, version: 3 }), assign: vi.fn().mockResolvedValue({ ...order, version: 9 }) });
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    await act(async () => { await result.current.refreshList(); });
    expect(result.current.list.data?.items[0].version).toBe(17);
    await act(async () => { await result.current.assignTechnician("tech-2", "SUPPORT"); });
    expect(result.current.list.data?.items[0].version).toBe(17);
  });
  it("no permite reintentar edición conflictiva hasta revisar explícitamente v9", async () => {
    const update = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "Conflicto")).mockResolvedValue({ ...order, version: 17 });
    const api = apiMock({ detail: vi.fn().mockResolvedValueOnce({ ...order, version: 3 }).mockResolvedValue({ ...order, version: 9 }), update });
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    await act(async () => { await result.current.submitOrder({ description: "Mi borrador" }); });
    expect(result.current.form?.order?.version).toBe(3);
    expect(result.current.form?.conflictOrder?.version).toBe(9);
    await act(async () => { await result.current.submitOrder({ description: "Mi borrador" }); });
    expect(update).toHaveBeenCalledTimes(1);
    act(() => result.current.reviewOrderConflict?.());
    await act(async () => { await result.current.submitOrder({ description: "Mi borrador" }); });
    expect(update).toHaveBeenLastCalledWith(order.id, { description: "Mi borrador", version: 9 });
    expect(result.current.detail.data?.version).toBe(17);
  });

  it("invalida una edición pendiente al perder permiso de clientes", async () => {
    const pending = deferred<OrderDetail>();
    const api = apiMock({ update: vi.fn(() => pending.promise) }); const lookupApi = lookupMock();
    let currentUser = user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW"]);
    const { result, rerender } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => currentUser) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    act(() => result.current.openEdit());
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.submitOrder({ description: "Privado" }); });
    currentUser = user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]); rerender();
    expect(result.current.form).toBeNull();
    await act(async () => { pending.resolve({ ...order, version: 9 }); await mutation; });
    expect(result.current.detail.data?.version).toBe(1);
  });

  it("rechaza una respuesta cruzada de asignación v9 tras material v17", async () => {
    const late = deferred<OrderDetail>();
    const operating = { ...order, version: 3, status: "IN_PROGRESS" as const };
    const api = apiMock({ detail: vi.fn().mockResolvedValue(operating), assign: vi.fn(() => late.promise), addMaterial: vi.fn().mockResolvedValue({ ...operating, version: 17 }) }); const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    let assigning!: Promise<boolean>;
    act(() => { assigning = result.current.assignTechnician("tech-2", "SUPPORT"); });
    await act(async () => { await result.current.addMaterial({ materialId: "material-1", quantity: "1" }); });
    await act(async () => { late.resolve({ ...operating, version: 9 }); await assigning; });
    expect(result.current.detail.data?.version).toBe(17);
    expect(result.current.list.data?.items[0].version).toBe(17);
  });
  it("no retrocede de v9 a v3 por GET pendiente ni por lista antigua", async () => {
    const stale = deferred<OrderDetail>();
    const api = apiMock({ detail: vi.fn().mockResolvedValueOnce({ ...order, version: 3 }).mockImplementationOnce(() => stale.promise), assign: vi.fn().mockResolvedValue({ ...order, version: 9 }) });
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    let reading!: Promise<void>;
    act(() => { reading = result.current.refreshDetail(); });
    await act(async () => { await result.current.assignTechnician("tech-2", "SUPPORT"); });
    await act(async () => { stale.resolve({ ...order, version: 3 }); await reading; await result.current.refreshList(); });
    expect(result.current.detail.data?.version).toBe(9);
    expect(result.current.list.data?.items[0].version).toBe(9);
  });

  it("conserva v3 como base del borrador aunque una lectura publique v10", async () => {
    const update = vi.fn().mockResolvedValue({ ...order, version: 17 });
    const api = apiMock({ detail: vi.fn().mockResolvedValueOnce({ ...order, version: 3 }).mockResolvedValue({ ...order, version: 10 }), update });
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    await act(async () => { await result.current.refreshDetail(); });
    await act(async () => { await result.current.submitOrder({ reportedProblem: "Borrador propio" }); });
    expect(update).toHaveBeenCalledWith(order.id, { reportedProblem: "Borrador propio", version: 3 });
    expect(result.current.detail.data?.version).toBe(17);
  });

  it("recarga atrás y adelante cuando orderId no cambia", async () => {
    const api = apiMock(); const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL"])) });
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.id).toBe(order.id));
    act(() => { window.history.replaceState({}, "", `/ordenes?orderId=${order.id}&page=2`); window.dispatchEvent(new PopStateEvent("popstate")); });
    await waitFor(() => expect(result.current.detail.data?.id).toBe(order.id));
  });

  it("no abre un formulario invisible sin catálogo y Actualizar recupera el catálogo", async () => {
    const api = apiMock(); const lookupApi = lookupMock({ catalog: vi.fn().mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValue(catalog) });
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"])) });
    await waitFor(() => expect(result.current.catalog.status).toBe("error"));
    act(() => result.current.openCreate());
    expect(result.current.form).toBeNull();
    await act(async () => { await result.current.refresh(); });
    expect(result.current.catalog.status).toBe("success");
  });

  it("mantiene polling visible después de fallar el catálogo y rechazar Nueva orden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const api = apiMock(); const lookupApi = lookupMock({ catalog: vi.fn().mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValue(catalog) });
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi, pollIntervalMs: 1_000 }), { wrapper: wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW"])) });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.catalog.status).toBe("error");
    act(() => result.current.openCreate());
    expect(result.current.form).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(result.current.list.status).toBe("success");
    expect(result.current.catalog.status).toBe("success");
    expect(api.list).toHaveBeenCalledTimes(2);
  });
  it("uploads and downloads order evidence only with the independent evidence permissions", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:order") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
    const evidenceApi: OrderEvidenceApi = {
      listOrder: vi.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })),
      uploadOrder: vi.fn(async () => ({}) as never), listRecurrence: vi.fn(), uploadRecurrence: vi.fn(),
      download: vi.fn(async () => ({ blob: new Blob(["ok"]), filename: "archivo.pdf" })), archive: vi.fn(),
    };
    const api = apiMock();
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW", "EVIDENCES_UPLOAD"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi, evidenceApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    const file = new File(["ok"], "archivo.pdf", { type: "application/pdf" });
    await act(async () => { await result.current.uploadEvidence?.({ file, accessLevel: "TECHNICIAN" }); });
    expect(evidenceApi.uploadOrder).toHaveBeenCalledWith(order.id, { file, accessLevel: "TECHNICIAN" });
    await act(async () => { await result.current.downloadEvidence?.({ id: "e-1", originalName: "archivo.pdf" } as never); });
    expect(evidenceApi.download).toHaveBeenCalledWith("e-1", expect.any(AbortSignal));
  });

  it("clears an upload mutation when upload permission is revoked and recovers", async () => {
    const first = deferred<never>();
    const uploadOrder = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({} as never);
    const evidenceApi: OrderEvidenceApi = {
      listOrder: vi.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })),
      uploadOrder, listRecurrence: vi.fn(), uploadRecurrence: vi.fn(), download: vi.fn(), archive: vi.fn(),
    };
    const api = apiMock();
    const lookupApi = lookupMock();
    let currentUser = user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW", "EVIDENCES_UPLOAD"]);
    const wrapper = wrapperFor(() => currentUser);
    const { result, rerender } = renderHook(() => useOrdersWorkspace({ api, lookupApi, evidenceApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    const input = { file: new File(["ok"], "archivo.pdf", { type: "application/pdf" }), accessLevel: "TECHNICIAN" as const };
    let firstMutation!: Promise<boolean>;
    act(() => { firstMutation = result.current.uploadEvidence!(input); });
    await waitFor(() => expect(result.current.evidence?.pending).toBe(true));
    currentUser = user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW"]);
    rerender();
    await waitFor(() => expect(result.current.evidence?.pending).toBe(false));
    first.resolve(undefined as never);
    await act(async () => { await firstMutation; });
    currentUser = user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW", "EVIDENCES_UPLOAD"]);
    rerender();
    await waitFor(() => expect(result.current.capabilities.canUploadEvidence).toBe(true));
    await act(async () => { await result.current.uploadEvidence!(input); });
    expect(uploadOrder).toHaveBeenCalledTimes(2);
    expect(result.current.evidence?.pending).toBe(false);
  });

  it("clears an archive mutation when manage permission is revoked and recovers", async () => {
    const first = deferred<never>();
    const archive = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({});
    const evidenceApi: OrderEvidenceApi = {
      listOrder: vi.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })),
      uploadOrder: vi.fn(), listRecurrence: vi.fn(), uploadRecurrence: vi.fn(), download: vi.fn(), archive,
    };
    const api = apiMock();
    const lookupApi = lookupMock();
    let currentUser = user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW", "EVIDENCES_MANAGE"]);
    const wrapper = wrapperFor(() => currentUser);
    const { result, rerender } = renderHook(() => useOrdersWorkspace({ api, lookupApi, evidenceApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    const item = { id: "e-1", version: 1 } as Evidence;
    let firstMutation!: Promise<boolean>;
    act(() => { firstMutation = result.current.archiveEvidence!(item, "Motivo suficiente para archivar"); });
    await waitFor(() => expect(result.current.evidence?.pending).toBe(true));
    currentUser = user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW"]);
    rerender();
    await waitFor(() => expect(result.current.evidence?.pending).toBe(false));
    first.resolve(undefined as never);
    await act(async () => { await firstMutation; });
    currentUser = user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW", "EVIDENCES_MANAGE"]);
    rerender();
    await waitFor(() => expect(result.current.capabilities.canManageEvidence).toBe(true));
    await act(async () => { await result.current.archiveEvidence!(item, "Motivo suficiente para archivar"); });
    expect(archive).toHaveBeenCalledTimes(2);
    expect(result.current.evidence?.pending).toBe(false);
  });

  it("creates an order only with management permission and adopts the server response", async () => {
    const created = { ...order, id: "order-2", orderNumber: "OT-2026-0002", version: 1 };
    const api = apiMock({
      create: vi.fn(async () => created),
      detail: vi.fn(async (id) => id === created.id ? created : order),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));

    act(() => result.current.openCreate());
    expect(result.current.form?.mode).toBe("create");
    await act(async () => {
      await result.current.submitOrder({
        branchId: "branch-1", serviceTypeId: "service-1", priority: "HIGH",
        reportedProblem: "Sin red", scheduledFor: null, estimatedMinutes: 60,
      });
    });

    expect(api.create).toHaveBeenCalledOnce();
    expect(result.current.form).toBeNull();
    expect(result.current.selectedOrderId).toBe("order-2");
    expect(result.current.detail.data).toEqual(created);
  });

  it("uses the current version for edit and preserves the draft on validation or conflict", async () => {
    const update = vi.fn<OrdersApi["update"]>()
      .mockRejectedValueOnce(new ApiClientError(422, "VALIDATION_ERROR", "Datos inválidos", [{ field: "reportedProblem", code: "TOO_SHORT", message: "Muy corto" }]))
      .mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "Conflicto"));
    const api = apiMock({ update });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    act(() => result.current.openEdit());

    await act(async () => { await result.current.submitOrder({ reportedProblem: "Nueva descripción" }); });
    expect(update).toHaveBeenLastCalledWith("order-1", { reportedProblem: "Nueva descripción", version: 1 });
    expect(result.current.form?.fieldErrors[0]?.field).toBe("reportedProblem");

    await act(async () => { await result.current.submitOrder({ reportedProblem: "Nueva descripción" }); });
    expect(result.current.form?.conflict).toBe(true);
    expect(result.current.form?.mode).toBe("edit");
    expect(api.detail).toHaveBeenCalledTimes(2);
  });

  it("closes the form and clears catalog data after a forbidden mutation", async () => {
    const api = apiMock({ create: vi.fn(async () => { throw new ApiClientError(403, "FORBIDDEN", "Prohibido"); }) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "CLIENTS_VIEW"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.catalog.status).toBe("success"));
    act(() => result.current.openCreate());
    await act(async () => { await result.current.submitOrder({ branchId: "branch-1", serviceTypeId: "service-1", priority: "MEDIUM", reportedProblem: "Sin señal" }); });

    expect(result.current.form).toBeNull();
    expect(result.current.catalog.data).toBeNull();
    expect(result.current.capabilities.canManage).toBe(false);
  });

  it("assigns and removes technicians with the latest server version", async () => {
    const assigned = { ...order, version: 2, participants: [{ id: "tech-2", code: "TEC-2", fullName: "Beatriz", role: "SUPPORT" as const, assignedAt: "2026-09-16T13:00:00.000Z", unassignedAt: null, active: true }] };
    const removed = { ...assigned, version: 3, participants: [{ ...assigned.participants[0], active: false, unassignedAt: "2026-09-16T14:00:00.000Z" }] };
    const api = apiMock({ assign: vi.fn(async () => assigned), unassign: vi.fn(async () => removed) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "TECHNICIANS_VIEW"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));

    await act(async () => { await result.current.assignTechnician("tech-2", "SUPPORT"); });
    expect(api.assign).toHaveBeenCalledWith("order-1", { technicianId: "tech-2", role: "SUPPORT", version: 1 });
    expect(result.current.detail.data).toEqual(assigned);
    await act(async () => { await result.current.unassignTechnician("tech-2", "Cambio de turno autorizado"); });
    expect(api.unassign).toHaveBeenCalledWith("order-1", "tech-2", { reason: "Cambio de turno autorizado", version: 2 });
    expect(result.current.detail.data).toEqual(removed);
  });

  it("manages materials with the current detail version, server result and refreshed list", async () => {
    const active = { ...order, status: "IN_PROGRESS" as const, version: 4 };
    const added = {
      ...active,
      version: 5,
      materials: [{ id: "usage-1", material: { id: "material-1", code: "MAT-001", name: "Cable", unit: "metro" }, quantity: "2.125", historicalUnitCost: "18.75", observation: "Tramo nuevo", createdAt: "2026-09-16T13:00:00.000Z" }],
    };
    const updated = { ...added, version: 6, materials: [{ ...added.materials[0], quantity: "3.000", observation: null }] };
    const removed = { ...updated, version: 7, materials: [] };
    const api = apiMock({
      detail: vi.fn(async () => active),
      addMaterial: vi.fn(async () => added),
      updateMaterial: vi.fn(async () => updated),
      removeMaterial: vi.fn(async () => removed),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(active.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(active));

    await act(async () => { await result.current.addMaterial({ materialId: "material-1", quantity: "2.125", observation: "Tramo nuevo" }); });
    expect(api.addMaterial).toHaveBeenCalledWith(active.id, { materialId: "material-1", quantity: "2.125", observation: "Tramo nuevo", version: 4 });
    expect(result.current.detail.data).toEqual(added);
    await act(async () => { await result.current.updateMaterial("usage-1", { quantity: "3.000", observation: null }); });
    expect(api.updateMaterial).toHaveBeenCalledWith(active.id, "usage-1", { quantity: "3.000", observation: null, version: 5 });
    await act(async () => { await result.current.removeMaterial("usage-1"); });
    expect(api.removeMaterial).toHaveBeenCalledWith(active.id, "usage-1", { version: 6 });
    expect(result.current.detail.data).toEqual(removed);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(4));
  });

  it("rejects material changes after permission revocation or when the order is closed", async () => {
    const active = { ...order, status: "IN_PROGRESS" as const, version: 4 };
    const addMaterial = vi.fn<OrdersApi["addMaterial"]>(async () => { throw new ApiClientError(403, "FORBIDDEN", "Prohibido"); });
    const api = apiMock({ detail: vi.fn(async () => active), addMaterial, updateMaterial: vi.fn(), removeMaterial: vi.fn() });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(active.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(active));

    await act(async () => { await result.current.addMaterial({ materialId: "material-1", quantity: "1" }); });
    expect(result.current.capabilities.canManage).toBe(false);
    await act(async () => { await result.current.updateMaterial("usage-1", { quantity: "2" }); });
    expect(api.updateMaterial).not.toHaveBeenCalled();

    const closedApi = apiMock({ detail: vi.fn(async () => ({ ...active, status: "COMPLETED" as const })), addMaterial: vi.fn() });
    const closedResult = renderHook(() => useOrdersWorkspace({ api: closedApi, lookupApi }), { wrapper });
    await waitFor(() => expect(closedResult.result.current.list.status).toBe("success"));
    act(() => closedResult.result.current.selectOrder(active.id));
    await waitFor(() => expect(closedResult.result.current.detail.data?.status).toBe("COMPLETED"));
    await act(async () => { await closedResult.result.current.addMaterial({ materialId: "material-1", quantity: "1" }); });
    expect(closedApi.addMaterial).not.toHaveBeenCalled();
  });

  it("keeps a stable backend assignment error without inventing availability", async () => {
    const api = apiMock({ assign: vi.fn(async () => { throw new ApiClientError(409, "TECHNICIAN_BUSY", "Ocupado"); }) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "TECHNICIANS_VIEW"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    await act(async () => { await result.current.assignTechnician("tech-2", "PRIMARY"); });

    expect(result.current.assignment.error).toBe("El técnico ya tiene otro trabajo operativo.");
    expect(result.current.assignment.pending).toBe(false);
  });
  it("executes the operational cycle with each confirmed server version", async () => {
    let serverOrder = order;
    const next = (status: OrderDetail["status"]) => {
      serverOrder = { ...serverOrder, status, version: serverOrder.version + 1 };
      return Promise.resolve(serverOrder);
    };
    const api = apiMock({
      detail: vi.fn(async () => serverOrder),
      onRoute: vi.fn(async () => next("ON_ROUTE")),
      start: vi.fn(async () => next("IN_PROGRESS")),
      pause: vi.fn(async () => next("PAUSED")),
      resume: vi.fn(async () => next("IN_PROGRESS")),
      complete: vi.fn(async () => next("COMPLETED")),
      adjust: vi.fn(async () => next("COMPLETED")),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN", "ORDERS_MANAGE"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.data?.status).toBe("ASSIGNED"));

    await act(async () => { await result.current.executeOrderAction("onRoute", {}); });
    expect(api.onRoute).toHaveBeenCalledWith("order-1", { version: 1 });
    await act(async () => { await result.current.executeOrderAction("start", {}); });
    expect(api.start).toHaveBeenCalledWith("order-1", { version: 2 });
    await act(async () => { await result.current.executeOrderAction("pause", { comment: "Esperando acceso autorizado" }); });
    expect(api.pause).toHaveBeenCalledWith("order-1", { comment: "Esperando acceso autorizado", version: 3 });
    await act(async () => { await result.current.executeOrderAction("resume", {}); });
    expect(api.resume).toHaveBeenCalledWith("order-1", { version: 4 });
    await act(async () => { await result.current.executeOrderAction("complete", { diagnosis: "Conector dañado", result: "Enlace restablecido" }); });
    expect(api.complete).toHaveBeenCalledWith("order-1", { diagnosis: "Conector dañado", result: "Enlace restablecido", version: 5 });
    await act(async () => { await result.current.executeOrderAction("adjust", { reason: "Corrección autorizada", description: "Cierre verificado" }); });
    expect(api.adjust).toHaveBeenCalledWith("order-1", { reason: "Corrección autorizada", description: "Cierre verificado", version: 6 });
    expect(result.current.detail.data).toEqual(serverOrder);
  });

  it("cancels with the latest version and rejects actions invalid for state", async () => {
    const cancelled = { ...order, status: "CANCELLED" as const, version: 2, cancellationReason: "Cliente cancela la intervención" };
    const api = apiMock({ cancel: vi.fn(async () => cancelled), complete: vi.fn(async () => cancelled) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));

    await act(async () => { await result.current.executeOrderAction("complete", { diagnosis: "No aplica", result: "No aplica" }); });
    expect(api.complete).not.toHaveBeenCalled();
    await act(async () => { await result.current.executeOrderAction("cancel", { cancellationReason: "Cliente cancela la intervención" }); });
    expect(api.cancel).toHaveBeenCalledWith("order-1", { cancellationReason: "Cliente cancela la intervención", version: 1 });
    expect(result.current.detail.data).toEqual(cancelled);
  });

  it("does not replace a newly selected detail with a late operation response", async () => {
    const pending = deferred<OrderDetail>();
    const second = { ...order, id: "order-2", orderNumber: "OT-2026-0002" };
    const api = apiMock({
      detail: vi.fn(async (id) => id === second.id ? second : order),
      onRoute: vi.fn(() => pending.promise),
    });
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]));
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.id).toBe(order.id));

    let operation!: Promise<boolean>;
    act(() => { operation = result.current.executeOrderAction("onRoute", {}); });
    act(() => result.current.selectOrder(second.id));
    await waitFor(() => expect(result.current.detail.data?.id).toBe(second.id));
    await act(async () => {
      pending.resolve({ ...order, status: "ON_ROUTE", version: 2 });
      await operation;
    });

    expect(result.current.selectedOrderId).toBe(second.id);
    expect(result.current.detail.data?.id).toBe(second.id);
  });

  it("invalidates a late evidence download after selecting another order", async () => {
    const pendingDownload = deferred<{ blob: Blob; filename: string }>();
    const download = vi.fn<OrderEvidenceApi["download"]>(() => pendingDownload.promise);
    const evidenceApi: OrderEvidenceApi = {
      listOrder: vi.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })),
      uploadOrder: vi.fn(), listRecurrence: vi.fn(), uploadRecurrence: vi.fn(), download, archive: vi.fn(),
    };
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:late") });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = apiMock({ detail: vi.fn(async (id) => id === "order-2" ? { ...order, id: "order-2" } : order) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi, evidenceApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.data?.id).toBe("order-1"));
    let downloadMutation!: Promise<boolean>;
    act(() => { downloadMutation = result.current.downloadEvidence!( { id: "e-1", originalName: "archivo.pdf" } as Evidence); });
    const signal = download.mock.calls[0]?.[1] as AbortSignal;
    act(() => result.current.selectOrder("order-2"));
    await waitFor(() => expect(result.current.detail.data?.id).toBe("order-2"));
    expect(signal.aborted).toBe(true);
    pendingDownload.resolve({ blob: new Blob(["old"]), filename: "viejo.pdf" });
    await act(async () => { await downloadMutation; });
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it("keeps the version captured when an action dialog was opened", async () => {
    let serverOrder = { ...order, status: "IN_PROGRESS" as const, version: 3 };
    const paused = { ...serverOrder, status: "PAUSED" as const, version: 4 };
    const api = apiMock({
      detail: vi.fn(async () => serverOrder),
      pause: vi.fn(async () => paused),
    });
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]));
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openOrderAction("pause"));

    serverOrder = { ...serverOrder, version: 4 };
    await act(async () => { await result.current.refreshDetail(); });
    await act(async () => { await result.current.executeOrderAction("pause", { comment: "Esperando acceso autorizado" }); });

    expect(api.pause).toHaveBeenCalledWith(order.id, {
      comment: "Esperando acceso autorizado",
      version: 3,
    });
  });

  it("refreshes the filtered list after an operational transition", async () => {
    const api = apiMock({
      onRoute: vi.fn(async () => ({ ...order, status: "ON_ROUTE" as const, version: 2 })),
    });
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]));
    const lookupApi = lookupMock();
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    await act(async () => { await result.current.executeOrderAction("onRoute", {}); });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it("keeps a conflicting dialog mounted until the refreshed detail is available", async () => {
    const current = { ...order, status: "IN_PROGRESS" as const, version: 3 };
    const refreshed = deferred<OrderDetail>();
    let detailCalls = 0;
    const api = apiMock({
      detail: vi.fn(() => detailCalls++ === 0 ? Promise.resolve(current) : refreshed.promise),
      complete: vi.fn(async () => { throw new ApiClientError(409, "VERSION_CONFLICT", "Conflicto"); }),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(current));
    act(() => result.current.openOrderAction("complete"));

    let execution!: Promise<boolean>;
    act(() => { execution = result.current.executeOrderAction("complete", { diagnosis: "Conector dañado", result: "Enlace restablecido" }); });
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2));
    expect(result.current.action.dialog).toBe("complete");

    await act(async () => {
      refreshed.resolve({ ...current, status: "COMPLETED", version: 4 });
      await execution;
    });
    expect(result.current.action.dialog).toBeNull();
    expect(result.current.action.error).toContain("cambió en el servidor");
  });
  it("keeps an operational draft after 409 and adopts the refreshed server version without retrying", async () => {
    const current = { ...order, status: "IN_PROGRESS" as const, version: 3 };
    const refreshed = { ...current, version: 4, updatedAt: "2026-09-16T13:00:00.000Z" };
    let detailCalls = 0;
    const complete = vi.fn<OrdersApi["complete"]>(async () => {
      throw new ApiClientError(409, "VERSION_CONFLICT", "Conflicto");
    });
    const api = apiMock({
      detail: vi.fn(async () => detailCalls++ === 0 ? current : refreshed),
      complete,
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(current));
    act(() => result.current.openOrderAction("complete"));

    await act(async () => {
      await result.current.executeOrderAction("complete", {
        diagnosis: "Conector dañado",
        result: "Enlace restablecido",
      });
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.current.detail.data).toEqual(refreshed);
    expect(result.current.action).toMatchObject({
      dialog: "complete",
      targetOrderId: order.id,
      targetVersion: 4,
      pending: false,
    });
    expect(result.current.action.error).toContain("cambió en el servidor");
  });

  it("loads list, catalog and URL-selected detail", async () => {
    window.history.replaceState({}, "", "/ordenes?status=ASSIGNED&orderId=order-1");
    const api = apiMock();
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN"]));

    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.status).toBe("success"));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    await waitFor(() => expect(result.current.catalog.status).toBe("success"));
    expect(api.list).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ["ASSIGNED"], page: 1 }),
      expect.any(AbortSignal),
    );
    expect(api.detail).toHaveBeenCalledWith("order-1", expect.any(AbortSignal));
    expect(result.current.detail.data).toEqual(order);
  });

  it("resets pagination for filters and pushes selection into the URL", async () => {
    window.history.replaceState({}, "", "/ordenes?page=4");
    const api = apiMock();
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.status).toBe("success"));

    act(() => result.current.setFilters({ priorities: ["CRITICAL"] }));
    await waitFor(() => expect(result.current.filters.page).toBe(1));
    expect(new URLSearchParams(window.location.search).getAll("priority"))
      .toEqual(["CRITICAL"]);
    expect(new URLSearchParams(window.location.search).get("page")).toBe("1");

    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    expect(new URLSearchParams(window.location.search).get("orderId"))
      .toBe("order-1");
  });

  it("debounces search, aborts the previous list and ignores its late response", async () => {
    vi.useFakeTimers();
    const first = deferred<OrderPage>();
    const second = deferred<OrderPage>();
    const list = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const api = apiMock({ list });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result, rerender } = renderHook(
      ({ search }) => useOrdersWorkspace({ api, lookupApi, search }),
      { initialProps: { search: "rou" }, wrapper },
    );
    const firstSignal = list.mock.calls[0]?.[1] as AbortSignal;

    rerender({ search: "router" });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(list).toHaveBeenCalledTimes(2);
    expect(firstSignal.aborted).toBe(true);

    first.resolve({ ...page, items: [{ ...order, orderNumber: "OBSOLETA" }] });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.list.data?.items[0]?.orderNumber).not.toBe("OBSOLETA");

    second.resolve({ ...page, items: [{ ...order, orderNumber: "VIGENTE" }] });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.list.data?.items[0]?.orderNumber).toBe("VIGENTE");
  });

  it("restores filters and selection on popstate", async () => {
    const api = apiMock();
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.status).toBe("success"));

    act(() => {
      window.history.pushState({}, "", "/ordenes?status=PAUSED&page=2&orderId=order-1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(result.current.filters).toMatchObject({
      statuses: ["PAUSED"],
      page: 2,
    }));
    await waitFor(() => expect(result.current.selectedOrderId).toBe("order-1"));
    expect(api.detail).toHaveBeenCalledWith("order-1", expect.any(AbortSignal));
  });

  it("ignores a late detail failure after popstate closes the selection", async () => {
    const pendingDetail = deferred<OrderDetail>();
    const api = apiMock({ detail: vi.fn(() => pendingDetail.promise) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.status).toBe("loading"));

    act(() => {
      window.history.pushState({}, "", "/ordenes");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(result.current.selectedOrderId).toBeNull());
    await act(async () => {
      pendingDetail.reject(new Error("Respuesta obsoleta"));
      await pendingDetail.promise.catch(() => undefined);
    });

    expect(result.current.detail).toEqual({ status: "idle", data: null, error: null, stale: false });
  });

  it("discards a late detail after another order is selected", async () => {
    const oldDetail = deferred<OrderDetail>();
    const currentDetail = { ...order, id: "order-2", orderNumber: "OT-2" };
    const detailApi = vi.fn()
      .mockImplementationOnce(() => oldDetail.promise)
      .mockResolvedValueOnce(currentDetail);
    const api = apiMock({ detail: detailApi });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.status).toBe("success"));

    act(() => result.current.selectOrder("order-1"));
    const oldSignal = detailApi.mock.calls[0]?.[1] as AbortSignal;
    act(() => result.current.selectOrder("order-2"));
    await waitFor(() => expect(result.current.detail.data?.id).toBe("order-2"));
    expect(oldSignal.aborted).toBe(true);

    oldDetail.resolve(order);
    await act(async () => { await Promise.resolve(); });
    expect(result.current.detail.data?.id).toBe("order-2");
  });

  it("aborts and clears order data when read permission is revoked", async () => {
    const pending = deferred<OrderPage>();
    const list = vi.fn<OrdersApi["list"]>(() => pending.promise);
    const api = apiMock({ list });
    const lookupApi = lookupMock();
    let currentUser = user(["ORDERS_VIEW_ALL"]);
    const wrapper = wrapperFor(() => currentUser);
    const { result, rerender } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    const signal = list.mock.calls[0]?.[1] as AbortSignal;

    currentUser = user([]);
    rerender();

    await waitFor(() => expect(result.current.capabilities.canView).toBe(false));
    expect(signal.aborted).toBe(true);
    expect(result.current.list.data).toBeNull();
    expect(result.current.selectedOrderId).toBeNull();
  });

  it("delegates logout cleanup and rejects a late mutation result", async () => {
    const active = { ...order, status: "ASSIGNED" as const, version: 4 };
    const lateMutation = deferred<OrderDetail>();
    const onRoute = vi.fn<OrdersApi["onRoute"]>(() => lateMutation.promise);
    const list = vi.fn<OrdersApi["list"]>(async () => ({ ...page, items: [active] }));
    const api = apiMock({ detail: vi.fn(async () => active), list, onRoute });
    const lookupApi = lookupMock();
    let currentUser: AuthUser | null = user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]);
    const wrapper = wrapperFor(() => currentUser);
    const { result, rerender } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(active.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(active));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.executeOrderAction("onRoute", {}); });

    currentUser = null;
    rerender();
    await waitFor(() => expect(result.current.detail.data).toBeNull());
    lateMutation.resolve({ ...active, status: "ON_ROUTE", version: 5 });
    let published!: boolean;
    await act(async () => { published = await mutation; });

    expect(published).toBe(false);
    expect(result.current.list.data).toBeNull();
    expect(result.current.detail.data).toBeNull();
    expect(result.current.selectedOrderId).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("does not publish a late operation after only the operation permission is revoked", async () => {
    const lateMutation = deferred<OrderDetail>();
    const onRoute = vi.fn<OrdersApi["onRoute"]>(() => lateMutation.promise);
    const list = vi.fn<OrdersApi["list"]>(async () => page);
    const api = apiMock({ list, onRoute });
    const lookupApi = lookupMock();
    let currentUser = user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]);
    const wrapper = wrapperFor(() => currentUser);
    const { result, rerender } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.executeOrderAction("onRoute", {}); });

    currentUser = user(["ORDERS_VIEW_OWN"]);
    rerender();
    await waitFor(() => expect(result.current.capabilities.canOperateOwn).toBe(false));
    lateMutation.resolve({ ...order, status: "ON_ROUTE", version: 2 });
    let published!: boolean;
    await act(async () => { published = await mutation; });

    expect(published).toBe(false);
    expect(result.current.detail.data).toEqual(order);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("invalidates order reading after a 403 without revoking independent evidence capability", async () => {
    const api = apiMock({
      list: vi.fn(async () => { throw new ApiClientError(403, "FORBIDDEN", "Prohibido"); }),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW"]));
    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.capabilities.canView).toBe(false));
    expect(result.current.capabilities.canViewEvidence).toBe(true);
    expect(result.current.list.data).toBeNull();
    expect(result.current.catalog.data).toBeNull();
  });

  it("closes a missing detail and removes orderId from the URL", async () => {
    window.history.replaceState({}, "", "/ordenes?status=ASSIGNED&orderId=missing");
    const api = apiMock({
      detail: vi.fn(async () => { throw new ApiClientError(404, "NOT_FOUND", "No encontrada"); }),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedOrderId).toBeNull());
    expect(result.current.detail).toEqual({ status: "idle", data: null, error: null, stale: false });
    expect(new URLSearchParams(window.location.search).get("orderId")).toBeNull();
    expect(new URLSearchParams(window.location.search).getAll("status")).toEqual(["ASSIGNED"]);
  });

  it("invalidates a pending create when the workspace unmounts", async () => {
    const pending = deferred<OrderDetail>();
    const created = { ...order, id: "created", orderNumber: "OT-CREATED" };
    const api = apiMock({ create: vi.fn(() => pending.promise) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result, unmount } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.openCreate());
    let mutation!: Promise<boolean>;
    act(() => {
      mutation = result.current.submitOrder({
        branchId: "branch-1",
        serviceTypeId: "service-1",
        priority: "HIGH",
        reportedProblem: "Sin red",
      });
    });
    await waitFor(() => expect(result.current.form?.pending).toBe(true));

    unmount();
    pending.resolve(created);
    const published = await mutation;

    expect(published).toBe(false);
    expect(new URLSearchParams(window.location.search).get("orderId")).toBeNull();
  });

  it("invalidates a pending assignment when the workspace unmounts", async () => {
    const pending = deferred<OrderDetail>();
    const api = apiMock({ assign: vi.fn(() => pending.promise) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result, unmount } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.assignTechnician("tech-2", "SUPPORT"); });
    await waitFor(() => expect(result.current.assignment.pending).toBe(true));

    unmount();
    pending.resolve({ ...order, version: 2 });

    expect(await mutation).toBe(false);
  });

  it("does not refresh after a pending material mutation outlives the workspace", async () => {
    const active = { ...order, status: "IN_PROGRESS" as const, version: 4 };
    const pending = deferred<OrderDetail>();
    const list = vi.fn<OrdersApi["list"]>(async () => ({ ...page, items: [active] }));
    const api = apiMock({
      list,
      detail: vi.fn(async () => active),
      addMaterial: vi.fn(() => pending.promise),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result, unmount } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(active.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(active));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.addMaterial({ materialId: "material-1", quantity: "1" }); });
    await waitFor(() => expect(result.current.material.pending).toBe(true));

    unmount();
    pending.resolve({ ...active, version: 5 });

    expect(await mutation).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("does not refresh after a pending operation outlives the workspace", async () => {
    const pending = deferred<OrderDetail>();
    const list = vi.fn<OrdersApi["list"]>(async () => page);
    const api = apiMock({ list, onRoute: vi.fn(() => pending.promise) });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]));
    const { result, unmount } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.executeOrderAction("onRoute", {}); });
    await waitFor(() => expect(result.current.action.pending).toBe(true));

    unmount();
    pending.resolve({ ...order, status: "ON_ROUTE", version: 2 });

    expect(await mutation).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("aborts a pending evidence download when the workspace unmounts", async () => {
    const pending = deferred<{ blob: Blob; filename: string }>();
    const download = vi.fn<OrderEvidenceApi["download"]>(() => pending.promise);
    const evidenceApi: OrderEvidenceApi = {
      listOrder: vi.fn(), uploadOrder: vi.fn(), listRecurrence: vi.fn(), uploadRecurrence: vi.fn(),
      download, archive: vi.fn(),
    };
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:late") });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = apiMock();
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "EVIDENCES_VIEW"]));
    const { result, unmount } = renderHook(() => useOrdersWorkspace({ api, lookupApi, evidenceApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.downloadEvidence!({ id: "e-1", originalName: "archivo.pdf" } as Evidence); });
    const signal = download.mock.calls[0]?.[1] as AbortSignal;

    unmount();
    pending.resolve({ blob: new Blob(["late"]), filename: "late.pdf" });

    expect(await mutation).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it("ignores a stale form 403 after another order is selected", async () => {
    const pending = deferred<OrderDetail>();
    const second = { ...order, id: "order-2", orderNumber: "OT-2" };
    const api = apiMock({
      detail: vi.fn(async (id) => id === second.id ? second : order),
      update: vi.fn(() => pending.promise),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    act(() => result.current.openEdit());
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.submitOrder({ reportedProblem: "Cambio" }); });
    act(() => result.current.selectOrder(second.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(second));

    await act(async () => {
      pending.reject(new ApiClientError(403, "FORBIDDEN", "Prohibido"));
      await mutation;
    });

    expect(result.current.capabilities.canManage).toBe(true);
    expect(result.current.catalog.data).toEqual(catalog);
    expect(result.current.detail.data).toEqual(second);
  });

  it("ignores a stale assignment 403 after another order is selected", async () => {
    const pending = deferred<OrderDetail>();
    const second = { ...order, id: "order-2", orderNumber: "OT-2" };
    const api = apiMock({
      detail: vi.fn(async (id) => id === second.id ? second : order),
      assign: vi.fn(() => pending.promise),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.assignTechnician("tech-2", "SUPPORT"); });
    act(() => result.current.selectOrder(second.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(second));

    await act(async () => {
      pending.reject(new ApiClientError(403, "FORBIDDEN", "Prohibido"));
      await mutation;
    });

    expect(result.current.capabilities.canManage).toBe(true);
    expect(result.current.detail.data).toEqual(second);
  });

  it("ignores a stale material 403 after another order is selected", async () => {
    const first = { ...order, status: "IN_PROGRESS" as const };
    const second = { ...first, id: "order-2", orderNumber: "OT-2" };
    const pending = deferred<OrderDetail>();
    const api = apiMock({
      detail: vi.fn(async (id) => id === second.id ? second : first),
      addMaterial: vi.fn(() => pending.promise),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(first.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(first));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.addMaterial({ materialId: "material-1", quantity: "1" }); });
    act(() => result.current.selectOrder(second.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(second));

    await act(async () => {
      pending.reject(new ApiClientError(403, "FORBIDDEN", "Prohibido"));
      await mutation;
    });

    expect(result.current.capabilities.canManage).toBe(true);
    expect(result.current.detail.data).toEqual(second);
  });

  it("ignores a stale operation 403 after another order is selected", async () => {
    const second = { ...order, id: "order-2", orderNumber: "OT-2" };
    const pending = deferred<OrderDetail>();
    const api = apiMock({
      detail: vi.fn(async (id) => id === second.id ? second : order),
      onRoute: vi.fn(() => pending.promise),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.executeOrderAction("onRoute", {}); });
    act(() => result.current.selectOrder(second.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(second));

    await act(async () => {
      pending.reject(new ApiClientError(403, "FORBIDDEN", "Prohibido"));
      await mutation;
    });

    expect(result.current.capabilities.canOperateOwn).toBe(true);
    expect(result.current.detail.data).toEqual(second);
  });

  it("clears order data when history becomes forbidden", async () => {
    const history = vi.fn<OrdersApi["history"]>()
      .mockResolvedValueOnce({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })
      .mockRejectedValueOnce(new ApiClientError(403, "FORBIDDEN", "Prohibido"));
    const api = apiMock({ history });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));
    await act(async () => { await result.current.loadHistory(); });
    expect(result.current.history.status).toBe("success");

    await act(async () => { await result.current.loadHistory(); });

    expect(result.current.capabilities.canView).toBe(false);
    expect(result.current.history.data).toBeNull();
    expect(result.current.selectedOrderId).toBeNull();
  });

  it("closes the selected order when history reports 404", async () => {
    const api = apiMock({
      history: vi.fn(async () => { throw new ApiClientError(404, "NOT_FOUND", "No encontrada"); }),
    });
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder(order.id));
    await waitFor(() => expect(result.current.detail.data).toEqual(order));

    await act(async () => { await result.current.loadHistory(); });

    expect(result.current.selectedOrderId).toBeNull();
    expect(result.current.detail.data).toBeNull();
    expect(new URLSearchParams(window.location.search).get("orderId")).toBeNull();
  });

  it("revokes order reading and closes its form when catalog loading is forbidden", async () => {
    const pendingCatalog = deferred<typeof catalog>();
    const api = apiMock();
    const lookupApi = lookupMock({ catalog: vi.fn(() => pendingCatalog.promise) });
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL", "ORDERS_MANAGE", "EVIDENCES_VIEW"]));
    const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }), { wrapper });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.openCreate());
    expect(result.current.form).toBeNull();

    await act(async () => {
      pendingCatalog.reject(new ApiClientError(403, "FORBIDDEN", "Prohibido"));
      await pendingCatalog.promise.catch(() => undefined);
    });

    expect(result.current.capabilities.canView).toBe(false);
    expect(result.current.capabilities.canViewEvidence).toBe(true);
    expect(result.current.capabilities.canManage).toBe(false);
    expect(result.current.catalog.data).toBeNull();
    expect(result.current.form).toBeNull();
    expect(result.current.list.data).toBeNull();
  });

  it("loads paged history only for the current selection", async () => {
    const api = apiMock();
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { result } = renderHook(
      () => useOrdersWorkspace({ api, lookupApi }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.selectOrder("order-1"));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));

    await act(async () => { await result.current.loadHistory(2); });

    expect(api.history).toHaveBeenCalledWith(
      "order-1",
      2,
      expect.any(AbortSignal),
    );
    expect(result.current.history.status).toBe("success");
  });

  it("polls only while visible and without an active form", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    const api = apiMock();
    const lookupApi = lookupMock();
    const wrapper = wrapperFor(() => user(["ORDERS_VIEW_ALL"]));
    const { rerender } = renderHook(
      ({ formActive }) => useOrdersWorkspace({
        api,
        lookupApi,
        formActive,
        pollIntervalMs: 1_000,
      }),
      { initialProps: { formActive: false }, wrapper },
    );
    await act(async () => { await Promise.resolve(); });
    vi.mocked(api.list).mockClear();

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(api.list).toHaveBeenCalledTimes(1);

    rerender({ formActive: true });
    vi.mocked(api.list).mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(api.list).not.toHaveBeenCalled();

    rerender({ formActive: false });
    visibility = "hidden";
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(api.list).not.toHaveBeenCalled();
  });
});
