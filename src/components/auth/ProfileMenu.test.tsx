import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileMenu } from "./ProfileMenu";
import { adminUser, renderWithAuth } from "../../test/auth-test-utils";

afterEach(cleanup);

it("muestra usuario real y cierra sesión", async () => {
  const user = userEvent.setup();
  const logout = vi.fn(async () => undefined);
  renderWithAuth(<ProfileMenu />, { user: adminUser, logout });
  await user.click(screen.getByRole("button", { name: "Abrir perfil" }));
  expect(screen.getByText("Administrador")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(logout).toHaveBeenCalledTimes(1);
});

it("muestra un error seguro y conserva el perfil cuando logout falla", async () => {
  const user = userEvent.setup();
  const logout = vi.fn().mockRejectedValue(new Error("network"));
  renderWithAuth(<ProfileMenu />, { user: adminUser, logout });
  await user.click(screen.getByRole("button", { name: "Abrir perfil" }));
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible cerrar sesión. Intenta nuevamente.");
  expect(screen.getByRole("group", { name: "Perfil de usuario" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
});

it("expone el popover como divulgación y Escape restaura el foco", async () => {
  const user = userEvent.setup();
  renderWithAuth(<ProfileMenu />);

  const trigger = screen.getByRole("button", { name: "Abrir perfil" });
  await user.click(trigger);

  const panel = screen.getByRole("group", { name: "Perfil de usuario" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(trigger).toHaveAttribute("aria-controls", panel.id);
  expect(trigger).not.toHaveAttribute("aria-haspopup", "menu");

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("group", { name: "Perfil de usuario" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("reutiliza el formulario de contraseña en un diálogo que restaura el foco", async () => {
  const user = userEvent.setup();
  renderWithAuth(<ProfileMenu />);
  const trigger = screen.getByRole("button", { name: "Abrir perfil" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  expect(screen.getByRole("dialog", { name: "Cambiar contraseña" })).toBeInTheDocument();
  expect(screen.getByLabelText("Contraseña actual")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Cambiar contraseña" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
