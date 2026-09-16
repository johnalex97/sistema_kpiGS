import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderLookupApi } from "../api/order-lookups";
import type { OrdersApi } from "../api/orders";
import { AuthContext } from "../auth/AuthContext";
import type { AuthUser } from "../models/auth";
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

function wrapperFor(getUser: () => AuthUser) {
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
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/ordenes");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useOrdersWorkspace", () => {
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
