import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/AuthContext";
import { authContext, limitedUser } from "../test/auth-test-utils";
import type { ClientsWorkspace } from "../hooks/useClientsWorkspace";
import type { ClientsApi } from "../api/clients";
import type { ClientBranch, ClientContact, ClientDetail, ClientSummary } from "../models/client";
import { ClientsPage } from "./ClientsPage";

const client: ClientSummary = {
  id: "client-1", code: "CLI-001", tradeName: "Café Central", legalName: "Café Central S. de R.L.",
  taxId: "08011999123456", phone: "2222-3333", email: "contacto@cafe.test", isActive: true,
  createdAt: "2025-01-02T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z", version: 3,
  activeBranchCount: 2, activeContactCount: 4,
};
const detail: ClientDetail = { ...client, notes: "Ingreso por recepción", branches: [], contacts: [] };

function workspace(overrides: Partial<ClientsWorkspace> = {}): ClientsWorkspace {
  return {
    query: { clients: { page: 1, pageSize: 20, includeInactive: false }, clientId: null, tab: "summary",
      branches: { page: 1, pageSize: 20, includeInactive: false }, contacts: { page: 1, pageSize: 20, includeInactive: false } },
    capabilities: { canView: true, canManage: false },
    list: { status: "success", data: { items: [client], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }, error: null, stale: false },
    detail: { status: "idle", data: null, error: null, stale: false },
    branches: { status: "idle", data: null, error: null, stale: false },
    contacts: { status: "idle", data: null, error: null, stale: false },
    contactBranches: [],
    setClientFilters: vi.fn(), clearClientFilters: vi.fn(), selectClient: vi.fn(), closeDetail: vi.fn(), setTab: vi.fn(),
    setBranchFilters: vi.fn(), refreshBranches: vi.fn(async () => {}),
    setContactFilters: vi.fn(), refreshContacts: vi.fn(async () => {}),
    refreshList: vi.fn(async () => {}), refreshDetail: vi.fn(async () => {}), refresh: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderPage(current: ClientsWorkspace, permissions = ["CLIENTS_VIEW"]) {
  const user = { ...limitedUser, permissions };
  return render(<AuthContext.Provider value={authContext({ user })}><ClientsPage workspace={current} search="" onClearSearch={vi.fn()} /></AuthContext.Provider>);
}

describe("ClientsPage", () => {
  it("conecta creación y edición de contactos desde la ficha", async () => {
    const item: ClientContact = { id: "contact-1", clientId: client.id, branchId: null, scope: "CLIENT", branchName: null, fullName: "Ana", position: null, phone: null, email: null, isPrimary: true, isActive: true, isEffectivelyActive: true, createdAt: client.createdAt, updatedAt: client.updatedAt, version: 3 };
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    const current = workspace({ capabilities: { canView: true, canManage: true }, query: { ...workspace().query, clientId: client.id, tab: "contacts" }, detail: { status: "success", data: { ...detail, contacts: [item] }, error: null, stale: false }, contacts: { status: "success", data: { items: [item], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }, error: null, stale: false }, openContactCreate: onCreate, openContactEdit: onEdit });
    renderPage(current, ["CLIENTS_VIEW", "CLIENTS_MANAGE"]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nuevo contacto" }));
    await user.click(within(screen.getByRole("article", { name: "Contacto Ana" })).getByRole("button", { name: "Editar contacto" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith(item);
  });
  it.each([true, false])("usa la sucursal conocida al pasar Sucursales→Contactos aunque la ficha %s la incluya", async (inDetail) => {
    window.history.replaceState({}, "", "/clientes?clientId=client-1&branchIncludeInactive=true");
    const branch: ClientBranch = { id: "branch-1", clientId: client.id, code: "S-1", name: "Principal", address: "Centro", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null, isActive: true, isEffectivelyActive: true, createdAt: client.createdAt, updatedAt: client.updatedAt, version: 1 };
    const contact: ClientContact = { id: "contact-1", clientId: client.id, branchId: branch.id, scope: "BRANCH", branchName: "Principal", fullName: "Ana", position: null, phone: null, email: null, isPrimary: false, isActive: true, isEffectivelyActive: true, createdAt: client.createdAt, updatedAt: client.updatedAt, version: 1 };
    const api = {
      listClients: vi.fn(async () => ({ items: [client], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })),
      getClient: vi.fn(async () => ({ ...detail, branches: inDetail ? [branch] : [] })),
      listBranches: vi.fn(async () => ({ items: [{ ...branch, version: 2, isActive: false, isEffectivelyActive: false }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })),
      listContacts: vi.fn(async () => ({ items: [contact], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })),
    } as unknown as ClientsApi;
    const user = userEvent.setup();
    render(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}><ClientsPage api={api} /></AuthContext.Provider>);
    await screen.findByRole("article", { name: "Ficha de Café Central" });
    await user.click(screen.getByRole("tab", { name: "Sucursales" }));
    await waitFor(() => expect(api.listBranches).toHaveBeenCalledWith(client.id, expect.objectContaining({ includeInactive: true }), expect.any(AbortSignal)));
    await screen.findByText("No disponible", { exact: true });
    await user.click(screen.getByRole("tab", { name: "Contactos" }));
    const card = await screen.findByRole("article", { name: "Contacto Ana" });
    expect(within(card).getByText("No disponible por sucursal inactiva")).toBeVisible();
  });

  it("Actualizar usa refresh global para incluir la colección hija activa", async () => {
    const current = workspace({ query: { ...workspace().query, clientId: client.id, tab: "contacts" }, detail: { status: "success", data: detail, error: null, stale: false } });
    renderPage(current);
    await userEvent.setup().click(screen.getByRole("button", { name: "Actualizar" }));
    expect(current.refresh).toHaveBeenCalledOnce();
    expect(current.refreshList).not.toHaveBeenCalled();
  });
  it("conecta filtros y reintento de contactos con la ficha", async () => {
    const current = workspace({
      query: { ...workspace().query, clientId: client.id, tab: "contacts" },
      detail: { status: "success", data: detail, error: null, stale: false },
      contacts: { status: "error", data: null, error: "Sin red", stale: false },
    });
    renderPage(current);
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar contactos" }));
    expect(current.refreshContacts).toHaveBeenCalledOnce();
    await userEvent.setup().selectOptions(screen.getByLabelText("Ámbito"), "CLIENT");
    expect(current.setContactFilters).toHaveBeenCalledWith({ scope: "CLIENT", branchId: undefined });
  });
  it("conecta acciones de sucursal y presenta el error de dominio dentro del diálogo", async () => {
    const branch = { id: "branch-1", clientId: "client-1", code: "S-001", name: "Principal", address: "Palmira", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null, isActive: true, isEffectivelyActive: true, createdAt: client.createdAt, updatedAt: client.updatedAt, version: 3 };
    const onLifecycle = vi.fn();
    const onSubmit = vi.fn(async () => {});
    const base = workspace({
      capabilities: { canView: true, canManage: true },
      query: { ...workspace().query, clientId: "client-1", tab: "branches" },
      detail: { status: "success", data: { ...detail, branches: [branch] }, error: null, stale: false },
      branches: { status: "success", data: { items: [branch], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }, error: null, stale: false },
      openEdit: vi.fn(), openClientLifecycle: vi.fn(), openBranchLifecycle: onLifecycle, submitBranchLifecycle: onSubmit,
    });
    const user = userEvent.setup();
    const view = renderPage(base, ["CLIENTS_VIEW", "CLIENTS_MANAGE"]);
    await user.click(within(screen.getByRole("article", { name: "Sucursal Principal" })).getByRole("button", { name: "Desactivar sucursal" }));
    expect(onLifecycle).toHaveBeenCalledWith(branch, "deactivate");
    const active = workspace({ ...base, branchLifecycle: { open: true, action: "deactivate", clientId: client.id, branchId: branch.id, baseVersion: 3, reason: "Motivo documentado", pending: false, error: "La sucursal tiene trabajo activo y no puede desactivarse.", fieldErrors: [], reviewPending: false, reviewError: null, versionConflict: false, conflict: null } });
    view.rerender(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW", "CLIENTS_MANAGE"] } })}><ClientsPage workspace={active} /></AuthContext.Provider>);
    const dialog = document.querySelector('[role="dialog"][aria-label="Desactivar sucursal Principal"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('[role="alert"]')).toHaveTextContent("La sucursal tiene trabajo activo y no puede desactivarse.");
    await user.click(screen.getByText("Confirmar"));
    expect(onSubmit).toHaveBeenCalledWith("Motivo documentado");
  });
  it("presenta la colección paginada al abrir Sucursales", () => {
    const current = workspace({
      query: { ...workspace().query, clientId: "client-1", tab: "branches" },
      detail: { status: "success", data: detail, error: null, stale: false },
      branches: { status: "success", data: { items: [{ id: "branch-1", clientId: "client-1", code: "S-001", name: "Centro", address: "Palmira", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null, isActive: true, isEffectivelyActive: true, createdAt: client.createdAt, updatedAt: client.updatedAt, version: 1 }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }, error: null, stale: false },
    });
    renderPage(current);
    expect(screen.getByRole("article", { name: "Sucursal Centro" })).toHaveTextContent("Palmira");
  });
  it("muestra la ficha conservada con advertencia y reintento tras un error", async () => {
    const current = workspace({
      query: { ...workspace().query, clientId: "client-1" },
      detail: { status: "error", data: detail, error: "Red inestable", stale: true },
    });
    renderPage(current);
    expect(screen.getByRole("article", { name: "Ficha de Café Central" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Red inestable");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar ficha" }));
    expect(current.refreshDetail).toHaveBeenCalledOnce();
  });

  it("limpiar filtros limpia buscador superior, filtros y selección", async () => {
    const onClearSearch = vi.fn();
    const current = workspace({ query: { ...workspace().query, clientId: "client-1", clients: { page: 3, pageSize: 20, search: "Café", isActive: false, includeInactive: true } }, detail: { status: "success", data: detail, error: null, stale: false } });
    render(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}><ClientsPage workspace={current} search="Café" onClearSearch={onClearSearch} /></AuthContext.Provider>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClearSearch).toHaveBeenCalledOnce();
    expect(current.clearClientFilters).toHaveBeenCalledOnce();
  });

  it("muestra carga inicial, vacío y error inicial con acciones operativas", async () => {
    const current = workspace({ list: { status: "loading", data: null, error: null, stale: false } });
    const view = renderPage(current);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando clientes");
    view.rerender(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}><ClientsPage workspace={workspace({ list: { status: "success", data: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }, error: null, stale: false } })} /></AuthContext.Provider>);
    expect(screen.getByText(/Ajusta el estado o la búsqueda/)).toBeInTheDocument();
    const retry = vi.fn(async () => {});
    view.rerender(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}><ClientsPage workspace={workspace({ list: { status: "error", data: null, error: "Red inestable", stale: false }, refreshList: retry })} /></AuthContext.Provider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Red inestable");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("limpiar búsqueda desde el vacío retira la consulta local sin borrar el estado", async () => {
    const onClearSearch = vi.fn();
    const current = workspace({
      query: { ...workspace().query, clients: { page: 2, pageSize: 20, search: "Acme", isActive: true, includeInactive: false } },
      list: { status: "success", data: { items: [], pagination: { page: 2, pageSize: 20, totalItems: 0, totalPages: 0 } }, error: null, stale: false },
    });
    render(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}><ClientsPage workspace={current} search="" onClearSearch={onClearSearch} /></AuthContext.Provider>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(onClearSearch).toHaveBeenCalledOnce();
    expect(current.setClientFilters).toHaveBeenCalledWith({ search: undefined, page: 1 });
    expect(current.clearClientFilters).not.toHaveBeenCalled();
  });

  it("conserva la lista durante refresh y error stale, con reintento visible", async () => {
    const current = workspace({ list: { status: "loading", data: workspace().list.data, error: null, stale: false } });
    const view = renderPage(current);
    expect(screen.getByRole("status")).toHaveTextContent("Actualizando clientes");
    expect(screen.getByRole("table", { name: "Listado de clientes" })).toBeInTheDocument();
    view.rerender(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}><ClientsPage workspace={workspace({ list: { status: "error", data: workspace().list.data, error: "Red inestable", stale: true }, refreshList: current.refreshList })} /></AuthContext.Provider>);
    expect(screen.getByRole("status")).toHaveTextContent("desactualizados");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(current.refreshList).toHaveBeenCalledOnce();
  });

  it("respeta los límites de la página devuelta por el servidor", async () => {
    const current = workspace({ list: { status: "success", data: { items: [client], pagination: { page: 2, pageSize: 1, totalItems: 3, totalPages: 3 } }, error: null, stale: false } });
    const view = renderPage(current);
    await userEvent.setup().click(screen.getByRole("button", { name: "Anterior" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Siguiente" }));
    expect(current.setClientFilters).toHaveBeenNthCalledWith(1, { page: 1 });
    expect(current.setClientFilters).toHaveBeenNthCalledWith(2, { page: 3 });
    view.rerender(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}><ClientsPage workspace={workspace({ list: { status: "success", data: { items: [client], pagination: { page: 3, pageSize: 1, totalItems: 3, totalPages: 3 } }, error: null, stale: false } })} /></AuthContext.Provider>);
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("distingue conteos registrados en tarjeta de un cliente inactivo", () => {
    const inactive = { ...client, isActive: false, activeBranchCount: 2, activeContactCount: 4 };
    const { container } = renderPage(workspace({ list: { status: "success", data: { items: [inactive], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }, error: null, stale: false } }));
    const card = container.querySelector(".clients-card") as HTMLElement;
    expect(within(card).getByText("2 sucursales con estado activo")).toBeInTheDocument();
    expect(within(card).getByText("4 contactos con estado activo")).toBeInTheDocument();
    expect(within(card).getByText(/no representan recursos disponibles/)).toBeInTheDocument();
  });

  it("conserva el contacto institucional en tarjetas móviles con respaldo y ausencia explícita", () => {
    const byEmail = { ...client, id: "client-2", code: "CLI-002", tradeName: "Ferretería Norte", phone: null, email: "ventas@norte.test" };
    const withoutContact = { ...client, id: "client-3", code: "CLI-003", tradeName: "Taller del Sur", phone: null, email: null };
    const current = workspace({ list: { status: "success", data: {
      items: [client, byEmail, withoutContact],
      pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 },
    }, error: null, stale: false } });
    const { container } = renderPage(current);
    const cards = container.querySelectorAll(".clients-card");

    expect(cards).toHaveLength(3);
    expect(within(cards[0] as HTMLElement).getByText("2222-3333")).toBeInTheDocument();
    expect(within(cards[1] as HTMLElement).getByText("ventas@norte.test")).toBeInTheDocument();
    expect(within(cards[2] as HTMLElement).getByText("Sin teléfono ni correo")).toBeInTheDocument();
  });

  it("muestra total, identidad, métricas y estado sin crear en solo lectura", () => {
    renderPage(workspace());
    expect(screen.getByText("1 cliente")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Listado de clientes" });
    expect(within(table).getByText("CLI-001")).toBeInTheDocument();
    expect(within(table).getByText("Café Central")).toBeInTheDocument();
    expect(within(table).getByText("08011999123456")).toBeInTheDocument();
    expect(within(table).getByText("Activo")).toBeInTheDocument();
    expect(within(table).getByText("2")).toBeInTheDocument();
    expect(within(table).getByText("4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();
  });

  it("selecciona un cliente y ofrece una ficha con pestañas accesibles", async () => {
    const current = workspace();
    const user = userEvent.setup();
    const view = renderPage(current);
    await user.click(screen.getByRole("button", { name: "Abrir ficha de Café Central" }));
    expect(current.selectClient).toHaveBeenCalledWith("client-1");
    view.rerender(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}>
      <ClientsPage workspace={workspace({ query: { ...current.query, clientId: "client-1" }, detail: { status: "success", data: detail, error: null, stale: false } })} search="" onClearSearch={vi.fn()} />
    </AuthContext.Provider>);
    const tabs = screen.getByRole("tablist", { name: "Secciones del cliente" });
    expect(within(tabs).getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
    expect(within(tabs).getByRole("tab", { name: "Sucursales" })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "Contactos" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "Resumen" })).toHaveTextContent("Ingreso por recepción");
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();
  });

  it("permite seleccionar A y luego B sin mostrar la ficha obsoleta de A", async () => {
    const second = { ...client, id: "client-2", code: "CLI-002", tradeName: "Ferretería Norte" };
    const current = workspace({ list: { status: "success", data: { items: [client, second], pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 } }, error: null, stale: false } });
    const user = userEvent.setup();
    const view = renderPage(current);
    await user.click(screen.getByRole("button", { name: "Abrir ficha de Café Central" }));
    await user.click(screen.getByRole("button", { name: "Abrir ficha de Ferretería Norte" }));
    expect(current.selectClient).toHaveBeenNthCalledWith(1, "client-1");
    expect(current.selectClient).toHaveBeenNthCalledWith(2, "client-2");
    view.rerender(<AuthContext.Provider value={authContext({ user: { ...limitedUser, permissions: ["CLIENTS_VIEW"] } })}>
      <ClientsPage workspace={workspace({ ...current, query: { ...current.query, clientId: "client-2" }, detail: { status: "loading", data: detail, error: null, stale: false } })} search="" onClearSearch={vi.fn()} />
    </AuthContext.Provider>);
    expect(screen.queryByRole("heading", { name: "Café Central" })).not.toBeInTheDocument();
    expect(screen.getByText("Cargando ficha del cliente…")).toBeInTheDocument();
  });

  it("relaciona cada pestaña con su panel y permite navegación con flechas", async () => {
    const current = workspace({ query: { ...workspace().query, clientId: "client-1" }, detail: { status: "success", data: detail, error: null, stale: false } });
    const user = userEvent.setup();
    renderPage(current);
    const summary = screen.getByRole("tab", { name: "Resumen" });
    const branches = screen.getByRole("tab", { name: "Sucursales" });
    expect(summary).toHaveAttribute("aria-controls", "client-panel-summary");
    expect(branches).toHaveAttribute("aria-controls", "client-panel-branches");
    expect(document.getElementById("client-panel-branches")).toBeInTheDocument();
    expect(document.getElementById("client-panel-branches")).toHaveAttribute("hidden");
    summary.focus();
    await user.keyboard("{ArrowRight}");
    expect(current.setTab).toHaveBeenCalledWith("branches");
    expect(branches).toHaveFocus();
  });

  it("muestra Nuevo cliente sólo con capacidad de gestión", () => {
    renderPage(workspace({ capabilities: { canView: true, canManage: true } }), ["CLIENTS_VIEW", "CLIENTS_MANAGE"]);
    expect(screen.getByRole("button", { name: "Nuevo cliente" })).toBeInTheDocument();
  });
});
