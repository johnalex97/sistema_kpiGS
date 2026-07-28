import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/resumen");
});

describe("Geek Solution Service Control", () => {
  it("navega entre módulos y actualiza la URL", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Actividades" }));

    expect(window.location.pathname).toBe("/actividades");
    expect(screen.getByRole("heading", { level: 1, name: "Actividades" })).toBeInTheDocument();
  });

  it("filtra actividades por cliente", async () => {
    window.history.replaceState({}, "", "/actividades");
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByRole("textbox", { name: "Buscar orden, cliente o técnico" }),
      "Café Central",
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("Pérdida intermitente de conexión")).toBeInTheDocument();
    expect(within(table).queryByText("Instalación de 4 cámaras IP")).not.toBeInTheDocument();
  });

  it("registra una nueva actividad durante la sesión", async () => {
    window.history.replaceState({}, "", "/actividades");
    const user = userEvent.setup();
    render(<App />);

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
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Nueva actividad" }));

    expect(screen.getByRole("dialog", { name: "Nueva actividad" })).toBeInTheDocument();
    expect(screen.getByLabelText("Trabajo realizado")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva actividad" })).toHaveFocus();
  });

  it("muestra validación clara cuando faltan campos obligatorios", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Nueva actividad" }));
    await user.click(screen.getByRole("button", { name: "Guardar actividad" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Completa el trabajo realizado y el cliente.",
    );
  });
});
