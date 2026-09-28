import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientsApi } from "../api/clients";
import type { BranchPage, ClientBranch, ClientContact, ClientDetail, ClientListFilters, ClientPage, ClientSummary, ContactPage, CreateClientInput } from "../models/client";
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
const contact: ClientContact = { id: "contact-a", clientId: clientA.id, branchId: null, scope: "CLIENT", branchName: null, fullName: "Ana", position: null, phone: null, email: null, isPrimary: true, isActive: true, isEffectivelyActive: true, createdAt: clientA.createdAt, updatedAt: clientA.updatedAt, version: 1 };
const contactPage = (items: ClientContact[]): ContactPage => ({ items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 } });

describe("consulta de contactos", () => {
  it("carga sólo al abrir contactos y descarta respuesta al salir de la pestaña", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const pending = deferred<ContactPage>();
    const api = apiWith({ listContacts: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useWorkspace(api));
    expect(api.listContacts).not.toHaveBeenCalled();
    act(() => result.current.setTab("contacts"));
    expect(api.listContacts).toHaveBeenCalledTimes(1);
    expect(result.current.contacts.status).toBe("loading");
    const signal = vi.mocked(api.listContacts).mock.calls[0]?.[2];
    act(() => result.current.setTab("summary"));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(contactPage([contact])));
    expect(result.current.contacts.data).toBeNull();
  });

  it("aísla A y B, filtros de URL y respuestas tardías de filtros y popstate", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=contacts&source=shell");
    const old = deferred<ContactPage>();
    const filtered = deferred<ContactPage>();
    const api = apiWith({ listContacts: vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => filtered.promise).mockResolvedValue(contactPage([{ ...contact, id: "contact-b", clientId: clientB.id, fullName: "Berta" }])) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(api.listContacts).toHaveBeenCalledTimes(1));
    act(() => result.current.setContactFilters({ scope: "BRANCH", branchId: "branch-1", search: "Be", page: 3, isActive: false }));
    expect(api.listContacts).toHaveBeenLastCalledWith(clientA.id, expect.objectContaining({ scope: "BRANCH", branchId: "branch-1", search: "Be", page: 3, includeInactive: true }), expect.any(AbortSignal));
    const url = new URLSearchParams(window.location.search);
    expect(url.get("contactScope")).toBe("BRANCH");
    expect(url.get("contactBranchId")).toBe("branch-1");
    expect(url.get("contactPage")).toBe("3");
    expect(url.get("source")).toBe("shell");
    expect(result.current.query.branches.page).toBe(1);
    await act(async () => filtered.resolve(contactPage([contact])));
    await act(async () => old.resolve(contactPage([{ ...contact, fullName: "Vieja" }])));
    expect(result.current.contacts.data?.items[0]?.fullName).toBe("Ana");
    act(() => result.current.selectClient(clientB.id));
    act(() => result.current.setTab("contacts"));
    await waitFor(() => expect(api.listContacts).toHaveBeenCalledTimes(3));
    expect(result.current.query.contacts.page).toBe(1);
    await waitFor(() => expect(result.current.contacts.data?.items[0]?.fullName).toBe("Berta"));
    window.history.pushState({}, "", "/clientes?clientId=client-a&clientTab=contacts&contactSearch=Restaurado");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await waitFor(() => expect(api.listContacts).toHaveBeenLastCalledWith(clientA.id, expect.objectContaining({ search: "Restaurado" }), expect.any(AbortSignal)));
  });

  it("retiene contactos stale y permite reintentar", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=contacts");
    const api = apiWith({ listContacts: vi.fn().mockResolvedValueOnce(contactPage([contact])).mockRejectedValueOnce(new Error("Red inestable")).mockResolvedValueOnce(contactPage([{ ...contact, fullName: "Ana nueva" }])) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.contacts.status).toBe("success"));
    await act(async () => result.current.refreshContacts());
    expect(result.current.contacts).toMatchObject({ status: "error", stale: true, error: "Red inestable" });
    expect(result.current.contacts.data?.items[0]?.fullName).toBe("Ana");
    await act(async () => result.current.refreshContacts());
    expect(result.current.contacts.data?.items[0]?.fullName).toBe("Ana nueva");
  });

  it("descarta respuestas tardías de A al elegir B y de B al restaurar A por popstate", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=contacts");
    const a = deferred<ContactPage>();
    const b = deferred<ContactPage>();
    const restored = deferred<ContactPage>();
    const api = apiWith({ listContacts: vi.fn().mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise).mockImplementationOnce(() => restored.promise) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(api.listContacts).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(api.listContacts).mock.calls[0]?.[2];
    act(() => result.current.selectClient(clientB.id));
    act(() => result.current.setTab("contacts"));
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(api.listContacts).toHaveBeenCalledTimes(2));
    await act(async () => a.resolve(contactPage([contact])));
    expect(result.current.contacts.data).toBeNull();
    window.history.pushState({}, "", "/clientes?clientId=client-a&clientTab=contacts");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await waitFor(() => expect(api.listContacts).toHaveBeenCalledTimes(3));
    await act(async () => b.resolve(contactPage([{ ...contact, clientId: clientB.id, fullName: "Berta" }])));
    expect(result.current.contacts.data).toBeNull();
    await act(async () => restored.resolve(contactPage([contact])));
    expect(result.current.contacts.data?.items[0]?.fullName).toBe("Ana");
  });
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

