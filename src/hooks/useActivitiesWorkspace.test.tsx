import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityApi } from "../api/activities";
import { ApiClientError, ApiNetworkError } from "../api/http";
import type { ActivityDetail, ActivityPage, ActivitySummary } from "../models/activity";
import { useActivitiesWorkspace } from "./useActivitiesWorkspace";

const summary: ActivitySummary = {
  id: "11111111-1111-4111-8111-111111111111",
  branch: {
    id: "22222222-2222-4222-8222-222222222222",
    code: "TGU-01",
    name: "Centro",
    client: { id: "33333333-3333-4333-8333-333333333333", code: "CLI-001", tradeName: "Cliente Demo" },
  },
  order: null,
  activityType: { id: "44444444-4444-4444-8444-444444444444", code: "SUP", name: "Soporte", description: null, displayOrder: 1 },
  status: "PENDING",
  description: "Revisar router central",
  result: null,
  responsible: null,
  startedAt: null,
  endedAt: null,
  pausedMinutes: 0,
  productiveMinutes: null,
  createdAt: "2026-08-26T13:00:00.000Z",
  updatedAt: "2026-08-26T13:00:00.000Z",
  version: 1,
};

const detail: ActivityDetail = { ...summary, observations: null, team: [], pauses: [] };
const page: ActivityPage = {
  items: [summary],
  pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
};

function pageWith(description: string): ActivityPage {
  return { ...page, items: [{ ...summary, description }] };
}

