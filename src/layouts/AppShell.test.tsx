import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { limitedUser, renderWithAuth } from "../test/auth-test-utils";

beforeEach(() => {
  vi.mocked(fetch).mockReset().mockResolvedValue(new Response(JSON.stringify({
    data: { status: "PREVIEW", items: [], warnings: [], capabilities: {} },
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/resumen");
});

describe("AppShell", () => {
  it("expone un buscador preparado para consultas operativas", () => {
    renderWithAuth(<AppShell />);

    const search = screen.getByRole("textbox", { name: "Buscar orden, cliente o técnico" });
    expect(search).toHaveAttribute("name", "query");
    expect(search).toHaveAttribute("autocomplete", "off");
    expect(search).toHaveAttribute("placeholder", "Buscar orden, cliente…");
  });

  it("navega entre módulos y actualiza la URL", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    await user.click(screen.getByRole("button", { name: "Actividades" }));
    expect(window.location.pathname).toBe("/actividades");
    expect(screen.getByRole("heading", { level: 1, name: "Actividades" })).toBeInTheDocument();
  });

  it("envía la búsqueda de actividades al listado persistente", async () => {
    window.history.replaceState({}, "", "/actividades");
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    vi.mocked(fetch).mockClear();
    await user.type(screen.getByRole("textbox", { name: "Buscar orden, cliente o técnico" }), "Café Central");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("search=Caf%C3%A9+Central"))).toBe(true));
  });

  it("entrega la búsqueda global al catálogo persistente de técnicos", async () => {
    window.history.replaceState({}, "", "/tecnicos");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      const data = path.endsWith("/kpis/dashboard")
        ? { status: "PREVIEW", items: [], warnings: [], capabilities: {} }
        : { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    vi.mocked(fetch).mockClear();

    await user.type(screen.getByRole("textbox", { name: "Buscar orden, cliente o técnico" }), "Carla");

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/technicians?search=Carla"))).toBe(true));
  });

  it("permite saltar al contenido principal con teclado", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);

    await user.tab();
    const skipLink = screen.getByRole("link", { name: "Saltar al contenido principal" });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });

  it("entrega la búsqueda global al registro persistente de reincidencias", async () => {
    window.history.replaceState({}, "", "/reincidencias");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      const data = path.endsWith("/recurrences/catalog")
        ? { causes: [], states: ["OPEN"], impacts: ["LOW"], responsibilities: ["UNDETERMINED"], transitions: [] }
        : path.endsWith("/recurrences/summary")
          ? { totalCases: 0, openCases: 0, highImpactCases: 0, additionalVisits: 0, additionalMinutes: 0, estimatedCost: "0.00", completedBaseOrders: 0, recurrenceRate: "0.00" }
          : { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    vi.mocked(fetch).mockClear();

    await user.type(screen.getByRole("textbox", { name: "Buscar orden, cliente o técnico" }), "enlace norte");

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => {
      const request = new URL(String(url));
      return request.pathname.endsWith("/recurrences") && request.searchParams.get("search") === "enlace norte";
    })).toBe(true));
  });

  it("monta un unico formulario persistente y restaura el foco al cerrarlo", async () => {
    window.history.replaceState({}, "", "/actividades");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      const data = path.endsWith("/activity-types") ? [] : { items: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const user = userEvent.setup();
    renderWithAuth(<AppShell />, { user: limitedUser });

    const trigger = await screen.findByRole("button", { name: "Nueva actividad" });
    expect(screen.getAllByRole("button", { name: "Nueva actividad" })).toHaveLength(1);
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Nueva actividad" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Trabajo realizado")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Nueva actividad" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("oculta módulos sin permiso y conserva la sesión en 403", () => {
    const first = renderWithAuth(<AppShell />, { user: limitedUser });
    expect(screen.queryByRole("button", { name: "Reincidencias" })).not.toBeInTheDocument();
    first.unmount();
    window.history.replaceState({}, "", "/reincidencias");
    renderWithAuth(<AppShell />, { user: limitedUser });
    expect(screen.getByRole("heading", { name: "Acceso denegado" })).toBeInTheDocument();
    expect(screen.getByText(limitedUser.displayName)).toBeInTheDocument();
  });

  it("oculta controles de creación cuando faltan permisos de actividades", () => {
    renderWithAuth(<AppShell />, { user: { ...limitedUser, permissions: ["KPI_VIEW_OWN"] } });

    expect(screen.queryByRole("button", { name: "Nueva actividad" })).not.toBeInTheDocument();
  });
});
