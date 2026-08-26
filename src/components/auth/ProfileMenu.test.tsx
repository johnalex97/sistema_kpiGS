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
