import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KpiApi } from "../api/kpis";
import type { TechnicianApi } from "../api/technicians";
import { ApiClientError } from "../api/http";
import type { KpiDashboardData } from "../models/kpi";
import type { Technician, TechnicianPage } from "../models/technician";
import { useTechniciansWorkspace } from "./useTechniciansWorkspace";

const technician: Technician = {
  id: "tech-1", code: "TEC-001", fullName: "Ana López", specialty: "Redes", workPhone: "9999-0000",
  workEmail: "ana@example.com", status: "AVAILABLE", hiredOn: "2024-01-01", leftOn: null,
  user: { id: "user-1", email: "ana@example.com", displayName: "Ana López" },
  createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z", version: 1,
};

const page: TechnicianPage = {
  items: [technician],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};

const dashboard: KpiDashboardData = {
  status: "PREVIEW", items: [{
    technicianId: technician.id, code: technician.code, fullName: technician.fullName,
    completedCredits: "8", productivityScore: "90", complianceScore: "80", efficiencyScore: "85", qualityScore: "95", overallScore: "87",
  }], warnings: [], capabilities: {},
};

function technicianApiMock(overrides: Partial<TechnicianApi> = {}): TechnicianApi {
  const resolved = vi.fn(async () => technician);
  return {
    list: vi.fn(async () => page), detail: resolved, eligibleUsers: vi.fn(async () => ({ items: [], pagination: page.pagination })),
    create: resolved, update: resolved, changeStatus: resolved, deactivate: resolved, reactivate: resolved, ...overrides,
  };
}