function apiWith(overrides: Partial<ClientsApi> = {}): ClientsApi {
  return {
    listClients: vi.fn(async () => page([clientA, clientB])),
    getClient: vi.fn(async (id: string) => id === clientA.id ? detailA : detailB),
    createClient: vi.fn(async () => detailB),
    listBranches: vi.fn(async () => branchPage([])),
    ...overrides,
  } as ClientsApi;
}

const branchA: ClientBranch = { id: "branch-a", clientId: clientA.id, code: "S-1", name: "Principal", address: "Centro", city: "Tegucigalpa", region: "Francisco Morazán", country: "HN", lat: "14.1", long: "-87.2", locationReference: "Frente al parque", isActive: true, isEffectivelyActive: true, createdAt: clientA.createdAt, updatedAt: clientA.updatedAt, version: 1 };
const branchPage = (items: ClientBranch[], pageNumber = 1): BranchPage => ({ items, pagination: { page: pageNumber, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 } });

describe("mutaciones de sucursales", () => {
  const managed = ["CLIENTS_VIEW", "CLIENTS_MANAGE"];
  const setup = (overrides: Partial<ClientsApi> = {}, inactive = false) => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=branches&branchCity=Tegucigalpa");
    const detail = { ...detailA, isActive: !inactive, branches: [branchA] };
    const api = apiWith({ getClient: vi.fn(async () => detail), listBranches: vi.fn(async () => branchPage([branchA])), ...overrides });
    return { api, ...renderHook(() => useWorkspace(api, "", managed)) };
  };

  it("crea sin versión y refresca detalle y colección con filtros vigentes", async () => {
    const createBranch = vi.fn(async () => ({ ...branchA, id: "branch-b", version: 1 }));
    const { api, result } = setup({ createBranch });
    await waitFor(() => expect(result.current.branches.status).toBe("success"));
    act(() => result.current.openBranchCreate());
    await act(async () => result.current.submitBranchForm({ name: "Norte", address: "Centro", country: "HN", lat: null, long: null }));
    expect(createBranch).toHaveBeenCalledWith(clientA.id, expect.not.objectContaining({ version: expect.anything() }));
    await waitFor(() => expect(api.listBranches).toHaveBeenCalledTimes(2));
    expect(api.listBranches).toHaveBeenLastCalledWith(clientA.id, expect.objectContaining({ city: "Tegucigalpa" }), expect.any(AbortSignal));
    await waitFor(() => expect(api.getClient).toHaveBeenCalledTimes(2));
  });

  it("edita con versión capturada y preserva draft en 409 hasta adopción explícita", async () => {
    const updateBranch = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "conflict")).mockResolvedValueOnce({ ...branchA, name: "Mi borrador", version: 9 });
    const { result } = setup({ updateBranch, getClient: vi.fn().mockResolvedValueOnce({ ...detailA, branches: [branchA] }).mockResolvedValue({ ...detailA, branches: [{ ...branchA, name: "Servidor", version: 8 }] }) });
    await waitFor(() => expect(result.current.detail.data?.branches[0]).toBeDefined());
    act(() => result.current.openBranchEdit(branchA));
    act(() => result.current.changeBranchForm({ name: "Mi borrador" }));
    await act(async () => result.current.submitBranchForm(result.current.branchForm.draft!.values));
    expect(updateBranch).toHaveBeenCalledWith(clientA.id, branchA.id, expect.objectContaining({ version: 1, name: "Mi borrador" }));
    expect(result.current.branchForm.draft).toMatchObject({ baseVersion: 1, values: { name: "Mi borrador" }, conflict: null });
    expect(updateBranch).toHaveBeenCalledTimes(1);
    await act(async () => result.current.reviewBranchConflict());
    expect(result.current.branchForm.draft?.conflict).toMatchObject({ version: 8, name: "Servidor" });
    act(() => result.current.adoptBranchConflict());
    expect(result.current.branchForm.draft).toMatchObject({ baseVersion: 8, values: { name: "Mi borrador" } });
    await act(async () => result.current.submitBranchForm(result.current.branchForm.draft!.values));
    expect(updateBranch).toHaveBeenLastCalledWith(clientA.id, branchA.id, expect.objectContaining({ version: 8, name: "Mi borrador" }));
  });

  it.each([["BRANCH_HAS_ACTIVE_WORK", "La sucursal tiene trabajo activo y no puede desactivarse."], ["CLIENT_REQUIRES_ACTIVE_BRANCH", "El cliente debe conservar al menos una sucursal activa."]])("muestra %s en el diálogo sin reintento automático", async (code, message) => {
    const deactivateBranch = vi.fn().mockRejectedValue(new ApiClientError(409, code, "conflict"));
    const { result } = setup({ deactivateBranch });
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openBranchLifecycle(branchA, "deactivate"));
    await act(async () => result.current.submitBranchLifecycle("Motivo documentado"));
    expect(result.current.branchLifecycle.error).toBe(message);
    expect(result.current.branchLifecycle.open).toBe(true);
    expect(deactivateBranch).toHaveBeenCalledTimes(1);
  });

  it("desactiva MAIN si API confirma y no reescribe otra sucursal", async () => {
    const main = { ...branchA, code: "MAIN" };
    const other = { ...branchA, id: "branch-b", code: "S-2", name: "Otra" };
    const deactivateBranch = vi.fn(async () => ({ ...main, isActive: false, isEffectivelyActive: false, version: 2 }));
    const { result } = setup({ deactivateBranch, getClient: vi.fn(async () => ({ ...detailA, branches: [main, other] })), listBranches: vi.fn(async () => branchPage([main, other])) });
    await waitFor(() => expect(result.current.detail.data?.branches.length).toBe(2));
    expect(result.current.detail.data?.branches[0]?.code).toBe("MAIN");
    act(() => result.current.openBranchLifecycle(main, "deactivate"));
    await act(async () => result.current.submitBranchLifecycle("Motivo documentado"));
    expect(deactivateBranch).toHaveBeenCalledWith(clientA.id, branchA.id, { version: 1, reason: "Motivo documentado" });
    expect(result.current.detail.data?.branches.find((item) => item.id === branchA.id)?.isActive).toBe(false);
    expect(result.current.detail.data?.branches.find((item) => item.id === other.id)?.isActive).toBe(true);
  });

  it("mantiene v8 tras mutación v2 y lectura posterior v3 en colección y detalle", async () => {
    const v2 = { ...branchA, version: 2, name: "Mutación" };
    const v8 = { ...branchA, version: 8, name: "Vigente" };
    const v3 = { ...branchA, version: 3, name: "Atrasada" };
    const getClient = vi.fn().mockResolvedValueOnce({ ...detailA, branches: [branchA] })
      .mockResolvedValueOnce({ ...detailA, version: 8, branches: [v8] })
      .mockResolvedValueOnce({ ...detailA, version: 9, branches: [v3] });
    const listBranches = vi.fn().mockResolvedValueOnce(branchPage([branchA]))
      .mockResolvedValueOnce(branchPage([v8]))
      .mockResolvedValueOnce(branchPage([v3]));
    const { result } = setup({ getClient, listBranches, updateBranch: vi.fn(async () => v2) });
    await waitFor(() => expect(result.current.branches.data?.items[0]?.version).toBe(1));
    act(() => result.current.openBranchEdit(branchA));
    await act(async () => result.current.submitBranchForm({ name: "Mutación", address: "Centro", country: "HN" }));
    await waitFor(() => expect(result.current.branches.data?.items[0]?.version).toBe(8));
    await waitFor(() => expect(result.current.detail.data?.branches[0]?.version).toBe(8));
    await act(async () => { await Promise.all([result.current.refreshBranches(), result.current.refreshDetail()]); });
    expect(result.current.branches.data?.items[0]).toMatchObject({ id: branchA.id, version: 8, name: "Vigente" });
    expect(result.current.detail.data?.branches[0]).toMatchObject({ id: branchA.id, version: 8, name: "Vigente" });
  });

  it("no sustituye una sucursal v8 visible con respuesta de mutación v2", async () => {
    const v8 = { ...branchA, version: 8, name: "Vigente" };
    const v2 = { ...branchA, version: 2, name: "Respuesta atrasada" };
    const v3 = { ...branchA, version: 3, name: "Lectura atrasada" };
    const { result } = setup({
      getClient: vi.fn().mockResolvedValueOnce({ ...detailA, branches: [v8] }).mockResolvedValue({ ...detailA, version: 2, branches: [v3] }),
      listBranches: vi.fn().mockResolvedValueOnce(branchPage([v8])).mockResolvedValue(branchPage([v3])),
      updateBranch: vi.fn(async () => v2),
    });
    await waitFor(() => expect(result.current.branches.data?.items[0]?.version).toBe(8));
    await waitFor(() => expect(result.current.detail.data?.branches[0]?.version).toBe(8));
    act(() => result.current.openBranchEdit(v8));
    await act(async () => result.current.submitBranchForm({ name: "Mi edición", address: "Centro", country: "HN" }));
    expect(result.current.branches.data?.items[0]).toMatchObject({ version: 8, name: "Vigente" });
    expect(result.current.detail.data?.branches[0]).toMatchObject({ version: 8, name: "Vigente" });
  });

  it("registra cliente superior inactivo en revisión de conflicto y conserva borrador sin nuevas mutaciones", async () => {
    const updateBranch = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "conflict"));
    const getClient = vi.fn().mockResolvedValueOnce({ ...detailA, branches: [branchA] })
      .mockResolvedValueOnce({ ...detailA, version: 9, isActive: false, branches: [{ ...branchA, version: 8 }] });
    const { result } = setup({ updateBranch, getClient });
    await waitFor(() => expect(result.current.detail.data?.branches[0]).toBeDefined());
    act(() => result.current.openBranchEdit(branchA));
    act(() => result.current.changeBranchForm({ name: "Mi borrador" }));
    await act(async () => result.current.submitBranchForm(result.current.branchForm.draft!.values));
    await act(async () => result.current.reviewBranchConflict());
    expect(result.current.branchClientActive).toBe(false);
    expect(result.current.branchForm.draft).toMatchObject({ baseVersion: 1, values: { name: "Mi borrador" }, conflict: { version: 8 } });
    act(() => result.current.openBranchCreate());
    await act(async () => result.current.submitBranchForm(result.current.branchForm.draft!.values));
    expect(updateBranch).toHaveBeenCalledTimes(1);
    expect(result.current.branchForm.draft?.values.name).toBe("Mi borrador");
  });

  it("bloquea mutaciones si cliente está inactivo", async () => {
    const updateBranch = vi.fn();
    const { result } = setup({ updateBranch }, true);
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    act(() => result.current.openBranchEdit(branchA));
    expect(result.current.branchForm.open).toBe(false);
    await act(async () => result.current.submitBranchForm({ name: "Nada", address: "Centro", country: "HN" }));
    expect(updateBranch).not.toHaveBeenCalled();
  });

  it("prioriza cliente inactivo vigente en listado aunque ficha anterior siga activa", async () => {
    const { result } = setup({ listClients: vi.fn(async () => page([{ ...clientA, version: 8, isActive: false }])) });
    await waitFor(() => expect(result.current.list.status).toBe("success"));
    await waitFor(() => expect(result.current.detail.data?.branches[0]).toBeDefined());
    expect(result.current.detail.data?.isActive).toBe(true);
    expect(result.current.branchClientActive).toBe(false);
    act(() => result.current.openBranchEdit(branchA));
    expect(result.current.branchForm.open).toBe(false);
  });

  it("mantiene el motivo y versión base de lifecycle durante conflicto hasta adoptar", async () => {
    const deactivateBranch = vi.fn().mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "conflict")).mockResolvedValueOnce({ ...branchA, version: 9, isActive: false });
    const getClient = vi.fn().mockResolvedValueOnce({ ...detailA, branches: [branchA] }).mockResolvedValue({ ...detailA, branches: [{ ...branchA, version: 8 }] });
    const { result } = setup({ deactivateBranch, getClient });
    await waitFor(() => expect(result.current.detail.data?.branches[0]).toBeDefined());
    act(() => result.current.openBranchLifecycle(branchA, "deactivate"));
    await act(async () => result.current.submitBranchLifecycle("Motivo documentado"));
    expect(result.current.branchLifecycle).toMatchObject({ baseVersion: 1, reason: "Motivo documentado", conflict: null });
    await act(async () => result.current.reviewBranchConflict());
    expect(result.current.branchLifecycle.conflict?.version).toBe(8);
    act(() => result.current.adoptBranchConflict());
    expect(result.current.branchLifecycle).toMatchObject({ baseVersion: 8, reason: "Motivo documentado", conflict: null });
    await act(async () => result.current.submitBranchLifecycle(result.current.branchLifecycle.reason));
    expect(deactivateBranch).toHaveBeenLastCalledWith(clientA.id, branchA.id, { version: 8, reason: "Motivo documentado" });
  });

  it("conserva colección stale tras error de refresh, sin reintento automático", async () => {
    const updated = { ...branchA, version: 2, name: "Renovada" };
    const listBranches = vi.fn().mockResolvedValueOnce(branchPage([branchA])).mockRejectedValueOnce(new Error("Sin red")).mockResolvedValueOnce(branchPage([updated]));
    const { result } = setup({ listBranches, updateBranch: vi.fn(async () => updated) });
    await waitFor(() => expect(result.current.branches.status).toBe("success"));
    act(() => result.current.openBranchEdit(branchA));
    await act(async () => result.current.submitBranchForm({ name: "Renovada", address: "Centro", country: "HN" }));
    await waitFor(() => expect(result.current.branches.status).toBe("error"));
    expect(result.current.branches).toMatchObject({ stale: true, error: "Sin red" });
    expect(listBranches).toHaveBeenCalledTimes(2);
    await act(async () => result.current.refreshBranches());
    expect(listBranches).toHaveBeenCalledTimes(3);
    expect(result.current.branches.data?.items[0]).toMatchObject({ version: 2, name: "Renovada" });
  });
});

