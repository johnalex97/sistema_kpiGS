import { useLayoutEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceApi } from "../api/evidences";
import { ApiClientError } from "../api/http";
import type { RecurrenceLookupApi } from "../api/recurrence-lookups";
import type { RecurrenceApi } from "../api/recurrences";
import type { RecurrenceCatalog, RecurrenceDetail, RecurrencePage, RecurrenceSummaryMetrics } from "../models/recurrence";
import { useRecurrencesWorkspace } from "./useRecurrencesWorkspace";

const recurrenceId = "11111111-1111-4111-8111-111111111111";
const anotherRecurrenceId = "22222222-2222-4222-8222-222222222222";

const catalog: RecurrenceCatalog = {
  causes: [{ id: "cause-1", code: "REWORK", name: "Retrabajo" }],
  states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
  impacts: ["LOW", "MEDIUM", "HIGH"],
  responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
  transitions: [],
};

const detail: RecurrenceDetail = {
  id: recurrenceId,
  recurrenceNumber: "RI-2026-0001",
  status: "OPEN",
  impact: "HIGH",
  responsibility: "UNDETERMINED",
  detectedProblem: "La conexión volvió a fallar",
  detectedAt: "2026-09-01T10:00:00.000Z",
  originalOrder: { id: "order-1", orderNumber: "OT-100" },
  cause: null,
  additionalMinutes: 0,
  estimatedCost: "0.00",
  visitCount: 0,
  noteCount: 0,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  version: 1,
  analysis: null,
  correctiveAction: null,
  preventiveAction: null,
  observations: null,
  ageOverrideReason: null,
  dismissalReason: null,
  dismissedAt: null,
  closedAt: null,
  visits: [],
  technicians: [],
  notes: [],
  evidences: [],
};

const page: RecurrencePage = {
  items: [detail],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};

const summary: RecurrenceSummaryMetrics = {
  totalCases: 1,
  openCases: 1,
  highImpactCases: 1,
  additionalVisits: 0,
  additionalMinutes: 0,
  estimatedCost: "0.00",
  completedBaseOrders: 10,
  recurrenceRate: "10.00",
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function recurrenceApi(overrides: Partial<RecurrenceApi> = {}): RecurrenceApi {
  return {
    catalog: vi.fn().mockResolvedValue(catalog),
    list: vi.fn().mockResolvedValue(page),
    summary: vi.fn().mockResolvedValue(summary),
    detail: vi.fn().mockResolvedValue(detail),
    report: vi.fn(),
    analyze: vi.fn(),
    correct: vi.fn(),
    addVisit: vi.fn(),
    addNote: vi.fn(),
    dismiss: vi.fn(),
    close: vi.fn(),
    adjust: vi.fn(),
    ...overrides,
  };
}

function lookupApi(overrides: Partial<RecurrenceLookupApi> = {}): RecurrenceLookupApi {
  const pagination = { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };
  return {
    orders: vi.fn().mockResolvedValue({ items: [], pagination }),
    technicians: vi.fn().mockResolvedValue({ items: [], pagination }),
    clients: vi.fn().mockResolvedValue({ items: [], pagination }),
    branches: vi.fn().mockResolvedValue({ items: [], pagination }),
    ...overrides,
  };
}

function evidenceApi(overrides: Partial<EvidenceApi> = {}): EvidenceApi {
  const pagination = { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };
  return {
    listRecurrence: vi.fn().mockResolvedValue({ items: [], pagination }),
    uploadRecurrence: vi.fn(),
    download: vi.fn(),
    archive: vi.fn(),
    ...overrides,
  };
}

function options(overrides: Partial<Parameters<typeof useRecurrencesWorkspace>[0]> = {}) {
  return {
    api: recurrenceApi(),
    evidenceApi: evidenceApi(),
    lookupApi: lookupApi(),
    permissions: ["RECURRENCES_VIEW_ALL", "ORDERS_VIEW_ALL", "TECHNICIANS_VIEW", "CLIENTS_VIEW", "EVIDENCES_VIEW"],
    search: "",
    now: () => new Date("2026-09-10T12:00:00.000Z"),
    ...overrides,
  };
}

function renderWorkspace(overrides: Partial<Parameters<typeof useRecurrencesWorkspace>[0]> = {}) {
  const stableOptions = options(overrides);
  return renderHook(() => useRecurrencesWorkspace(stableOptions));
}

async function flushPromises() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => window.history.replaceState({}, "", "/reincidencias"));
afterEach(() => vi.useRealTimers());