function kpiApiMock(overrides: Partial<KpiApi> = {}): KpiApi {
  return {
    getDashboard: vi.fn(async () => dashboard), getTechnicianDetails: vi.fn(), validateWeek: vi.fn(), closeWeek: vi.fn(),
    recalculateWeek: vi.fn(), createTarget: vi.fn(), createConfiguration: vi.fn(), getVersions: vi.fn(), ...overrides,
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

async function flushPromises() { await act(async () => { await Promise.resolve(); }); }

beforeEach(() => window.history.replaceState({}, "", "/tecnicos"));
afterEach(() => vi.useRealTimers());

describe("useTechniciansWorkspace", () => {
  it("carga catálogo y KPI en paralelo, con URL y página inicial", async () => {
    const api = technicianApiMock();
    const kpiApi = kpiApiMock();
    const { result } = renderHook(() => useTechniciansWorkspace({
      api, kpiApi, search: "", canViewKpi: true, now: () => new Date("2026-08-27T12:00:00-06:00"),
    }));

    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await waitFor(() => expect(result.current.kpiState).toBe("ready"));
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }), expect.any(AbortSignal));
    expect(kpiApi.getDashboard).toHaveBeenCalledWith({ periodStart: "2026-08-24", granularity: "WEEK" }, expect.any(AbortSignal));
    expect(result.current.kpis.get(technician.id)).toEqual(dashboard.items[0]);
    expect(new URLSearchParams(window.location.search).get("technicianPage")).toBe("1");
  });

  it("no solicita KPI sin permiso", async () => {
    const api = technicianApiMock();
    const kpiApi = kpiApiMock({ getDashboard: vi.fn().mockRejectedValue(new Error("KPI no disponible")) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi, search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    expect(kpiApi.getDashboard).not.toHaveBeenCalled();
    expect(result.current.kpiState).toBe("idle");
  });

  it("no inicia KPI si el permiso se revoca antes del microtask programado", async () => {
    const api = technicianApiMock();
    const kpiApi = kpiApiMock();
    const { result, rerender } = renderHook(
      ({ canViewKpi }) => useTechniciansWorkspace({ api, kpiApi, search: "", canViewKpi }),
      { initialProps: { canViewKpi: true } },
    );
    rerender({ canViewKpi: false });
    await flushPromises();
    expect(kpiApi.getDashboard).not.toHaveBeenCalled();
    expect(result.current.kpis).toEqual(new Map());
    expect(result.current.kpiState).toBe("idle");
  });

  it("aborta y limpia KPI pendiente al revocar permiso sin publicar su respuesta", async () => {
    const pending = deferred<KpiDashboardData>();
    const api = technicianApiMock();
    const kpiApi = kpiApiMock({ getDashboard: vi.fn(() => pending.promise) });
    const { result, rerender } = renderHook(
      ({ canViewKpi }) => useTechniciansWorkspace({ api, kpiApi, search: "", canViewKpi }),
      { initialProps: { canViewKpi: true } },
    );
    await waitFor(() => expect(kpiApi.getDashboard).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(kpiApi.getDashboard).mock.calls[0]?.[1] as AbortSignal;
    rerender({ canViewKpi: false });
    await flushPromises();
    expect(signal.aborted).toBe(true);
    expect(result.current.kpis).toEqual(new Map());
    expect(result.current.kpiState).toBe("idle");
    pending.resolve(dashboard);
    await flushPromises();
    expect(result.current.kpis).toEqual(new Map());
    expect(result.current.kpiState).toBe("idle");
  });

  it("limpia los KPI ya cargados al revocar permiso", async () => {
    const api = technicianApiMock();
    const kpiApi = kpiApiMock();
    const { result, rerender } = renderHook(
      ({ canViewKpi }) => useTechniciansWorkspace({ api, kpiApi, search: "", canViewKpi }),
      { initialProps: { canViewKpi: true } },
    );
    await waitFor(() => expect(result.current.kpiState).toBe("ready"));
    expect(result.current.kpis.get(technician.id)).toEqual(dashboard.items[0]);
    rerender({ canViewKpi: false });
    await flushPromises();
    expect(result.current.kpis).toEqual(new Map());
    expect(result.current.kpiState).toBe("idle");
  });

  it("un error KPI no bloquea el catálogo", async () => {
    const api = technicianApiMock();
    const kpiApi = kpiApiMock({ getDashboard: vi.fn().mockRejectedValue(new Error("KPI no disponible")) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi, search: "", canViewKpi: true }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await waitFor(() => expect(result.current.kpiState).toBe("error"));
    expect(result.current.page).toEqual(page);
  });

  it("debouncea búsqueda, aborta y descarta respuesta vieja", async () => {
    vi.useFakeTimers();
    const oldRequest = deferred<TechnicianPage>();
    const latestRequest = deferred<TechnicianPage>();
    const api = technicianApiMock({ list: vi.fn().mockImplementationOnce(() => oldRequest.promise).mockImplementationOnce(() => latestRequest.promise) });
    const { result, rerender } = renderHook(({ search }) => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search, canViewKpi: false }), { initialProps: { search: "ana" } });
    const oldSignal = vi.mocked(api.list).mock.calls[0]?.[1] as AbortSignal;
    rerender({ search: "ana l" });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(oldSignal.aborted).toBe(true);
    oldRequest.resolve({ ...page, items: [{ ...technician, fullName: "Obsoleta" }] });
    await flushPromises();
    expect(result.current.page).toBeNull();
    latestRequest.resolve({ ...page, items: [{ ...technician, fullName: "Vigente" }] });
    await flushPromises();
    expect(result.current.page?.items[0]?.fullName).toBe("Vigente");
  });

  it("aplica filtros, reinicia página y conserva parámetros ajenos en URL", async () => {
    window.history.replaceState({}, "", "/tecnicos?source=shell&technicianPage=4");
    const api = technicianApiMock();
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.setFilters({ status: "BUSY", includeInactive: true }));
    await waitFor(() => expect(result.current.query.filters.status).toBe("BUSY"));
    expect(result.current.query.filters.page).toBe(1);
    const query = new URLSearchParams(window.location.search);
    expect(query.get("source")).toBe("shell");
    expect(query.get("technicianStatus")).toBe("BUSY");
    expect(query.get("technicianIncludeInactive")).toBe("true");
  });

  it("conserva la búsqueda persistida en URL cuando la búsqueda externa está vacía", async () => {
    window.history.replaceState({}, "", "/tecnicos?technicianSearch=Ana&technicianStatus=BUSY&technicianPage=3");
    const api = technicianApiMock({ list: vi.fn(async (filters) => ({ ...page, pagination: { ...page.pagination, page: filters.page, totalItems: 41, totalPages: 3 } })) });

    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));

    await waitFor(() => expect(result.current.listState).toBe("ready"));
    expect(result.current.query.filters).toMatchObject({ search: "Ana", status: "BUSY", page: 3 });
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ search: "Ana", status: "BUSY", page: 3 }), expect.any(AbortSignal));
    expect(new URLSearchParams(window.location.search).get("technicianSearch")).toBe("Ana");
  });

  it("restaura exactamente búsqueda y filtros desde URL al navegar con popstate", async () => {
    window.history.replaceState({}, "", "/tecnicos?technicianSearch=Ana&technicianStatus=BUSY&technicianPage=3");
    const api = technicianApiMock({ list: vi.fn(async (filters) => ({ ...page, pagination: { ...page.pagination, page: filters.page, totalItems: 41, totalPages: 3 } })) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => {
      window.history.pushState({}, "", "/tecnicos?technicianSearch=Beatriz&technicianStatus=INACTIVE&technicianIncludeInactive=true&technicianPage=2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(result.current.query.filters).toMatchObject({
      search: "Beatriz", status: "INACTIVE", includeInactive: true, page: 2,
    }));
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "Beatriz", status: "INACTIVE", includeInactive: true, page: 2,
    }), expect.any(AbortSignal));
  });

  it("limpia la búsqueda persistida cuando la prop externa cambia realmente a vacío", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/tecnicos?technicianSearch=Persistida&technicianPage=3");
    const api = technicianApiMock();
    const { result, rerender } = renderHook(
      ({ search }) => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search, canViewKpi: false }),
      { initialProps: { search: "Ana" } },
    );
    await act(async () => undefined);
    expect(result.current.query.filters.search).toBe("Ana");

    rerender({ search: "" });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(result.current.query.filters.search).toBeUndefined();
    expect(result.current.query.filters.page).toBe(1);
    expect(new URLSearchParams(window.location.search).has("technicianSearch")).toBe(false);
    expect(api.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ search: expect.anything() }), expect.any(AbortSignal));
  });

  it("carga detalle y aborta su solicitud al desmontarse", async () => {
    const pending = deferred<Technician>();
    const api = technicianApiMock({ detail: vi.fn(() => pending.promise) });
    const { result, unmount } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(technician.id));
    const signal = vi.mocked(api.detail).mock.calls[0]?.[1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("crea y refresca el catálogo", async () => {
    const created = { ...technician, id: "tech-2", version: 1 };
    const api = technicianApiMock({ create: vi.fn(async () => created) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await act(async () => expect(await result.current.createTechnician({ fullName: "Beatriz" })).toBe(true));
    expect(api.create).toHaveBeenCalledWith({ fullName: "Beatriz" });
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("vuelve a la ultima pagina disponible cuando una desactivacion reduce el catalogo", async () => {
    window.history.replaceState({}, "", "/tecnicos?technicianIncludeInactive=true&technicianPage=2");
    const inactive = { ...technician, status: "INACTIVE" as const, version: 2 };
    const api = technicianApiMock({
      list: vi.fn()
        .mockResolvedValueOnce({ ...page, pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 } })
        .mockResolvedValueOnce({ items: [], pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 } })
        .mockResolvedValueOnce({ items: [inactive], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }),
      deactivate: vi.fn(async () => inactive),
    });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));

    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(technician.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    await act(async () => expect(await result.current.deactivate({ reason: "Salida autorizada" })).toBe(true));

    await waitFor(() => expect(result.current.query.filters.page).toBe(1));
    await waitFor(() => expect(result.current.page?.pagination.page).toBe(1));
    expect(vi.mocked(api.list).mock.calls.map(([filters]) => filters.page)).toEqual([2, 2, 1]);
    expect(new URLSearchParams(window.location.search).get("technicianPage")).toBe("1");
  });

  it("edita y usa la versión seleccionada", async () => {
    const updated = { ...technician, fullName: "Ana actualizada", version: 2 };
    const api = technicianApiMock({ update: vi.fn(async () => updated) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(technician.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    await act(async () => expect(await result.current.updateTechnician({ fullName: "Ana actualizada" })).toBe(true));
    expect(api.update).toHaveBeenCalledWith(technician.id, { fullName: "Ana actualizada", version: 1 });
    expect(result.current.selected).toEqual(updated);
  });

  it("cambia estado, desactiva y reactiva usando la versión reconciliada", async () => {
    const busy = { ...technician, status: "BUSY" as const, version: 2 };
    const inactive = { ...busy, status: "INACTIVE" as const, version: 3 };
    const reactivated = { ...inactive, status: "AVAILABLE" as const, version: 4, leftOn: null };
    const api = technicianApiMock({ changeStatus: vi.fn(async () => busy), deactivate: vi.fn(async () => inactive), reactivate: vi.fn(async () => reactivated) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(technician.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    await act(async () => expect(await result.current.changeStatus("BUSY")).toBe(true));
    await act(async () => expect(await result.current.deactivate({ reason: "Salida" })).toBe(true));
    await act(async () => expect(await result.current.reactivate("Regreso")).toBe(true));
    expect(api.changeStatus).toHaveBeenCalledWith(technician.id, { status: "BUSY", version: 1 });
    expect(api.deactivate).toHaveBeenCalledWith(technician.id, { reason: "Salida", version: 2 });
    expect(api.reactivate).toHaveBeenCalledWith(technician.id, { reason: "Regreso", version: 3 });
  });

  it("recarga detalle y conserva el editor ante conflicto de versión", async () => {
    const current = { ...technician, fullName: "Cambio remoto", version: 3 };
    const api = technicianApiMock({
      update: vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "conflicto")),
      detail: vi.fn().mockResolvedValueOnce(technician).mockResolvedValueOnce(current),
    });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(technician.id));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    await act(async () => expect(await result.current.updateTechnician({ fullName: "Ana actualizada" })).toBe(false));
    expect(result.current.mutation).toMatchObject({ conflict: true, pending: false });
    expect(result.current.selected).toEqual(current);
    expect(api.detail).toHaveBeenLastCalledWith("tech-1", expect.any(AbortSignal));
  });

  it("no cierra ni recarga el detalle nuevo si un 404 pertenece a la mutación anterior", async () => {
    const second = { ...technician, id: "tech-2", fullName: "Beatriz", version: 4 };
    const pending = deferred<Technician>();
    const api = technicianApiMock({
      detail: vi.fn((id: string) => Promise.resolve(id === technician.id ? technician : second)),
      update: vi.fn(() => pending.promise),
    });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(technician.id));
    await waitFor(() => expect(result.current.selected?.id).toBe(technician.id));
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.updateTechnician({ fullName: "Ana actualizada" }); });
    await waitFor(() => expect(result.current.mutation?.pending).toBe(true));
    act(() => result.current.select(second.id));
    await waitFor(() => expect(result.current.selected).toEqual(second));
    pending.reject(new ApiClientError(404, "NOT_FOUND", "detalle interno"));
    await act(async () => expect(await saving).toBe(false));
    expect(result.current.selected).toEqual(second);
    expect(result.current.detailState).toBe("ready");
    expect(api.detail).toHaveBeenCalledTimes(2);
  });

  it("impide doble envío mientras una mutación está pendiente", async () => {
    const pending = deferred<Technician>();
    const api = technicianApiMock({ create: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    let first!: Promise<boolean>;
    act(() => { first = result.current.createTechnician({ fullName: "Beatriz" }); });
    await waitFor(() => expect(result.current.mutation?.pending).toBe(true));
    await act(async () => expect(await result.current.createTechnician({ fullName: "Beatriz" })).toBe(false));
    expect(api.create).toHaveBeenCalledTimes(1);
    pending.resolve({ ...technician, id: "tech-2" });
    await act(async () => expect(await first).toBe(true));
  });

  it.each([
    ["WORK_EMAIL_ALREADY_EXISTS", "El correo laboral ya está registrado."],
    ["USER_NOT_ELIGIBLE_AS_TECHNICIAN", "El usuario seleccionado no es elegible como técnico."],
    ["USER_ALREADY_LINKED", "El usuario seleccionado ya está vinculado a otro técnico."],
    ["TECHNICIAN_HAS_ACTIVE_WORK", "No se puede desactivar el técnico porque tiene trabajo activo."],
    ["INVALID_TECHNICIAN_STATUS", "El estado seleccionado no es válido para el técnico."],
    ["FORBIDDEN", "No tienes permiso para realizar esta acción.", 403],
  ])("traduce %s a un error de mutación seguro", async (code, message, status = 422) => {
    const api = technicianApiMock({ create: vi.fn().mockRejectedValue(new ApiClientError(status, code, "detalle interno")) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await act(async () => expect(await result.current.createTechnician({ fullName: "Beatriz" })).toBe(false));
    expect(result.current.mutation).toMatchObject({ pending: false, conflict: false, error: message });
  });

  it("oculta el detalle interno de un ApiClientError no reconocido", async () => {
    const api = technicianApiMock({ create: vi.fn().mockRejectedValue(new ApiClientError(500, "DATABASE_FAILURE", "traza privada")) });
    const { result } = renderHook(() => useTechniciansWorkspace({ api, kpiApi: kpiApiMock(), search: "", canViewKpi: false }));
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await act(async () => expect(await result.current.createTechnician({ fullName: "Beatriz" })).toBe(false));
    expect(result.current.mutation).toMatchObject({ error: "No fue posible guardar los cambios", conflict: false });
  });
});
