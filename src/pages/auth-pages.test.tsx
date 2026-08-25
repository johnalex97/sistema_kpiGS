import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../api/http";
import { ForcedPasswordChangePage } from "./ForcedPasswordChangePage";
import { LoginPage } from "./LoginPage";
import { SessionUnavailablePage } from "./SessionUnavailablePage";
import { provisionalUser, renderWithAuth } from "../test/auth-test-utils";

describe("páginas de autenticación", () => {
  it("envía correo y contraseña una sola vez", async () => {
    const user = userEvent.setup();
    const login = vi.fn(async () => undefined);
    renderWithAuth(<LoginPage />, { status: "anonymous", user: null, login });

    await user.type(screen.getByLabelText("Correo electrónico"), "ADMIN@GEEK.TEST");
    await user.type(screen.getByLabelText("Contraseña"), "Temporal123!");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(login).toHaveBeenCalledWith({ email: "ADMIN@GEEK.TEST", password: "Temporal123!" });
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("traduce errores de credenciales sin exponer el detalle del backend", async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue(new ApiClientError(401, "INVALID_CREDENTIALS", "raw detail"));
    renderWithAuth(<LoginPage />, { status: "anonymous", user: null, login });

    await user.type(screen.getByLabelText("Correo electrónico"), "admin@geek.test");
    await user.type(screen.getByLabelText("Contraseña"), "Temporal123!");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El correo o la contraseña no son correctos.");
    expect(screen.queryByText("raw detail")).not.toBeInTheDocument();
  });

  it("permite revelar una contraseña sin perder su etiqueta accesible", async () => {
    const user = userEvent.setup();
    renderWithAuth(<LoginPage />, { status: "anonymous", user: null });
    const password = screen.getByLabelText("Contraseña");

    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toBeInTheDocument();
  });

  it("deshabilita el envío pendiente y conserva el cierre de sesión en cambio obligatorio", async () => {
    const user = userEvent.setup();
    let resolveChange: () => void = () => undefined;
    const changePassword = vi.fn(() => new Promise<void>((resolve) => { resolveChange = resolve; }));
    renderWithAuth(<ForcedPasswordChangePage />, { changePassword, user: provisionalUser });

    await user.type(screen.getByLabelText("Contraseña actual"), "Actual123!xxx");
    await user.type(screen.getByLabelText("Nueva contraseña"), "Nueva123!xxxx");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Nueva123!xxxx");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(screen.getByRole("button", { name: "Actualizando contraseña…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
    resolveChange();
  });

  it("valida confirmación antes de cambiar contraseña", async () => {
    const user = userEvent.setup();
    const changePassword = vi.fn();
    renderWithAuth(<ForcedPasswordChangePage />, { changePassword, user: provisionalUser });

    await user.type(screen.getByLabelText("Contraseña actual"), "Actual123!xxx");
    await user.type(screen.getByLabelText("Nueva contraseña"), "Nueva123!xxxx");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Distinta123!");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it.each([
    ["PASSWORD_TOO_SHORT", "La nueva contraseña debe tener al menos 12 caracteres."],
    ["PASSWORD_TOO_LONG", "La nueva contraseña no puede tener más de 128 caracteres."],
    ["PASSWORD_UPPERCASE_REQUIRED", "Incluye al menos una letra mayúscula."],
    ["PASSWORD_LOWERCASE_REQUIRED", "Incluye al menos una letra minúscula."],
    ["PASSWORD_NUMBER_REQUIRED", "Incluye al menos un número."],
    ["PASSWORD_SPECIAL_REQUIRED", "Incluye al menos un carácter especial."],
  ])("traduce %s al mensaje de política correspondiente", async (code, message) => {
    const user = userEvent.setup();
    const changePassword = vi.fn().mockRejectedValue(new ApiClientError(400, code, "raw detail"));
    renderWithAuth(<ForcedPasswordChangePage />, { changePassword, user: provisionalUser });

    await user.type(screen.getByLabelText("Contraseña actual"), "Actual123!xxx");
    await user.type(screen.getByLabelText("Nueva contraseña"), "Nueva123!xxxx");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Nueva123!xxxx");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("aria-describedby", "new-password-error");
  });

  it("mantiene disponible el cierre de sesión durante el cambio obligatorio", async () => {
    const user = userEvent.setup();
    const logout = vi.fn(async () => undefined);
    renderWithAuth(<ForcedPasswordChangePage />, { logout, user: provisionalUser });

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("permite reintentar una restauración de sesión no disponible", async () => {
    const user = userEvent.setup();
    const retry = vi.fn(async () => undefined);
    renderWithAuth(<SessionUnavailablePage />, { status: "unavailable", user: null, retry });

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