describe("useRecurrencesWorkspace", () => {
  it("carga catálogo, listado y resumen en paralelo con estados independientes", async () => {
    const pendingCatalog = deferred<RecurrenceCatalog>();
    const pendingPage = deferred<RecurrencePage>();
    const pendingSummary = deferred<RecurrenceSummaryMetrics>();
    const api = recurrenceApi({
      catalog: vi.fn(() => pendingCatalog.promise),
      list: vi.fn(() => pendingPage.promise),
      summary: vi.fn(() => pendingSummary.promise),
    });
    const { result } = renderWorkspace({ api });

    await waitFor(() => expect(api.catalog).toHaveBeenCalledTimes(1));
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(api.catalog).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }), expect.any(AbortSignal));
    expect(api.summary).toHaveBeenCalledWith(expect.not.objectContaining({ page: expect.anything() }), expect.any(AbortSignal));
    expect(result.current).toMatchObject({ catalogState: "loading", listState: "loading", summaryState: "loading" });

    pendingCatalog.resolve(catalog);
    await waitFor(() => expect(result.current.catalogState).toBe("ready"));
    expect(result.current.listState).toBe("loading");
    expect(result.current.summaryState).toBe("loading");
    pendingPage.resolve(page);
    pendingSummary.resolve(summary);
    await waitFor(() => expect(result.current).toMatchObject({ listState: "ready", summaryState: "ready" }));
  });

  it("clona y congela profundamente un snapshot compartido por listado y resumen", async () => {
    const api = recurrenceApi();
    const statuses: Array<"OPEN" | "ANALYSIS"> = ["OPEN", "ANALYSIS"];
    const impacts: Array<"HIGH"> = ["HIGH"];
    const responsibilities: Array<"TECHNICAL_WORK"> = ["TECHNICAL_WORK"];
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => result.current.setFilters({ status: statuses, impact: impacts, responsibility: responsibilities }));
    statuses.push("OPEN");
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    const listFilters = vi.mocked(api.list).mock.calls[1]?.[0];
    const summaryFilters = vi.mocked(api.summary).mock.calls[1]?.[0];

    expect(listFilters).not.toBe(result.current.query.filters);
    expect(result.current.query.filters.status).toEqual(["OPEN", "ANALYSIS"]);
    expect(listFilters.status).not.toBe(statuses);
    expect(Object.isFrozen(listFilters)).toBe(true);
    expect(Object.isFrozen(listFilters.status)).toBe(true);
    expect(Object.isFrozen(listFilters.impact)).toBe(true);
    expect(Object.isFrozen(listFilters.responsibility)).toBe(true);
    expect(summaryFilters.status).toBe(listFilters.status);
    expect(summaryFilters.impact).toBe(listFilters.impact);
    expect(summaryFilters.responsibility).toBe(listFilters.responsibility);
  });

  it("mantiene el listado stale ante un error de recarga sin bloquear resumen ni catálogo", async () => {
    const api = recurrenceApi({ list: vi.fn().mockResolvedValueOnce(page).mockRejectedValueOnce(new Error("sin red")) });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => result.current.setFilters({ impact: ["HIGH"] }));
    await waitFor(() => expect(result.current.listStale).toBe(true));

    expect(result.current.page).toBe(page);
    expect(result.current.listState).toBe("ready");
    expect(result.current.catalogState).toBe("ready");
    expect(result.current.summaryState).toBe("ready");
  });

  it("descarta respuestas antiguas aunque el transporte ignore el aborto", async () => {
    const oldList = deferred<RecurrencePage>();
    const currentList = deferred<RecurrencePage>();
    const api = recurrenceApi({ list: vi.fn().mockImplementationOnce(() => oldList.promise).mockImplementationOnce(() => currentList.promise) });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(api.list).mock.calls[0]?.[1] as AbortSignal;

    act(() => result.current.setFilters({ status: ["ANALYSIS"] }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(oldSignal.aborted).toBe(true);
    oldList.resolve({ ...page, items: [{ ...detail, detectedProblem: "Obsoleto" }] });
    await flushPromises();
    expect(result.current.page).toBeNull();
    currentList.resolve({ ...page, items: [{ ...detail, detectedProblem: "Vigente" }] });
    await waitFor(() => expect(result.current.page?.items[0]?.detectedProblem).toBe("Vigente"));
  });

  it("invalida listado y resumen antes del microtask de la consulta siguiente", async () => {
    const oldList = deferred<RecurrencePage>();
    const oldSummary = deferred<RecurrenceSummaryMetrics>();
    const newList = deferred<RecurrencePage>();
    const newSummary = deferred<RecurrenceSummaryMetrics>();
    const api = recurrenceApi({
      list: vi.fn().mockImplementationOnce(() => oldList.promise).mockImplementationOnce(() => newList.promise),
      summary: vi.fn().mockImplementationOnce(() => oldSummary.promise).mockImplementationOnce(() => newSummary.promise),
    });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(api.summary).toHaveBeenCalledTimes(1));
    const oldListSignal = vi.mocked(api.list).mock.calls[0]?.[1] as AbortSignal;
    const oldSummarySignal = vi.mocked(api.summary).mock.calls[0]?.[1] as AbortSignal;

    act(() => {
      result.current.setFilters({ impact: ["HIGH"] });
      oldList.resolve({ ...page, items: [{ ...detail, detectedProblem: "Lista obsoleta" }] });
      oldSummary.resolve({ ...summary, totalCases: 99 });
    });

    expect(oldListSignal.aborted).toBe(true);
    expect(oldSummarySignal.aborted).toBe(true);
    await flushPromises();
    expect(result.current.page).toBeNull();
    expect(result.current.summary).toBeNull();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    newList.resolve(page);
    newSummary.resolve(summary);
    await waitFor(() => expect(result.current.page).toBe(page));
    expect(result.current.summary).toBe(summary);
  });

  it("aborta todas las lecturas principales pendientes al desmontarse", async () => {
    const never = new Promise<never>(() => undefined);
    const api = recurrenceApi({
      catalog: vi.fn(() => never),
      list: vi.fn(() => never),
      summary: vi.fn(() => never),
      detail: vi.fn(() => never),
    });
    window.history.replaceState({}, "", `/reincidencias?recurrenceSelectedId=${recurrenceId}`);
    const { unmount } = renderWorkspace({ api });
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(1));
    const signals = [
      vi.mocked(api.catalog).mock.calls[0]?.[0],
      vi.mocked(api.list).mock.calls[0]?.[1],
      vi.mocked(api.summary).mock.calls[0]?.[1],
      vi.mocked(api.detail).mock.calls[0]?.[1],
    ] as AbortSignal[];

    unmount();

    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("no inicia lecturas diferidas si se desmonta antes del microtask inicial", async () => {
    const api = recurrenceApi();
    const { unmount } = renderWorkspace({ api });

    unmount();
    await flushPromises();

    expect(api.catalog).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.summary).not.toHaveBeenCalled();
  });

  it("carga selección inicial desde URL y cierra el detalle ante 404", async () => {
    window.history.replaceState({}, "", `/reincidencias?source=shell&recurrenceSelectedId=${recurrenceId}`);
    const api = recurrenceApi({ detail: vi.fn().mockRejectedValue(new ApiClientError(404, "NOT_FOUND", "interno")) });
    const { result } = renderWorkspace({ api });

    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.detailState).toBe("idle"));
    expect(api.detail).toHaveBeenCalledWith(recurrenceId, expect.any(AbortSignal));
    expect(result.current.selected).toBeNull();
    const query = new URLSearchParams(window.location.search);
    expect(query.has("recurrenceSelectedId")).toBe(false);
    expect(query.get("source")).toBe("shell");
  });

  it("no recarga listado al seleccionar, cerrar o retirar un detalle 404", async () => {
    const api = recurrenceApi({
      detail: vi.fn()
        .mockResolvedValueOnce(detail)
        .mockRejectedValueOnce(new ApiClientError(404, "NOT_FOUND", "interno")),
    });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => result.current.select(recurrenceId));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    expect(api.list).toHaveBeenCalledTimes(1);

    act(() => result.current.closeDetail());
    expect(result.current.detailState).toBe("idle");
    await flushPromises();
    expect(api.list).toHaveBeenCalledTimes(1);

    act(() => result.current.select(recurrenceId));
    await waitFor(() => expect(result.current.query.selectedId).toBeNull());
    expect(result.current.detailState).toBe("idle");
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("reconcilia la selección por versión y descarta el detalle anterior", async () => {
    const oldDetail = deferred<RecurrenceDetail>();
    const newDetail = deferred<RecurrenceDetail>();
    const api = recurrenceApi({ detail: vi.fn().mockImplementationOnce(() => oldDetail.promise).mockImplementationOnce(() => newDetail.promise) });
    const { result } = renderWorkspace({ api });

    act(() => result.current.select(recurrenceId));
    act(() => result.current.select(anotherRecurrenceId));
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2));
    oldDetail.resolve(detail);
    await flushPromises();
    expect(result.current.selected).toBeNull();
    newDetail.resolve({ ...detail, id: anotherRecurrenceId, recurrenceNumber: "RI-2026-0002", version: 2 });
    await waitFor(() => expect(result.current.selected?.id).toBe(anotherRecurrenceId));
  });

  it("reconcilia respuestas del mismo ID conservando la versión superior", async () => {
    const version3 = { ...detail, version: 3, detectedProblem: "Versión tres" };
    const version2 = { ...detail, version: 2, detectedProblem: "Versión obsoleta" };
    const version4 = { ...detail, version: 4, detectedProblem: "Versión cuatro" };
    const api = recurrenceApi({
      detail: vi.fn().mockResolvedValueOnce(version3).mockResolvedValueOnce(version2).mockResolvedValueOnce(version4),
    });
    const { result } = renderWorkspace({ api });

    act(() => result.current.select(recurrenceId));
    await waitFor(() => expect(result.current.selected).toEqual(version3));
    act(() => result.current.retryDetail());
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    expect(result.current.selected).toEqual(version3);

    act(() => result.current.retryDetail());
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.selected).toEqual(version4));
  });

  it("cierra un detalle cargado ante 404 de retry sin recargar listado", async () => {
    const api = recurrenceApi({
      detail: vi.fn().mockResolvedValueOnce(detail).mockRejectedValueOnce(new ApiClientError(404, "NOT_FOUND", "interno")),
    });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    act(() => result.current.select(recurrenceId));
    await waitFor(() => expect(result.current.selected).toEqual(detail));

    act(() => result.current.retryDetail());
    await waitFor(() => expect(result.current.detailState).toBe("idle"));

    expect(result.current.selected).toBeNull();
    expect(result.current.query.selectedId).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("invalida detalle de popstate antes del microtask de la selección siguiente", async () => {
    const oldDetail = deferred<RecurrenceDetail>();
    const newDetail = deferred<RecurrenceDetail>();
    const api = recurrenceApi({
      detail: vi.fn().mockImplementationOnce(() => oldDetail.promise).mockImplementationOnce(() => newDetail.promise),
    });
    window.history.replaceState({}, "", `/reincidencias?recurrenceSelectedId=${recurrenceId}`);
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(api.detail).mock.calls[0]?.[1] as AbortSignal;

    act(() => {
      window.history.pushState({}, "", `/reincidencias?recurrenceSelectedId=${anotherRecurrenceId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      oldDetail.resolve(detail);
    });

    expect(oldSignal.aborted).toBe(true);
    await flushPromises();
    expect(result.current.selected).toBeNull();
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2));
    newDetail.resolve({ ...detail, id: anotherRecurrenceId });
    await waitFor(() => expect(result.current.selected?.id).toBe(anotherRecurrenceId));
  });

  it("restaura filtros y selección al navegar con popstate", async () => {
    const api = recurrenceApi({
      list: vi.fn(async (filters) => ({ ...page, pagination: { ...page.pagination, page: filters.page, totalPages: 3 } })),
      detail: vi.fn(async (id) => ({ ...detail, id })),
    });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => {
      window.history.pushState({}, "", `/reincidencias?recurrenceStatus=ANALYSIS&recurrencePage=2&recurrenceSelectedId=${anotherRecurrenceId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(result.current.query).toMatchObject({ filters: { status: ["ANALYSIS"], page: 2 }, selectedId: anotherRecurrenceId }));
    await waitFor(() => expect(result.current.selected?.id).toBe(anotherRecurrenceId));
  });

  it("impone la búsqueda global vigente en popstate y conserva filtros locales", async () => {
    const api = recurrenceApi({
      list: vi.fn(async (filters) => ({
        ...page,
        pagination: { ...page.pagination, page: filters.page, totalItems: 41, totalPages: 3 },
      })),
    });
    const { result } = renderWorkspace({ api, search: " router global " });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => {
      window.history.pushState({}, "", "/reincidencias?recurrenceSearch=historial&recurrenceStatus=ANALYSIS&recurrenceImpact=HIGH&recurrencePage=2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(result.current.query.filters).toMatchObject({
      search: "router global",
      status: ["ANALYSIS"],
      impact: ["HIGH"],
      page: 1,
    }));
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "router global",
      status: ["ANALYSIS"],
      impact: ["HIGH"],
      page: 1,
    }), expect.any(AbortSignal));
  });

  it("sincroniza búsqueda externa en página 1 conservando filtros locales", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/reincidencias?recurrenceStatus=OPEN&recurrenceImpact=HIGH&recurrencePage=3");
    const api = recurrenceApi({ list: vi.fn(async (filters) => ({ ...page, pagination: { ...page.pagination, page: filters.page, totalPages: 3 } })) });
    const stableOptions = options({ api });
    const { result, rerender } = renderHook(
      ({ search }) => useRecurrencesWorkspace({ ...stableOptions, search }),
      { initialProps: { search: "" } },
    );
    await act(async () => { await Promise.resolve(); });

    rerender({ search: " router central " });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(result.current.query.filters).toMatchObject({ search: "router central", status: ["OPEN"], impact: ["HIGH"], page: 1 });
  });

  it("corrige una página fuera de rango y hace una sola recarga en la última página", async () => {
    window.history.replaceState({}, "", "/reincidencias?recurrencePage=4");
    const api = recurrenceApi({
      list: vi.fn()
        .mockResolvedValueOnce({ items: [], pagination: { page: 4, pageSize: 20, totalItems: 21, totalPages: 2 } })
        .mockResolvedValueOnce({ ...page, pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 } }),
    });
    const { result } = renderWorkspace({ api });

    await waitFor(() => expect(result.current.page?.pagination.page).toBe(2));

    expect(vi.mocked(api.list).mock.calls.map(([filters]) => filters.page)).toEqual([4, 2]);
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(result.current.query.filters.page).toBe(2);
    expect(new URLSearchParams(window.location.search).get("recurrencePage")).toBe("2");
  });

  it("mantiene el resumen ready sin refetch al cambiar página, tamaño o selección", async () => {
    const api = recurrenceApi({
      list: vi.fn(async (filters) => ({
        ...page,
        pagination: { page: filters.page, pageSize: filters.pageSize, totalItems: 60, totalPages: 3 },
      })),
    });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current.summaryState).toBe("ready"));

    act(() => result.current.setFilters({ page: 2 }));
    await waitFor(() => expect(result.current.query.filters.page).toBe(2));
    expect(result.current.summaryState).toBe("ready");
    expect(api.summary).toHaveBeenCalledTimes(1);

    act(() => result.current.setFilters({ pageSize: 40 }));
    await waitFor(() => expect(result.current.query.filters.pageSize).toBe(40));
    expect(result.current.summaryState).toBe("ready");
    expect(api.summary).toHaveBeenCalledTimes(1);

    act(() => result.current.select(recurrenceId));
    await waitFor(() => expect(result.current.detailState).toBe("ready"));
    expect(result.current.summaryState).toBe("ready");
    expect(api.summary).toHaveBeenCalledTimes(1);

    act(() => result.current.closeDetail());
    expect(result.current.summaryState).toBe("ready");
    expect(api.summary).toHaveBeenCalledTimes(1);
  });

  it("compone select y setFilters batched conservando selección, URL y filtro de loader", async () => {
    const api = recurrenceApi({
      list: vi.fn(async (filters) => ({
        ...page,
        pagination: { ...page.pagination, page: filters.page, totalItems: 41, totalPages: 3 },
      })),
    });
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    act(() => {
      result.current.select(anotherRecurrenceId);
      result.current.setFilters({ impact: ["HIGH"] });
    });

    await waitFor(() => expect(result.current.query).toMatchObject({
      selectedId: anotherRecurrenceId,
      filters: { impact: ["HIGH"], page: 1 },
    }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ impact: ["HIGH"], page: 1 }), expect.any(AbortSignal));
    await waitFor(() => {
      const url = new URLSearchParams(window.location.search);
      expect(url.get("recurrenceSelectedId")).toBe(anotherRecurrenceId);
      expect(url.getAll("recurrenceImpact")).toEqual(["HIGH"]);
    });
  });

  it("expone reintentos aislados y limpia el único estado de mutación", async () => {
    const api = recurrenceApi({
      catalog: vi.fn().mockRejectedValueOnce(new Error("catálogo")).mockResolvedValueOnce(catalog),
      list: vi.fn().mockRejectedValueOnce(new Error("lista")).mockResolvedValueOnce(page),
      summary: vi.fn().mockRejectedValueOnce(new Error("resumen")).mockResolvedValueOnce(summary),
      detail: vi.fn().mockRejectedValueOnce(new Error("detalle")).mockResolvedValueOnce(detail),
    });
    window.history.replaceState({}, "", `/reincidencias?recurrenceSelectedId=${recurrenceId}`);
    const { result } = renderWorkspace({ api });
    await waitFor(() => expect(result.current).toMatchObject({ catalogState: "error", listState: "error", summaryState: "error", detailState: "error" }));

    act(() => {
      result.current.retryCatalog();
      result.current.retryList();
      result.current.retrySummary();
      result.current.retryDetail();
      result.current.clearMutationError();
    });

    await waitFor(() => expect(result.current).toMatchObject({ catalogState: "ready", listState: "ready", summaryState: "ready", detailState: "ready", mutation: null }));
    expect(api.catalog).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.summary).toHaveBeenCalledTimes(2);
    expect(api.detail).toHaveBeenCalledTimes(2);
  });

  it("deriva capacidades exactas y prerrequisitos tipados de lookups", async () => {
    const { result } = renderWorkspace({ permissions: [
      "RECURRENCES_REVIEW", "EVIDENCES_UPLOAD", "EVIDENCES_MANAGE", "ORDERS_VIEW_OWN", "CLIENTS_VIEW",
    ] });

    expect(result.current.capabilities).toEqual({
      canReport: true,
      canReview: true,
      canViewAll: true,
      canUploadEvidence: true,
      canViewEvidence: false,
      canManageEvidence: true,
      lookupCapabilities: { orders: true, technicians: false, clients: true, branches: true },
    });
  });

  it("no ejecuta un lookup sin su prerrequisito", async () => {
    const rawLookups = lookupApi();
    const { result } = renderWorkspace({ lookupApi: rawLookups, permissions: ["RECURRENCES_VIEW_ALL"] });

    await expect(result.current.lookupApi.orders("OT-1", ["COMPLETED"], 1)).rejects.toMatchObject({ name: "RecurrencePermissionError" });
    expect(rawLookups.orders).not.toHaveBeenCalled();
  });

  it("no inicia un lookup cuando la señal externa ya está abortada", async () => {
    const rawLookups = lookupApi();
    const external = new AbortController();
    external.abort();
    const { result } = renderWorkspace({ lookupApi: rawLookups, permissions: ["RECURRENCES_VIEW_ALL", "ORDERS_VIEW_ALL"] });

    await expect(result.current.lookupApi.orders("OT-1", ["COMPLETED"], 1, external.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(rawLookups.orders).not.toHaveBeenCalled();
  });

  it.each(["revocación", "desmontaje"])("retira listeners externos al invalidar por %s", async (reason) => {
    const pending = deferred<Awaited<ReturnType<RecurrenceLookupApi["orders"]>>>();
    const rawLookups = lookupApi({ orders: vi.fn(() => pending.promise) });
    const external = new AbortController();
    const removeListener = vi.spyOn(external.signal, "removeEventListener");
    const stableOptions = options({ lookupApi: rawLookups });
    const { result, rerender, unmount } = renderHook(
      ({ permissions }) => useRecurrencesWorkspace({ ...stableOptions, permissions }),
      { initialProps: { permissions: ["RECURRENCES_VIEW_ALL", "ORDERS_VIEW_ALL"] } },
    );
    const request = result.current.lookupApi.orders("OT-1", ["COMPLETED"], 1, external.signal);
    void request.catch(() => undefined);
    await waitFor(() => expect(rawLookups.orders).toHaveBeenCalledTimes(1));

    if (reason === "revocación") rerender({ permissions: ["RECURRENCES_VIEW_ALL"] });
    else unmount();
    await flushPromises();

    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    pending.resolve({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("aborta e invalida lookups pendientes al revocar permisos sin borrar detalle permitido", async () => {
    const pending = deferred<Awaited<ReturnType<RecurrenceLookupApi["orders"]>>>();
    const rawLookups = lookupApi({ orders: vi.fn(() => pending.promise) });
    const stableOptions = options({ lookupApi: rawLookups });
    const { result, rerender } = renderHook(
      ({ permissions }) => useRecurrencesWorkspace({ ...stableOptions, permissions }),
      { initialProps: { permissions: ["RECURRENCES_VIEW_ALL", "ORDERS_VIEW_ALL"] } },
    );
    act(() => result.current.select(recurrenceId));
    await waitFor(() => expect(result.current.selected).toEqual(detail));
    const request = result.current.lookupApi.orders("OT-1", ["COMPLETED"], 1);
    await waitFor(() => expect(rawLookups.orders).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(rawLookups.orders).mock.calls[0]?.[3] as AbortSignal;

    rerender({ permissions: ["RECURRENCES_VIEW_ALL"] });
    await flushPromises();

    expect(signal.aborted).toBe(true);
    expect(result.current.capabilities.lookupCapabilities.orders).toBe(false);
    expect(result.current.selected).toEqual(detail);
    pending.resolve({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("aborta el lookup en layout antes de resolver durante el commit revocado", async () => {
    const pending = deferred<Awaited<ReturnType<RecurrenceLookupApi["orders"]>>>();
    const rawLookups = lookupApi({ orders: vi.fn(() => pending.promise) });
    const stableOptions = options({ lookupApi: rawLookups });
    const commitObservation: { signal?: AbortSignal; aborted?: boolean } = {};
    const { result, rerender } = renderHook(
      ({ permissions }) => {
        const workspace = useRecurrencesWorkspace({ ...stableOptions, permissions });
        useLayoutEffect(() => {
          if (permissions.includes("ORDERS_VIEW_ALL") || !commitObservation.signal) return;
          commitObservation.aborted = commitObservation.signal.aborted;
          pending.resolve({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
        }, [permissions]);
        return workspace;
      },
      { initialProps: { permissions: ["RECURRENCES_VIEW_ALL", "ORDERS_VIEW_ALL"] } },
    );
    const request = result.current.lookupApi.orders("OT-1", ["COMPLETED"], 1);
    void request.catch(() => undefined);
    await waitFor(() => expect(rawLookups.orders).toHaveBeenCalledTimes(1));
    commitObservation.signal = vi.mocked(rawLookups.orders).mock.calls[0]?.[3] as AbortSignal;

    rerender({ permissions: ["RECURRENCES_VIEW_ALL"] });

    expect(commitObservation.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cierra únicamente el modo de acción que deja de estar autorizado", async () => {
    const stableOptions = options();
    const { result, rerender } = renderHook(
      ({ permissions }) => useRecurrencesWorkspace({ ...stableOptions, permissions }),
      { initialProps: { permissions: ["RECURRENCES_VIEW_ALL", "RECURRENCES_REVIEW"] } },
    );
    act(() => {
      result.current.select(recurrenceId);
      result.current.setActionMode("analyze");
    });
    await waitFor(() => expect(result.current.selected).toEqual(detail));
    expect(result.current.actionMode).toBe("analyze");

    rerender({ permissions: ["RECURRENCES_VIEW_ALL"] });
    await flushPromises();

    expect(result.current.actionMode).toBeNull();
    expect(result.current.selected).toEqual(detail);
  });

  it("aborta lecturas de evidencia al revocar EVIDENCES_VIEW", async () => {
    const pending = deferred<Awaited<ReturnType<EvidenceApi["listRecurrence"]>>>();
    const rawEvidence = evidenceApi({ listRecurrence: vi.fn(() => pending.promise) });
    const stableOptions = options({ evidenceApi: rawEvidence });
    const { result, rerender } = renderHook(
      ({ permissions }) => useRecurrencesWorkspace({ ...stableOptions, permissions }),
      { initialProps: { permissions: ["RECURRENCES_VIEW_ALL", "EVIDENCES_VIEW"] } },
    );
    const request = result.current.evidenceApi.listRecurrence(recurrenceId, 1);
    await waitFor(() => expect(rawEvidence.listRecurrence).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(rawEvidence.listRecurrence).mock.calls[0]?.[2] as AbortSignal;

    rerender({ permissions: ["RECURRENCES_VIEW_ALL"] });
    await flushPromises();

    expect(signal.aborted).toBe(true);
    pending.resolve({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