function activityApiMock(overrides: Partial<ActivityApi> = {}): ActivityApi {
  const resolvedDetail = vi.fn(async () => detail);
  return {
    listTypes: vi.fn(async () => []),
    list: vi.fn(async () => page),
    detail: resolvedDetail,
    create: resolvedDetail,
    createManual: resolvedDetail,
    update: resolvedDetail,
    replaceTeam: resolvedDetail,
    start: resolvedDetail,
    pause: resolvedDetail,
    resume: resolvedDetail,
    complete: resolvedDetail,
    cancel: resolvedDetail,
    adjust: resolvedDetail,
    ...overrides,
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

async function flushPromises() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/actividades");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useActivitiesWorkspace", () => {
  it("carga la consulta inicial y selecciona detalle real", async () => {
    const api = activityApiMock();
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "router", pollIntervalMs: 30_000 }));

    await waitFor(() => expect(result.current.listState).toBe("ready"));
    expect(result.current.page).toEqual(page);
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ search: "router", page: 1 }), expect.any(AbortSignal));

    act(() => result.current.select(detail.id));
    await waitFor(() => expect(result.current.selected).toEqual(detail));
    expect(result.current.detailState).toBe("ready");
  });

  it("distingue vacío, error inicial y reintento exitoso", async () => {
    const api = activityApiMock({
      list: vi.fn()
        .mockRejectedValueOnce(new Error("Servidor no disponible"))
        .mockResolvedValueOnce({ ...page, items: [], pagination: { ...page.pagination, totalItems: 0, totalPages: 0 } }),
    });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));

    await waitFor(() => expect(result.current.listState).toBe("error"));
    expect(result.current.listError).toBe("Servidor no disponible");
    act(() => result.current.retryList());
    await waitFor(() => expect(result.current.listState).toBe("empty"));
    expect(result.current.listError).toBeNull();
  });

  it("conserva la página previa y la marca obsoleta si falla una actualización", async () => {
    const api = activityApiMock({
      list: vi.fn().mockResolvedValueOnce(page).mockRejectedValueOnce(new Error("Sin red")),
    });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    await act(async () => { await result.current.refresh(); });

    expect(result.current.page).toEqual(page);
    expect(result.current.listState).toBe("ready");
    expect(result.current.stale).toBe(true);
    expect(result.current.listError).toBe("Sin red");
  });

  it("sincroniza vista y filtros seguros en la URL conservando parámetros ajenos", async () => {
    window.history.replaceState({}, "", "/actividades?source=shell&activityView=history&activityAllDates=true&activityPage=4");
    const api = activityApiMock({ list: vi.fn(async () => ({ ...page, items: [] })) });
    const { result } = renderHook(() => useActivitiesWorkspace({
      api,
      search: "",
      now: () => new Date("2026-08-26T18:00:00.000Z"),
    }));
    await waitFor(() => expect(result.current.listState).toBe("empty"));

    expect(result.current.query).toMatchObject({
      view: "history",
      filters: { page: 4, status: ["COMPLETED", "CANCELLED"] },
    });
    expect(result.current.query.filters).not.toHaveProperty("startedFrom");

    act(() => result.current.setFilters({ clientId: "client-1" }));
    await waitFor(() => expect(result.current.query.filters.clientId).toBe("client-1"));
    const query = new URLSearchParams(window.location.search);
    expect(query.get("source")).toBe("shell");
    expect(query.get("activityPage")).toBe("1");
    expect(query.get("activityClientId")).toBe("client-1");

    act(() => result.current.setView("open"));
    expect(result.current.query.view).toBe("open");
    expect(result.current.query.filters.status).toEqual(["PENDING", "IN_PROGRESS", "PAUSED"]);
    expect(result.current.query.filters).not.toHaveProperty("startedFrom");
  });

  it("debouncea búsqueda, aborta y descarta la respuesta anterior", async () => {
    vi.useFakeTimers();
    const oldRequest = deferred<ActivityPage>();
    const latestRequest = deferred<ActivityPage>();
    const list = vi.fn()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => latestRequest.promise);
    const api = activityApiMock({ list });
    const { result, rerender } = renderHook(
      ({ search }) => useActivitiesWorkspace({ api, search, pollIntervalMs: 30_000 }),
      { initialProps: { search: "rou" } },
    );
    expect(list).toHaveBeenCalledTimes(1);
    const oldSignal = list.mock.calls[0]?.[1] as AbortSignal;

    rerender({ search: "router" });
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(list).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "router", page: 1 }), expect.any(AbortSignal));
    expect(oldSignal.aborted).toBe(true);

    oldRequest.resolve(pageWith("obsoleto"));
    await flushPromises();
    expect(result.current.page?.items.some((item) => item.description === "obsoleto") ?? false).toBe(false);

    latestRequest.resolve(pageWith("vigente"));
    await flushPromises();
    expect(result.current.page?.items[0]?.description).toBe("vigente");
  });

  it("hace polling sólo visible sin ocultar datos ni cerrar el detalle", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    const api = activityApiMock();
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "", pollIntervalMs: 30_000 }));
    await flushPromises();
    act(() => result.current.select(detail.id));
    await flushPromises();
    expect(result.current.selected).toEqual(detail);
    vi.mocked(api.list).mockClear();

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(result.current.listState).toBe("ready");
    expect(result.current.selected).toEqual(detail);

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api.list).toHaveBeenCalledTimes(1);

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(result.current.selected).toEqual(detail);
  });

  it("aborta el detalle pendiente al cerrarlo y no publica su respuesta tardía", async () => {
    const pendingDetail = deferred<ActivityDetail>();
    const api = activityApiMock({ detail: vi.fn(() => pendingDetail.promise) });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => result.current.select(detail.id));
    const signal = vi.mocked(api.detail).mock.calls[0]?.[1] as AbortSignal;
    act(() => result.current.closeDetail());
    expect(signal.aborted).toBe(true);
    expect(result.current.detailState).toBe("idle");

    pendingDetail.resolve(detail);
    await flushPromises();
    expect(result.current.selected).toBeNull();
  });

  it("reconcilia el detalle y el listado con el DTO devuelto por una accion", async () => {
    const startedDetail: ActivityDetail = { ...detail, status: "IN_PROGRESS", startedAt: "2026-08-26T14:00:00.000Z", version: 2 };
    const api = activityApiMock({ start: vi.fn(async () => startedDetail), list: vi.fn().mockResolvedValueOnce(page).mockResolvedValue({ ...page, items: [startedDetail] }) });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(detail.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    await act(async () => { expect(await result.current.runAction({ type: "start" })).toBe(true); });
    expect(api.start).toHaveBeenCalledWith(detail.id, 1);
    expect(result.current.selected).toMatchObject({ status: "IN_PROGRESS", version: 2 });
    expect(result.current.page?.items[0]).toMatchObject({ status: "IN_PROGRESS", version: 2 });
  });

  it("impide repetir una mutacion mientras esta pendiente", async () => {
    const pendingStart = deferred<ActivityDetail>();
    const api = activityApiMock({ start: vi.fn(() => pendingStart.promise) });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(detail.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    let first!: Promise<boolean>;
    act(() => { first = result.current.runAction({ type: "start" }); });
    await waitFor(() => expect(result.current.mutation?.pending).toBe(true));
    await act(async () => { expect(await result.current.runAction({ type: "start" })).toBe(false); });
    expect(api.start).toHaveBeenCalledTimes(1);
    pendingStart.resolve({ ...detail, status: "IN_PROGRESS", version: 2 });
    await act(async () => { await first; });
  });

  it("recarga la version actual sin repetir una mutacion en conflicto", async () => {
    const newerDetail: ActivityDetail = { ...detail, description: "Cambio remoto", version: 3 };
    const api = activityApiMock({ complete: vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "conflict")), detail: vi.fn().mockResolvedValueOnce(detail).mockResolvedValueOnce(newerDetail) });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(detail.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    await act(async () => { expect(await result.current.runAction({ type: "complete", result: "Listo" })).toBe(false); });
    expect(api.complete).toHaveBeenCalledTimes(1);
    expect(api.complete).toHaveBeenCalledWith(detail.id, { version: 1, result: "Listo" });
    expect(result.current.selected).toEqual(newerDetail);
    expect(result.current.mutation).toMatchObject({ pending: false, conflict: true });
  });

  it("usa la version seleccionada al editar y reemplazar el equipo", async () => {
    const updated = { ...detail, description: "Descripcion corregida", version: 2 };
    const teamed = { ...updated, version: 3 };
    const api = activityApiMock({ update: vi.fn(async () => updated), replaceTeam: vi.fn(async () => teamed) });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(detail.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    await act(async () => { expect(await result.current.updateActivity({ description: "Descripcion corregida" })).toBe(true); });
    await act(async () => { expect(await result.current.replaceActivityTeam([])).toBe(true); });
    expect(api.update).toHaveBeenCalledWith(detail.id, { description: "Descripcion corregida", version: 1 });
    expect(api.replaceTeam).toHaveBeenCalledWith(detail.id, 2, []);
  });

  it("despacha por separado el registro programado y manual", async () => {
    const api = activityApiMock();
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    await act(async () => { await result.current.createActivity({ mode: "scheduled", orderId: "order-1", activityTypeId: "type-1", description: "Programada" }); });
    await act(async () => { await result.current.createActivity({ mode: "manual", branchId: "branch-1", activityTypeId: "type-1", description: "Manual", startedAt: "2026-08-26T13:00:00.000-06:00", endedAt: "2026-08-26T14:00:00.000-06:00", result: "Listo", justification: "Carga posterior" }); });

    expect(api.create).toHaveBeenCalledWith({ orderId: "order-1", activityTypeId: "type-1", description: "Programada" });
    expect(api.createManual).toHaveBeenCalledWith(expect.objectContaining({ branchId: "branch-1", result: "Listo" }));
  });

  it("conserva el detalle y muestra un mensaje seguro ante red o permiso denegado", async () => {
    const api = activityApiMock({
      start: vi.fn().mockRejectedValueOnce(new ApiNetworkError()).mockRejectedValueOnce(new ApiClientError(403, "FORBIDDEN", "detalle interno")),
    });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(detail.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));

    await act(async () => { await result.current.runAction({ type: "start" }); });
    expect(result.current.selected).toEqual(detail);
    expect(result.current.mutation?.error).toBe("No fue posible conectar con el servidor");
    await act(async () => { await result.current.runAction({ type: "start" }); });
    expect(result.current.selected).toEqual(detail);
    expect(result.current.mutation?.error).toBe("No tienes permiso para realizar esta acción.");
  });

  it("cierra una actividad eliminada y actualiza el listado", async () => {
    const list = vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce({ ...page, items: [], pagination: { ...page.pagination, totalItems: 0, totalPages: 0 } });
    const api = activityApiMock({ list, cancel: vi.fn().mockRejectedValueOnce(new ApiClientError(404, "NOT_FOUND", "missing")) });
    const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "" }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(detail.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));

    await act(async () => { expect(await result.current.runAction({ type: "cancel", reason: "Duplicada" })).toBe(false); });

    expect(result.current.selected).toBeNull();
    expect(result.current.detailState).toBe("idle");
    expect(result.current.listState).toBe("empty");
    expect(list).toHaveBeenCalledTimes(2);
  });
});
