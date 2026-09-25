import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientsApi } from "../api/clients";
import type { ClientDetail, ClientListFilters, ClientPage, ClientSummary, CreateClientInput } from "../models/client";
import { useClientsWorkspace } from "./useClientsWorkspace";
import { ApiClientError } from "../api/http";

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

describe("edición y ciclo de vida del cliente", () => {
  const manageable = ["CLIENTS_VIEW", "CLIENTS_MANAGE"];

  it("mantiene la versión base v3 y el borrador cuando una lectura posterior trae v9", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const background = deferred<ClientDetail>();
    const updateClient = vi.fn(async () => ({ ...detailA, version: 10, tradeName: "Borrador" }));
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockImplementationOnce(() => background.promise).mockResolvedValue({ ...detailA, version: 9, tradeName: "Servidor" }), updateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    act(() => result.current.changeClientEdit({ tradeName: "Borrador" }));
    expect(result.current.edit?.draft?.baseVersion).toBe(3);
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshDetail(); });
    await act(async () => background.resolve({ ...detailA, version: 9, tradeName: "Servidor" }));
    await refresh;
    expect(result.current.detail.data?.version).toBe(9);
    expect(result.current.edit?.draft?.values.tradeName).toBe("Borrador");
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(updateClient).toHaveBeenCalledWith(clientA.id, { version: 3, tradeName: "Borrador" });
    expect(result.current.detail.data?.version).toBe(10);
  });

  it("conserva borrador tras 409, revisa vigente y sólo adopta su versión explícitamente", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const updateClient = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "interno")).mockResolvedValueOnce({ ...detailA, version: 10, tradeName: "Borrador" });
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValue({ ...detailA, version: 9, tradeName: "Servidor" }), updateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    act(() => result.current.changeClientEdit({ tradeName: "Borrador" }));
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(result.current.edit?.draft).toMatchObject({ baseVersion: 3, values: { tradeName: "Borrador" }, conflict: null });
    expect(result.current.edit?.error).toMatch(/cambió|versión/i);
    expect(updateClient).toHaveBeenCalledTimes(1);
    await act(async () => result.current.reviewClientConflict());
    expect(result.current.edit?.draft?.conflict).toMatchObject({ version: 9, tradeName: "Servidor" });
    expect(result.current.edit?.draft?.values.tradeName).toBe("Borrador");
    act(() => result.current.adoptClientConflict());
    expect(result.current.edit?.draft).toMatchObject({ baseVersion: 9, values: { tradeName: "Borrador" }, conflict: null });
    expect(updateClient).toHaveBeenCalledTimes(1);
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(updateClient).toHaveBeenLastCalledWith(clientA.id, { version: 9, tradeName: "Borrador" });
  });

  it.each([
    ["TAX_ID_ALREADY_EXISTS", "RTN"],
    ["RESOURCE_INACTIVE", "inactivo"],
  ])("mantiene edición y mensaje operativo para %s", async (code, visible) => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith({ updateClient: vi.fn().mockRejectedValue(new ApiClientError(409, code, "interno")) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openEdit());
    act(() => result.current.changeClientEdit({ tradeName: "Borrador" }));
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(result.current.edit?.open).toBe(true);
    expect(result.current.edit?.draft?.values.tradeName).toBe("Borrador");
    expect(result.current.edit?.error).toContain(visible);
  });

  it("desactiva y reactiva con motivo recortado y versión base sin reescribir hijos", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const child = { id: "branch-1", clientId: clientA.id, code: "S-1", name: "Principal", address: "Centro", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null, isActive: true, isEffectivelyActive: true, createdAt: clientA.createdAt, updatedAt: clientA.updatedAt, version: 2 };
    const active = { ...detailA, version: 3, branches: [child] };
    const inactive = { ...active, version: 7, isActive: false };
    const restored = { ...active, version: 11 };
    const deactivateClient = vi.fn(async () => inactive);
    const reactivateClient = vi.fn(async () => restored);
    const api = apiWith({ getClient: vi.fn(async () => active), deactivateClient, reactivateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("  Cierre administrativo  "));
    expect(deactivateClient).toHaveBeenCalledWith(clientA.id, { version: 3, reason: "Cierre administrativo" });
    expect(result.current.detail.data?.version).toBe(7);
    expect(result.current.detail.data?.branches[0]?.isActive).toBe(true);
    act(() => result.current.openClientLifecycle("reactivate"));
    await act(async () => result.current.submitClientLifecycle("  Apertura solicitada  "));
    expect(reactivateClient).toHaveBeenCalledWith(clientA.id, { version: 7, reason: "Apertura solicitada" });
    expect(result.current.detail.data?.version).toBe(11);
  });

  it("rechaza 9/501 caracteres, bloquea doble envío y preserva motivo ante trabajo activo", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const pending = deferred<ClientDetail>();
    const deactivateClient = vi.fn().mockImplementationOnce(() => pending.promise).mockRejectedValueOnce(new ApiClientError(409, "CLIENT_HAS_ACTIVE_WORK", "interno"));
    const api = apiWith({ deactivateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("123456789"));
    await act(async () => result.current.submitClientLifecycle("x".repeat(501)));
    expect(deactivateClient).not.toHaveBeenCalled();
    let first!: Promise<void>;
    act(() => { first = result.current.submitClientLifecycle("Cierre administrativo"); });
    await act(async () => result.current.submitClientLifecycle("Segundo intento"));
    expect(deactivateClient).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new ApiClientError(409, "CLIENT_HAS_ACTIVE_WORK", "interno")));
    await first;
    expect(result.current.lifecycle?.open).toBe(true);
    expect(result.current.lifecycle?.reason).toBe("Cierre administrativo");
    expect(result.current.lifecycle?.error).toContain("trabajo activo");
  });

  it("404 cierra sólo el cliente afectado y refresca lista", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const listClients = vi.fn(async () => page([clientB]));
    const api = apiWith({ listClients, updateClient: vi.fn().mockRejectedValue(new ApiClientError(404, "NOT_FOUND", "interno")) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openEdit());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(result.current.query.clientId).toBeNull();
    expect(result.current.edit?.open).toBe(false);
    await waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
  });

  it("no ofrece mutaciones sin permiso y cierra borrador al revocarse la gestión", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith({ updateClient: vi.fn() });
    const { result, rerender } = renderHook(({ permissions }) => useWorkspace(api, "", permissions), { initialProps: { permissions: manageable } });
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openEdit());
    expect(result.current.edit?.open).toBe(true);
    rerender({ permissions: ["CLIENTS_VIEW"] });
    await waitFor(() => expect(result.current.edit?.open).toBe(false));
    act(() => result.current.openEdit());
    await act(async () => result.current.submitClientEdit({ tradeName: "No autorizado" }));
    expect(api.updateClient).not.toHaveBeenCalled();
  });

  it("descarta borradores al limpiar la selección y al perder vista aunque gestión permanezca", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith({ updateClient: vi.fn() });
    const { result, rerender } = renderHook(({ permissions }) => useWorkspace(api, "", permissions), { initialProps: { permissions: manageable } });
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openEdit());
    act(() => result.current.changeClientEdit({ tradeName: "Privado" }));
    act(() => result.current.clearClientFilters());
    expect(result.current.edit.draft).toBeNull();
    act(() => result.current.selectClient("client-a"));
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openEdit());
    rerender({ permissions: ["CLIENTS_MANAGE"] });
    await waitFor(() => expect(result.current.edit.draft).toBeNull());
    expect(api.updateClient).not.toHaveBeenCalled();
  });

  it("no abre edición ni desactivación para un cliente inactivo", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const inactive = { ...detailA, isActive: false, version: 7 };
    const api = apiWith({ getClient: vi.fn(async () => inactive), updateClient: vi.fn(), deactivateClient: vi.fn() });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(7));
    act(() => result.current.openEdit());
    act(() => result.current.openClientLifecycle("deactivate"));
    expect(result.current.edit.open).toBe(false);
    expect(result.current.lifecycle.open).toBe(false);
    expect(api.updateClient).not.toHaveBeenCalled();
    expect(api.deactivateClient).not.toHaveBeenCalled();
  });

  it("mantiene motivo y versión base de lifecycle durante 409 hasta adoptar la vigente", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const deactivateClient = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "interno")).mockResolvedValueOnce({ ...detailA, version: 12, isActive: false });
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValue({ ...detailA, version: 9 }), deactivateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    expect(result.current.lifecycle).toMatchObject({ open: true, baseVersion: 3, reason: "Cierre administrativo" });
    expect(deactivateClient).toHaveBeenCalledTimes(1);
    await act(async () => result.current.reviewClientConflict());
    expect(result.current.lifecycle.conflict?.version).toBe(9);
    expect(result.current.lifecycle.reason).toBe("Cierre administrativo");
    act(() => result.current.adoptClientConflict());
    expect(result.current.lifecycle).toMatchObject({ baseVersion: 9, reason: "Cierre administrativo", conflict: null });
    await act(async () => result.current.submitClientLifecycle(result.current.lifecycle.reason));
    expect(deactivateClient).toHaveBeenLastCalledWith(clientA.id, { version: 9, reason: "Cierre administrativo" });
  });

  it("no degrada versión confirmada al incluir inactivos y recibir GET anteriores", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const confirmed = { ...detailA, version: 7, isActive: false };
    const listClients = vi.fn(async () => page([clientA]));
    const getClient = vi.fn(async () => ({ ...detailA, version: 3 }));
    const api = apiWith({ listClients, getClient, deactivateClient: vi.fn(async () => confirmed) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    await waitFor(() => expect(getClient).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
    expect(result.current.query.clients.includeInactive).toBe(true);
    expect(result.current.detail.data).toMatchObject({ version: 7, isActive: false });
    expect(result.current.list.data?.items[0]).toMatchObject({ version: 7, isActive: false });
  });

  it("preserva v9 observada frente a mutación v4 tardía y GET v3 tras cambiar includeInactive", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const pendingMutation = deferred<ClientDetail>();
    const observed = { ...detailA, version: 9, tradeName: "Servidor v9", isActive: true };
    const staleMutation = { ...detailA, version: 4, tradeName: "Mutación v4", isActive: false };
    const getClient = vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValueOnce(observed).mockResolvedValue({ ...detailA, version: 3 });
    const api = apiWith({ getClient, listClients: vi.fn(async () => page([{ ...clientA, version: 3 }])), deactivateClient: vi.fn(() => pendingMutation.promise) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    let mutation!: Promise<void>;
    act(() => { mutation = result.current.submitClientLifecycle("Cierre administrativo"); });
    await act(async () => result.current.refreshDetail());
    expect(result.current.detail.data?.version).toBe(9);
    await act(async () => pendingMutation.resolve(staleMutation));
    await mutation;
    await waitFor(() => expect(getClient).toHaveBeenCalledTimes(3));
    expect(result.current.query.clients.includeInactive).toBe(true);
    expect(result.current.detail.data).toMatchObject({ version: 9, tradeName: "Servidor v9", isActive: true });
    expect(result.current.list.data?.items[0]).toMatchObject({ version: 9, tradeName: "Servidor v9", isActive: true });
  });

  it("mantiene v9 observada en la lista aunque detalle y mutación respondan v3/v4", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const pendingMutation = deferred<ClientDetail>();
    const listClients = vi.fn().mockResolvedValueOnce(page([{ ...clientA, version: 3 }]))
      .mockResolvedValueOnce(page([{ ...clientA, version: 9, tradeName: "Lista v9", isActive: true }]))
      .mockResolvedValue(page([{ ...clientA, version: 3 }]));
    const api = apiWith({ listClients, getClient: vi.fn(async () => ({ ...detailA, version: 3 })), deactivateClient: vi.fn(() => pendingMutation.promise) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.refreshList());
    expect(result.current.list.data?.items[0]).toMatchObject({ version: 9, tradeName: "Lista v9" });
    let mutation!: Promise<void>;
    act(() => { mutation = result.current.submitClientLifecycle("Cierre administrativo"); });
    await act(async () => pendingMutation.resolve({ ...detailA, version: 4, isActive: false }));
    await mutation;
    await waitFor(() => expect(listClients).toHaveBeenCalledTimes(3));
    expect(result.current.list.data?.items[0]).toMatchObject({ version: 9, tradeName: "Lista v9", isActive: true });
  });

  it("bloquea update si el cliente pasó a inactivo después de abrir edición", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const updateClient = vi.fn();
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3, isActive: true }).mockResolvedValue({ ...detailA, version: 9, isActive: false }), updateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    act(() => result.current.changeClientEdit({ tradeName: "Borrador privado" }));
    await act(async () => result.current.refreshDetail());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador privado" }));
    expect(updateClient).not.toHaveBeenCalled();
    expect(result.current.edit).toMatchObject({ open: true, draft: { baseVersion: 3, values: { tradeName: "Borrador privado" } } });
    expect(result.current.edit.error).toMatch(/inactivo/i);
  });

  it("usa el estado vigente obtenido al revisar conflicto para bloquear otro update", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const updateClient = vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "interno"));
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValue({ ...detailA, version: 9, isActive: false }), updateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    await act(async () => result.current.reviewClientConflict());
    expect(result.current.edit.draft?.conflict?.version).toBe(9);
    act(() => result.current.adoptClientConflict());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(updateClient).toHaveBeenCalledTimes(1);
    expect(result.current.edit.error).toMatch(/inactivo/i);
    expect(result.current.edit.draft?.values.tradeName).toBe("Borrador");
  });

  it("mantiene acceso a revisión de versión después de editar un campo tras 409", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith({ updateClient: vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "interno")) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openEdit());
    await act(async () => result.current.submitClientEdit({ tradeName: "Primer borrador" }));
    expect(result.current.edit.versionConflict).toBe(true);
    act(() => result.current.changeClientEdit({ tradeName: "Segundo borrador" }));
    expect(result.current.edit.error).toBeNull();
    expect(result.current.edit.versionConflict).toBe(true);
    expect(result.current.edit.draft?.values.tradeName).toBe("Segundo borrador");
  });

  it("conserva conflicto de edición tras 409 seguido de 500 sin adoptar", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const updateClient = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "interno"))
      .mockRejectedValueOnce(new ApiClientError(500, "SERVER_ERROR", "interno"));
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValue({ ...detailA, version: 9, tradeName: "Servidor" }), updateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    await act(async () => result.current.reviewClientConflict());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(updateClient).toHaveBeenNthCalledWith(2, clientA.id, { version: 3, tradeName: "Borrador" });
    expect(result.current.edit).toMatchObject({ open: true, versionConflict: true, draft: { baseVersion: 3, values: { tradeName: "Borrador" }, conflict: { version: 9, tradeName: "Servidor" } } });
    expect(result.current.edit.error).toMatch(/No fue posible/);
  });

  it("actualiza el recurso vigente de edición ante un segundo 409", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith({
      getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValueOnce({ ...detailA, version: 9 }).mockResolvedValue({ ...detailA, version: 11 }),
      updateClient: vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "interno")),
    });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    await act(async () => result.current.reviewClientConflict());
    expect(result.current.edit.draft?.conflict?.version).toBe(9);
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    expect(result.current.edit).toMatchObject({ versionConflict: true, draft: { baseVersion: 3, values: { tradeName: "Borrador" }, conflict: { version: 11 } } });
    expect(api.updateClient).toHaveBeenCalledTimes(2);
  });

  it("mantiene edición pendiente y Cancelar inoperable sólo mientras espera el GET automático", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const latest = deferred<ClientDetail>();
    const getClient = vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValueOnce({ ...detailA, version: 9 }).mockImplementationOnce(() => latest.promise);
    const api = apiWith({ getClient, updateClient: vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "interno")) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openEdit());
    await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
    await act(async () => result.current.reviewClientConflict());
    let submit!: Promise<void>;
    act(() => { submit = result.current.submitClientEdit({ tradeName: "Borrador" }); });
    await waitFor(() => expect(getClient).toHaveBeenCalledTimes(3));
    expect(result.current.edit.pending).toBe(true);
    act(() => result.current.closeForm());
    expect(result.current.edit.open).toBe(true);
    await act(async () => { latest.resolve({ ...detailA, version: 11 }); await submit; });
    expect(result.current.edit).toMatchObject({ pending: false, open: true, draft: { conflict: { version: 11 } } });
    act(() => result.current.closeForm());
    expect(result.current.edit.open).toBe(false);
  });

  it("mantiene revisión de lifecycle tras ajustar motivo después de 409", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const api = apiWith({ deactivateClient: vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "interno")) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    act(() => result.current.changeClientLifecycleReason("Motivo corregido"));
    expect(result.current.lifecycle.versionConflict).toBe(true);
    expect(result.current.lifecycle.error).toBeNull();
  });

  it("conserva conflicto de lifecycle tras 409 seguido de 500 sin adoptar", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const deactivateClient = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "interno"))
      .mockRejectedValueOnce(new ApiClientError(500, "SERVER_ERROR", "interno"));
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValue({ ...detailA, version: 9, tradeName: "Servidor" }), deactivateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    await act(async () => result.current.reviewClientConflict());
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    expect(deactivateClient).toHaveBeenNthCalledWith(2, clientA.id, { version: 3, reason: "Cierre administrativo" });
    expect(result.current.lifecycle).toMatchObject({ open: true, versionConflict: true, baseVersion: 3, reason: "Cierre administrativo", conflict: { version: 9, tradeName: "Servidor" } });
    expect(result.current.lifecycle.error).toMatch(/No fue posible/);
  });

  it("actualiza el recurso vigente de lifecycle ante un segundo 409", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const api = apiWith({
      getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValueOnce({ ...detailA, version: 9 }).mockResolvedValue({ ...detailA, version: 11 }),
      deactivateClient: vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "interno")),
    });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    await act(async () => result.current.reviewClientConflict());
    expect(result.current.lifecycle.conflict?.version).toBe(9);
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    expect(result.current.lifecycle).toMatchObject({ versionConflict: true, baseVersion: 3, reason: "Cierre administrativo", conflict: { version: 11 } });
    expect(api.deactivateClient).toHaveBeenCalledTimes(2);
  });

  it("mantiene lifecycle pendiente y Cancelar inoperable sólo mientras espera el GET automático", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const latest = deferred<ClientDetail>();
    const getClient = vi.fn().mockResolvedValueOnce({ ...detailA, version: 3 }).mockResolvedValueOnce({ ...detailA, version: 9 }).mockImplementationOnce(() => latest.promise);
    const api = apiWith({ getClient, deactivateClient: vi.fn().mockRejectedValue(new ApiClientError(409, "VERSION_CONFLICT", "interno")) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("Cierre administrativo"));
    await act(async () => result.current.reviewClientConflict());
    let submit!: Promise<void>;
    act(() => { submit = result.current.submitClientLifecycle("Cierre administrativo"); });
    await waitFor(() => expect(getClient).toHaveBeenCalledTimes(3));
    expect(result.current.lifecycle.pending).toBe(true);
    act(() => result.current.closeForm());
    expect(result.current.lifecycle.open).toBe(true);
    await act(async () => { latest.resolve({ ...detailA, version: 11 }); await submit; });
    expect(result.current.lifecycle).toMatchObject({ pending: false, open: true, conflict: { version: 11 } });
    act(() => result.current.closeForm());
    expect(result.current.lifecycle.open).toBe(false);
  });

  it("expone validación API del motivo sin cerrar lifecycle", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const issue = { field: "reason", code: "VALIDATION_ERROR", message: "Motivo inválido." };
    const api = apiWith({ deactivateClient: vi.fn().mockRejectedValue(new ApiClientError(400, "VALIDATION_ERROR", "interno", [issue])) });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openClientLifecycle("deactivate"));
    await act(async () => result.current.submitClientLifecycle("Motivo documentado"));
    expect(result.current.lifecycle).toMatchObject({ open: true, fieldErrors: [issue], reason: "Motivo documentado" });
  });

  it.each([
    { action: "deactivate" as const, initiallyActive: true, nowActive: false, message: /inactivo/i },
    { action: "reactivate" as const, initiallyActive: false, nowActive: true, message: /activo/i },
  ])("bloquea $action si el estado conocido cambió tras abrir lifecycle", async ({ action, initiallyActive, nowActive, message }) => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&includeInactive=true");
    const deactivateClient = vi.fn();
    const reactivateClient = vi.fn();
    const api = apiWith({ getClient: vi.fn().mockResolvedValueOnce({ ...detailA, version: 3, isActive: initiallyActive }).mockResolvedValue({ ...detailA, version: 9, isActive: nowActive }), deactivateClient, reactivateClient });
    const { result } = renderHook(() => useWorkspace(api, "", manageable));
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    act(() => result.current.openClientLifecycle(action));
    await act(async () => result.current.refreshDetail());
    await act(async () => result.current.submitClientLifecycle("Motivo documentado"));
    expect(deactivateClient).not.toHaveBeenCalled();
    expect(reactivateClient).not.toHaveBeenCalled();
    expect(result.current.lifecycle).toMatchObject({ open: true, baseVersion: 3, reason: "Motivo documentado" });
    expect(result.current.lifecycle.error).toMatch(message);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function apiWith(overrides: Partial<Pick<ClientsApi, "listClients" | "getClient" | "createClient" | "updateClient" | "deactivateClient" | "reactivateClient">> = {}): ClientsApi {
  return {
    listClients: vi.fn(async () => page([clientA, clientB])),
    getClient: vi.fn(async (id: string) => id === clientA.id ? detailA : detailB),
    createClient: vi.fn(async () => detailB),
    ...overrides,
  } as ClientsApi;
}

const useWorkspace = (api: ClientsApi, search = "", permissions = ["CLIENTS_VIEW"]) =>
  useClientsWorkspace({ api, search, permissions });

beforeEach(() => window.history.replaceState({}, "", "/clientes"));
afterEach(() => vi.useRealTimers());

describe("useClientsWorkspace", () => {
  const input: CreateClientInput = { tradeName: "Nueva", mainBranch: { name: "Principal", address: "Palmira", country: "HN" } };

  it("abre sólo con gestión y una creación exitosa refresca lista, selecciona y cierra con versión confirmada", async () => {
    const created: ClientDetail = { ...detailB, id: "created", tradeName: "Nueva", version: 47, code: "CLI-047" };
    const serverList = page([clientA]);
    const api = apiWith({ createClient: vi.fn(async () => created), listClients: vi.fn().mockResolvedValueOnce(page([clientA, clientB])).mockResolvedValueOnce(serverList) });
    const { result } = renderHook(() => useWorkspace(api, "", ["CLIENTS_VIEW", "CLIENTS_MANAGE"]));
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.openCreate!());
    expect(result.current.create?.open).toBe(true);
    await act(async () => result.current.submitCreate!(input));
    expect(api.createClient).toHaveBeenCalledOnce();
    expect(api.createClient).toHaveBeenCalledWith(input);
    expect(result.current.create?.open).toBe(false);
    expect(result.current.query.clientId).toBe("created");
    expect(result.current.detail.data?.version).toBe(47);
    await waitFor(() => expect(api.listClients).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    expect(result.current.list.data).toEqual(serverList);
    expect(api.getClient).not.toHaveBeenCalled();
  });

  it("delega filtros inactivos y paginación al GET tras crear, sin insertar una fila ficticia", async () => {
    window.history.replaceState({}, "", "/clientes?isActive=false&includeInactive=true&page=3&pageSize=5");
    const initial: ClientPage = { items: [clientA], pagination: { page: 3, pageSize: 5, totalItems: 11, totalPages: 3 } };
    const server: ClientPage = { items: [], pagination: { page: 3, pageSize: 5, totalItems: 10, totalPages: 2 } };
    const api = apiWith({ listClients: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(server) });
    const { result } = renderHook(() => useWorkspace(api, "", ["CLIENTS_VIEW", "CLIENTS_MANAGE"]));
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.openCreate!());
    await act(async () => result.current.submitCreate!(input));
    await waitFor(() => expect(api.listClients).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.list.data).toEqual(server));
    expect(api.listClients).toHaveBeenLastCalledWith({ isActive: false, includeInactive: true, page: 3, pageSize: 5 }, expect.any(AbortSignal));
    expect(result.current.detail.data?.version).toBe(detailB.version);
    expect(api.createClient).toHaveBeenCalledTimes(1);
  });

  it("al resolverse el POST antes del GET inicial inicia un GET nuevo y no queda cargando", async () => {
    const initial = deferred<ClientPage>();
    const latest = deferred<ClientPage>();
    const api = apiWith({ listClients: vi.fn().mockImplementationOnce(() => initial.promise).mockImplementationOnce(() => latest.promise) });
    const { result } = renderHook(() => useWorkspace(api, "", ["CLIENTS_VIEW", "CLIENTS_MANAGE"]));
    const firstSignal = vi.mocked(api.listClients).mock.calls[0]?.[1];
    act(() => result.current.openCreate!());
    await act(async () => result.current.submitCreate!(input));
    expect(firstSignal?.aborted).toBe(true);
    expect(api.listClients).toHaveBeenCalledTimes(2);
    await act(async () => latest.resolve(page([clientB])));
    expect(result.current.list).toMatchObject({ status: "success", data: page([clientB]), stale: false });
    await act(async () => initial.resolve(page([clientA])));
    expect(result.current.list.data).toEqual(page([clientB]));
  });

  it("si falla el GET posterior conserva listado anterior como stale y deja reintentar", async () => {
    const api = apiWith({ listClients: vi.fn().mockResolvedValueOnce(page([clientA])).mockRejectedValueOnce(new Error("Sin red")).mockResolvedValueOnce(page([clientB])) });
    const { result } = renderHook(() => useWorkspace(api, "", ["CLIENTS_VIEW", "CLIENTS_MANAGE"]));
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    act(() => result.current.openCreate!());
    await act(async () => result.current.submitCreate!(input));
    await waitFor(() => expect(result.current.list.status).toBe("error"));
    expect(result.current.list).toMatchObject({ data: page([clientA]), stale: true, error: "Sin red" });
    expect(result.current.detail.data?.id).toBe(detailB.id);
    await act(async () => result.current.refreshList());
    expect(result.current.list.data).toEqual(page([clientB]));
    expect(api.createClient).toHaveBeenCalledTimes(1);
  });

  it("bloquea doble submit y cierre mientras la creación está pendiente", async () => {
    const pending = deferred<ClientDetail>();
    const api = apiWith({ createClient: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useWorkspace(api, "", ["CLIENTS_VIEW", "CLIENTS_MANAGE"]));
    act(() => result.current.openCreate!());
    let first!: Promise<void>;
    act(() => { first = result.current.submitCreate!(input); void result.current.submitCreate!(input); result.current.closeForm!(); });
    expect(api.createClient).toHaveBeenCalledTimes(1);
    expect(result.current.create).toMatchObject({ open: true, pending: true });
    await act(async () => { pending.resolve(detailB); await first; });
    expect(result.current.create?.open).toBe(false);
  });

  it("conserva el formulario y errores de campos del servidor al fallar", async () => {
    const failure = Object.assign(new Error("Datos inválidos"), { fieldErrors: [{ field: "primaryContact.email", code: "INVALID", message: "Correo inválido" }] });
    const api = apiWith({ createClient: vi.fn(async () => { throw failure; }) });
    const { result } = renderHook(() => useWorkspace(api, "", ["CLIENTS_VIEW", "CLIENTS_MANAGE"]));
    act(() => result.current.openCreate!());
    await act(async () => result.current.submitCreate!(input));
    expect(result.current.create).toMatchObject({ open: true, pending: false, error: "Datos inválidos", fieldErrors: failure.fieldErrors });
    expect(result.current.query.clientId).toBeNull();
  });

  it("sin permiso de gestión no abre ni envía", async () => {
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    act(() => result.current.openCreate!());
    await act(async () => result.current.submitCreate!(input));
    expect(result.current.create?.open).toBe(false);
    expect(api.createClient).not.toHaveBeenCalled();
  });
  it("debounce de búsqueda superior espera 300 ms, reinicia página y cancela cambio anterior", async () => {
    window.history.replaceState({}, "", "/clientes?page=3");
    const api = apiWith();
    const { result, rerender } = renderHook(({ search }) => useWorkspace(api, search), { initialProps: { search: "" } });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    vi.useFakeTimers();
    rerender({ search: "Ac" });
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(result.current.query.clients.page).toBe(3);
    rerender({ search: "Acme" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.query.clients.search).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(result.current.query.clients).toMatchObject({ search: "Acme", page: 1 });
    expect(new URLSearchParams(window.location.search).get("search")).toBe("Acme");
  });

  it("limpiar filtros principales restablece búsqueda, página y selección en una transición", async () => {
    window.history.replaceState({}, "", "/clientes?search=Acme&isActive=false&includeInactive=true&page=3&clientId=client-a&source=shell");
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    act(() => result.current.clearClientFilters());
    expect(result.current.query.clients).toEqual({ page: 1, pageSize: 20, includeInactive: false });
    expect(result.current.query.clientId).toBeNull();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("source")).toBe("shell");
    expect(params.has("search")).toBe(false);
    expect(params.has("clientId")).toBe(false);
  });

  it("limpiar filtros cancela la búsqueda superior pendiente", async () => {
    const api = apiWith();
    const { result, rerender } = renderHook(({ search }) => useWorkspace(api, search), { initialProps: { search: "" } });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    vi.useFakeTimers();
    rerender({ search: "Acme" });
    act(() => result.current.clearClientFilters());
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.query.clients.search).toBeUndefined();
    expect(new URLSearchParams(window.location.search).has("search")).toBe(false);
  });

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
