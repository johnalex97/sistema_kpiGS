import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientsApi } from "../api/clients";
import type { ClientDetail, ClientListFilters, ClientPage, ClientSummary } from "../models/client";
import { useClientsWorkspace } from "./useClientsWorkspace";

const clientA: ClientSummary = {
  id: "client-a", code: "CLI-001", tradeName: "Acme", legalName: null, taxId: null,
  phone: null, email: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", version: 1, activeBranchCount: 1, activeContactCount: 1,
};
const clientB: ClientSummary = { ...clientA, id: "client-b", code: "CLI-002", tradeName: "Beta" };
const detailA: ClientDetail = { ...clientA, notes: null, branches: [], contacts: [] };
const detailB: ClientDetail = { ...clientB, notes: null, branches: [], contacts: [] };
const page = (items: ClientSummary[]): ClientPage => ({
  items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function apiWith(overrides: Partial<Pick<ClientsApi, "listClients" | "getClient">> = {}): ClientsApi {
  return {
    listClients: vi.fn(async () => page([clientA, clientB])),
    getClient: vi.fn(async (id: string) => id === clientA.id ? detailA : detailB),
    ...overrides,
  } as ClientsApi;
}

const useWorkspace = (api: ClientsApi, search = "", permissions = ["CLIENTS_VIEW"]) =>
  useClientsWorkspace({ api, search, permissions });

beforeEach(() => window.history.replaceState({}, "", "/clientes"));
afterEach(() => vi.useRealTimers());

describe("useClientsWorkspace", () => {
  it("carga lista y detalle seleccionado, y guarda la selección en el historial", async () => {
    const list = deferred<ClientPage>();
    const detail = deferred<ClientDetail>();
    const api = apiWith({ listClients: vi.fn(() => list.promise), getClient: vi.fn(() => detail.promise) });
    const { result } = renderHook(() => useWorkspace(api));

    expect(result.current.list.status).toBe("loading");
    await act(async () => list.resolve(page([clientA])));
    expect(result.current.list.data?.items).toEqual([clientA]);
    expect(result.current.list.status).toBe("success");
    act(() => result.current.selectClient("client-a"));
    expect(window.location.search).toContain("clientId=client-a");
    expect(result.current.query.clientId).toBe("client-a");
    expect(result.current.detail.status).toBe("loading");
    await act(async () => detail.resolve(detailA));
    expect(result.current.detail.data?.id).toBe("client-a");
    expect(api.getClient).toHaveBeenCalledWith("client-a", false, expect.any(AbortSignal));
  });

  it("descarta detalle A tardío al seleccionar B aunque el API ignore abort", async () => {
    const a = deferred<ClientDetail>();
    const b = deferred<ClientDetail>();
    const api = apiWith({ getClient: vi.fn((id: string) => id === "client-a" ? a.promise : b.promise) });
    const { result } = renderHook(() => useWorkspace(api));
    act(() => result.current.selectClient("client-a"));
    const signalA = vi.mocked(api.getClient).mock.calls[0]?.[2];
    act(() => result.current.selectClient("client-b"));
    expect(signalA?.aborted).toBe(true);
    await act(async () => a.resolve(detailA));
    expect(result.current.query.clientId).toBe("client-b");
    expect(result.current.detail.data).toBeNull();
    await act(async () => b.resolve(detailB));
    expect(result.current.detail.data).toEqual(detailB);
  });

  it("no reconcilia el detalle A cargado como si fuera B cuando B responde en el mismo batch", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.detail.data?.id).toBe("client-a"));

    await act(async () => {
      result.current.selectClient("client-b");
      await Promise.resolve();
    });

    expect(result.current.query.clientId).toBe("client-b");
    expect(result.current.detail.data).toEqual(detailB);
  });

  it("popstate reconstruye y recarga incluso con el mismo clientId", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=branches&source=shell");
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    expect(api.getClient).toHaveBeenCalledTimes(1);

    window.history.pushState({}, "", "/clientes?clientId=client-a&clientTab=contacts&source=shell");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await waitFor(() => expect(api.getClient).toHaveBeenCalledTimes(2));
    expect(result.current.query.tab).toBe("contacts");
    expect(result.current.detail.status).toBe("success");
    expect(window.location.search).toContain("source=shell");
  });

  it("cancela una búsqueda superior pendiente al restaurar una URL histórica", async () => {
    const api = apiWith();
    const { result, rerender } = renderHook(({ search }) => useWorkspace(api, search), { initialProps: { search: "" } });
    vi.useFakeTimers();
    rerender({ search: "nueva" });
    window.history.pushState({}, "", "/clientes?search=historica&page=2");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.query.clients).toMatchObject({ search: "historica", page: 2 });
    expect(new URLSearchParams(window.location.search).get("search")).toBe("historica");
  });

  it("aborta lista y detalle al desmontar y no publica respuestas tardías", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const list = deferred<ClientPage>();
    const detail = deferred<ClientDetail>();
    const api = apiWith({ listClients: vi.fn(() => list.promise), getClient: vi.fn(() => detail.promise) });
    const { unmount } = renderHook(() => useWorkspace(api));
    const listSignal = vi.mocked(api.listClients).mock.calls[0]?.[1];
    const detailSignal = vi.mocked(api.getClient).mock.calls[0]?.[2];
    unmount();
    expect(listSignal?.aborted).toBe(true);
    expect(detailSignal?.aborted).toBe(true);
    await act(async () => { list.resolve(page([clientA])); detail.resolve(detailA); });
  });

  it("conserva lista anterior marcada stale tras error y permite reintentar", async () => {
    const failure = deferred<ClientPage>();
    const api = apiWith({ listClients: vi.fn().mockResolvedValueOnce(page([clientA])).mockImplementationOnce(() => failure.promise).mockResolvedValueOnce(page([clientB])) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.refreshList(); });
    await act(async () => failure.reject(new Error("Falla temporal")));
    await pending;
    expect(result.current.list).toMatchObject({ status: "error", error: "Falla temporal", stale: true });
    expect(result.current.list.data?.items).toEqual([clientA]);
    await act(async () => result.current.refreshList());
    expect(result.current.list).toMatchObject({ status: "success", error: null, stale: false });
    expect(result.current.list.data?.items).toEqual([clientB]);
  });

  it("conserva detalle anterior stale tras error y lo recupera al reintentar", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce(detailA).mockRejectedValueOnce(new Error("Red inestable")).mockResolvedValueOnce({ ...detailA, version: 2 }) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    await act(async () => result.current.refreshDetail());
    expect(result.current.detail).toMatchObject({ status: "error", error: "Red inestable", stale: true });
    expect(result.current.detail.data?.id).toBe("client-a");
    await act(async () => result.current.refreshDetail());
    expect(result.current.detail).toMatchObject({ status: "success", error: null, stale: false });
    expect(result.current.detail.data?.version).toBe(2);
  });

  it("no reutiliza un cliente de versión anterior al cambiar filtros de lista", async () => {
    const old = { ...clientA, version: 8, tradeName: "Acme antigua" };
    const fresh = { ...clientA, version: 2, tradeName: "Acme filtrada" };
    const api = apiWith({ listClients: vi.fn().mockResolvedValueOnce(page([old])).mockResolvedValueOnce(page([fresh])) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.setClientFilters({ search: "filtrada" }));
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    expect(result.current.list.data?.items[0]).toEqual(fresh);
  });

  it("descarta la lista tardía de filtros anteriores", async () => {
    const previous = deferred<ClientPage>();
    const latest = deferred<ClientPage>();
    const api = apiWith({ listClients: vi.fn().mockImplementationOnce(() => previous.promise).mockImplementationOnce(() => latest.promise) });
    const { result } = renderHook(() => useWorkspace(api));
    const previousSignal = vi.mocked(api.listClients).mock.calls[0]?.[1];
    act(() => result.current.setClientFilters({ search: "Beta" }));
    expect(previousSignal?.aborted).toBe(true);
    await act(async () => previous.resolve(page([clientA])));
    expect(result.current.list.data).toBeNull();
    await act(async () => latest.resolve(page([clientB])));
    expect(result.current.list.data?.items).toEqual([clientB]);
  });

  it("aplica filtros con replaceState y cierra detalle con pushState", async () => {
    window.history.replaceState({}, "", "/clientes?source=shell&clientId=client-a&page=4");
    const api = apiWith();
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useWorkspace(api));
    act(() => result.current.setClientFilters({ search: "Beta", includeInactive: true }));
    expect(result.current.query.clients).toMatchObject({ search: "Beta", includeInactive: true, page: 1 });
    expect(window.location.search).toContain("source=shell");
    expect(window.location.search).toContain("search=Beta");
    expect(replace).toHaveBeenCalled();
    act(() => result.current.closeDetail());
    expect(result.current.query.clientId).toBeNull();
    expect(new URLSearchParams(window.location.search).has("clientId")).toBe(false);
    expect(push).toHaveBeenCalled();
    replace.mockRestore();
    push.mockRestore();
  });

  it("isActive=false normaliza includeInactive en estado y recarga detalle con inactivos", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    act(() => result.current.setClientFilters({ isActive: false }));

    expect(result.current.query.clients).toMatchObject({ isActive: false, includeInactive: true });
    await waitFor(() => expect(api.getClient).toHaveBeenCalledTimes(2));
    expect(api.getClient).toHaveBeenLastCalledWith("client-a", true, expect.any(AbortSignal));
  });

  it.each([
    ["true", true],
    ["undefined", undefined],
  ])("restablece includeInactive al cambiar isActive de false a %s", async (_label, isActive) => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    await act(async () => result.current.setClientFilters({ isActive: false }));
    expect(result.current.query.clients.includeInactive).toBe(true);

    const patch = { isActive } as Partial<ClientListFilters>;
    await act(async () => result.current.setClientFilters(patch));
    expect(result.current.query.clients.includeInactive).toBe(false);
    expect(new URLSearchParams(window.location.search).get("includeInactive")).toBe("false");
    await waitFor(() => expect(api.getClient).toHaveBeenCalledTimes(3));
    expect(api.getClient).toHaveBeenLastCalledWith("client-a", false, expect.any(AbortSignal));
  });

  it("respeta includeInactive:true explícito al salir de isActive=false", async () => {
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    act(() => result.current.setClientFilters({ isActive: false }));
    act(() => result.current.setClientFilters({ isActive: true, includeInactive: true }));
    expect(result.current.query.clients).toMatchObject({ isActive: true, includeInactive: true });
    expect(new URLSearchParams(window.location.search).get("includeInactive")).toBe("true");
  });

  it("conserva filtros hijos al volver a seleccionar el mismo cliente", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=contacts&contactScope=BRANCH&contactPage=3");
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    await act(async () => result.current.selectClient("client-a"));
    expect(result.current.query.contacts).toMatchObject({ scope: "BRANCH", page: 3 });
    expect(new URLSearchParams(window.location.search).get("contactScope")).toBe("BRANCH");
  });

  it("no solicita lecturas sin permiso de vista", async () => {
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api, "", []));
    expect(result.current.capabilities).toEqual({ canView: false, canManage: false });
    expect(result.current.list.status).toBe("idle");
    expect(api.listClients).not.toHaveBeenCalled();
    act(() => result.current.selectClient("client-a"));
    expect(api.getClient).not.toHaveBeenCalled();
  });

  it("vuelve a cargar al remount de StrictMode sin publicar el primer intento abortado", async () => {
    const first = deferred<ClientPage>();
    const api = apiWith({ listClients: vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValueOnce(page([clientB])) });
    const { result } = renderHook(() => useWorkspace(api), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    expect(result.current.list.data?.items).toEqual([clientB]);
    await act(async () => first.resolve(page([clientA])));
    expect(result.current.list.data?.items).toEqual([clientB]);
  });
});
