import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { limitedUser, renderWithAuth } from "../test/auth-test-utils";

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

  it("filtra actividades por cliente", async () => {
    window.history.replaceState({}, "", "/actividades");
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    await user.type(screen.getByRole("textbox", { name: "Buscar orden, cliente o técnico" }), "Café Central");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Pérdida intermitente de conexión")).toBeInTheDocument();
    expect(within(table).queryByText("Instalación de 4 cámaras IP")).not.toBeInTheDocument();
  });

  it("registra una nueva actividad durante la sesión", async () => {
    window.history.replaceState({}, "", "/actividades");
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    await user.click(screen.getByRole("button", { name: "Nueva actividad" }));
    await user.type(screen.getByLabelText("Trabajo realizado"), "Revisión de cableado");
    await user.type(screen.getByLabelText("Cliente"), "Cliente de demostración");
    await user.type(screen.getByLabelText("Duración"), "45m");
    await user.click(screen.getByRole("button", { name: "Guardar actividad" }));
    expect(screen.getByRole("status")).toHaveTextContent("Actividad guardada");
    expect(screen.getByText("Revisión de cableado")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mantiene el modal accesible y permite cerrarlo con Escape", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    await user.click(screen.getByRole("button", { name: "Nueva actividad" }));
    expect(screen.getByRole("dialog", { name: "Nueva actividad" })).toBeInTheDocument();
    expect(screen.getByLabelText("Trabajo realizado")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva actividad" })).toHaveFocus();
  });

  it("muestra validación clara cuando faltan campos obligatorios", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);
    await user.click(screen.getByRole("button", { name: "Nueva actividad" }));
    await user.click(screen.getByRole("button", { name: "Guardar actividad" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Completa el trabajo realizado y el cliente.");
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
