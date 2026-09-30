import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperationalDashboardApi } from "../api/dashboard";
import { ApiClientError } from "../api/http";
import type { OperationalDashboard } from "../models/dashboard";
import { useOperationalDashboard } from "./useOperationalDashboard";

const dashboard: OperationalDashboard = {
  date: "2026-09-30",
  generatedAt: "2026-09-30T12:00:00.000Z",
  capabilities: { team: true, recentActivities: true, recurrences: true },
  team: [{ id: "tech-1", code: "TEC-001", fullName: "Ana Torres", specialty: null, status: "BUSY", activeActivity: null }],
  recentActivities: [],
  recurrences: { openCases: 0, highImpactOpenCases: 0, averageVisits: 0, priorityCase: null },
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function apiMock(getOperationalDashboard = vi.fn(async () => dashboard)): OperationalDashboardApi {
  return { getOperationalDashboard };
}

async function flushPromises() {
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => vi.useRealTimers());

describe("useOperationalDashboard", () => {
  it("carga la jornada inicial y clasifica una respuesta sin contenido como vacia", async () => {
    const api = apiMock(vi.fn(async () => ({ ...dashboard, team: [], recentActivities: [], recurrences: { openCases: 0, highImpactOpenCases: 0, averageVisits: 0, priorityCase: null } })));
    const { result } = renderHook(() => useOperationalDashboard(api));

    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("empty"));
    expect(api.getOperationalDashboard).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it("conserva la ultima jornada y permite retry cuando falla un refresh", async () => {
    const getOperationalDashboard = vi.fn()
      .mockResolvedValueOnce(dashboard)
      .mockRejectedValueOnce(new Error("Sin conexion"))
      .mockResolvedValueOnce({ ...dashboard, date: "2026-10-01" });
    const api = apiMock(getOperationalDashboard);
    const { result } = renderHook(() => useOperationalDashboard(api));
    await waitFor(() => expect(result.current.state.status).toBe("success"));

    await act(async () => { await result.current.refresh(); });
    expect(result.current.state).toMatchObject({ status: "error", data: dashboard, message: "Sin conexion" });

    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "success", data: { date: "2026-10-01" } }));
  });

  it("retira la instantanea operativa cuando el servidor niega acceso", async () => {
    const getOperationalDashboard = vi.fn().mockResolvedValueOnce(dashboard).mockRejectedValueOnce(new ApiClientError(403, "FORBIDDEN", "Sin permiso"));
    const api = apiMock(getOperationalDashboard);
    const { result } = renderHook(() => useOperationalDashboard(api));
    await waitFor(() => expect(result.current.state.status).toBe("success"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state).toMatchObject({ status: "error", message: "Sin permiso" });
    expect(result.current.state.data).toBeUndefined();
  });

  it("aborta y descarta la respuesta anterior al cambiar fecha o desmontar", async () => {
    const first = deferred<OperationalDashboard>();
    const second = deferred<OperationalDashboard>();
    const getOperationalDashboard = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const api = apiMock(getOperationalDashboard);
    const { result, unmount } = renderHook(() => useOperationalDashboard(api));
    const firstSignal = getOperationalDashboard.mock.calls[0]?.[1] as AbortSignal;

    act(() => result.current.setDate("2026-10-01"));
    expect(firstSignal.aborted).toBe(true);
    first.resolve({ ...dashboard, date: "old" });
    await flushPromises();
    expect(result.current.state.data?.date).not.toBe("old");

    const secondSignal = getOperationalDashboard.mock.calls[1]?.[1] as AbortSignal;
    unmount();
    expect(secondSignal.aborted).toBe(true);
  });

  it("hace polling cada minuto solo mientras la pestaña esta visible", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    const getOperationalDashboard = vi.fn(async (_date?: string, _signal?: AbortSignal) => dashboard);
    const api = apiMock(getOperationalDashboard);
    const { result } = renderHook(() => useOperationalDashboard(api));
    await flushPromises();
    getOperationalDashboard.mockClear();

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(getOperationalDashboard).toHaveBeenCalledTimes(1);

    const visibleSignal = getOperationalDashboard.mock.calls[0]?.[1] as AbortSignal;
    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(visibleSignal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(getOperationalDashboard).toHaveBeenCalledTimes(1);

    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushPromises();
    expect(getOperationalDashboard).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe("success");
  });
});