describe("consulta de sucursales", () => {
  it("consulta sólo al abrir la pestaña y aborta al salir a Contactos", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a");
    const pending = deferred<BranchPage>();
    const api = apiWith({ listBranches: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.detail.status).toBe("success"));
    expect(api.listBranches).not.toHaveBeenCalled();
    act(() => result.current.setTab("branches"));
    expect(api.listBranches).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(api.listBranches).mock.calls[0]?.[2];
    act(() => result.current.setTab("contacts"));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(branchPage([branchA])));
    expect(result.current.branches.data).toBeNull();
  });

  it("descarta la respuesta de A al seleccionar B aunque el transporte ignore abort", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=branches");
    const a = deferred<BranchPage>();
    const b = deferred<BranchPage>();
    const api = apiWith({ listBranches: vi.fn((id: string) => id === clientA.id ? a.promise : b.promise) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(api.listBranches).toHaveBeenCalledTimes(1));
    act(() => result.current.selectClient(clientB.id));
    act(() => result.current.setTab("branches"));
    await waitFor(() => expect(api.listBranches).toHaveBeenCalledTimes(2));
    await act(async () => b.resolve(branchPage([{ ...branchA, id: "branch-b", clientId: clientB.id, name: "Norte" }])));
    await act(async () => a.resolve(branchPage([branchA])));
    expect(result.current.branches.data?.items[0]?.name).toBe("Norte");
  });

  it("mantiene filtros independientes en URL y pagina con parámetros del servidor", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&source=shell");
    const api = apiWith();
    const { result } = renderHook(() => useWorkspace(api));
    act(() => result.current.setTab("branches"));
    act(() => result.current.setBranchFilters({ search: "Centro", city: "Tegucigalpa", region: "Francisco Morazán", isActive: false, page: 3 }));
    await waitFor(() => expect(result.current.branches.status).toBe("success"));
    expect(api.listBranches).toHaveBeenLastCalledWith(clientA.id, expect.objectContaining({ search: "Centro", city: "Tegucigalpa", region: "Francisco Morazán", isActive: false, includeInactive: true, page: 3 }), expect.any(AbortSignal));
    const url = new URLSearchParams(window.location.search);
    expect(url.get("branchPage")).toBe("3");
    expect(url.get("branchCity")).toBe("Tegucigalpa");
    expect(url.get("branchRegion")).toBe("Francisco Morazán");
    expect(url.get("source")).toBe("shell");
    expect(result.current.query.clients.page).toBe(1);
    expect(result.current.query.contacts.page).toBe(1);
  });

  it("conserva datos previos ante fallo de refresh y permite reintentar", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=branches");
    const api = apiWith({ listBranches: vi.fn().mockResolvedValueOnce(branchPage([branchA])).mockRejectedValueOnce(new Error("Red inestable")).mockResolvedValueOnce(branchPage([{ ...branchA, version: 2, name: "Renovada" }])) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(result.current.branches.status).toBe("success"));
    await act(async () => result.current.refreshBranches());
    expect(result.current.branches).toMatchObject({ status: "error", stale: true, error: "Red inestable" });
    expect(result.current.branches.data?.items[0]?.name).toBe("Principal");
    await act(async () => result.current.refreshBranches());
    expect(result.current.branches.data?.items[0]?.name).toBe("Renovada");
  });

  it("descarta respuestas tardías tras cambiar filtros y restaura URL por popstate", async () => {
    window.history.replaceState({}, "", "/clientes?clientId=client-a&clientTab=branches&branchCity=Antes");
    const old = deferred<BranchPage>();
    const api = apiWith({ listBranches: vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue(branchPage([{ ...branchA, name: "Nueva" }])) });
    const { result } = renderHook(() => useWorkspace(api));
    await waitFor(() => expect(api.listBranches).toHaveBeenCalledTimes(1));
    act(() => result.current.setBranchFilters({ city: "Ahora" }));
    await waitFor(() => expect(result.current.branches.data?.items[0]?.name).toBe("Nueva"));
    await act(async () => old.resolve(branchPage([branchA])));
    expect(result.current.branches.data?.items[0]?.name).toBe("Nueva");
    window.history.pushState({}, "", "/clientes?clientId=client-a&clientTab=branches&branchCity=Restaurada");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await waitFor(() => expect(api.listBranches).toHaveBeenLastCalledWith(clientA.id, expect.objectContaining({ city: "Restaurada" }), expect.any(AbortSignal)));
  });
});

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
