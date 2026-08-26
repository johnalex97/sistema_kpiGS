import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import type { AuthUser } from "../models/auth";
import { provisionalUser } from "../test/auth-test-utils";

function apiUser(user: AuthUser) {
  return new Response(JSON.stringify({ data: { user } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function apiError(status: number, code: string) {
  return new Response(JSON.stringify({ errors: [{ code, message: "Solicitud rechazada" }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.mocked(fetch).mockReset();
  window.history.replaceState({}, "", "/resumen");
});

it("entra, cambia contraseña obligatoria y cierra sesión", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockResolvedValueOnce(apiError(401, "UNAUTHORIZED"))
    .mockResolvedValueOnce(apiUser(provisionalUser))
    .mockResolvedValueOnce(apiUser({ ...provisionalUser, mustChangePassword: false }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));

  render(<App />);

  await screen.findByRole("heading", { name: "Iniciar sesión" });
  await user.type(screen.getByLabelText("Correo electrónico"), "admin@geek.test");
  await user.type(screen.getByLabelText("Contraseña"), "Temporal123!");
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await screen.findByRole("heading", { name: "Protege tu cuenta" });
  await user.type(screen.getByLabelText("Contraseña actual"), "Temporal123!");
  await user.type(screen.getByLabelText("Nueva contraseña"), "NuevaSegura123!");
  await user.type(screen.getByLabelText("Confirmar contraseña"), "NuevaSegura123!");
  await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
  expect(await screen.findByText(provisionalUser.displayName)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Abrir perfil" }));
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  expect(screen.getByText("Tu sesión se cerró correctamente.")).toHaveAttribute("role", "status");
});
