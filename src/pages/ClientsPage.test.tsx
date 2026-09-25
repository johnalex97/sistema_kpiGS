import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/AuthContext";
import { authContext, limitedUser } from "../test/auth-test-utils";
import type { ClientsWorkspace } from "../hooks/useClientsWorkspace";
import type { ClientDetail, ClientSummary } from "../models/client";
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
    setClientFilters: vi.fn(), selectClient: vi.fn(), closeDetail: vi.fn(), setTab: vi.fn(),
    refreshList: vi.fn(async () => {}), refreshDetail: vi.fn(async () => {}), refresh: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderPage(current: ClientsWorkspace, permissions = ["CLIENTS_VIEW"]) {
  const user = { ...limitedUser, permissions };
  return render(<AuthContext.Provider value={authContext({ user })}><ClientsPage workspace={current} search="" onClearSearch={vi.fn()} /></AuthContext.Provider>);
}

describe("ClientsPage", () => {
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
