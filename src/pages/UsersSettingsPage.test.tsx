import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminUser, limitedUser, renderWithAuth } from "../test/auth-test-utils";
import { UsersSettingsPage } from "./UsersSettingsPage";

const administrator = { ...adminUser, permissions: [...adminUser.permissions, "USERS_MANAGE"] };
const account = { id: "new-user", email: "ana@example.test", displayName: "Ana Técnica", status: "ACTIVE",
  mustChangePassword: true, roles: ["TECHNICIAN"], tecnico: null, version: 1, createdAt: "2026-10-05T00:00:00Z" };
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
}
beforeEach(() => vi.mocked(fetch).mockReset());

async function fillForm() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Nuevo usuario" }));
  await user.type(screen.getByLabelText("Nombre completo"), account.displayName);
  await user.type(screen.getByLabelText("Correo de acceso"), account.email);
  await user.type(screen.getByLabelText("Contraseña temporal"), "TecnicaTemporal-2026!");
  await user.type(screen.getByLabelText("Confirmar contraseña"), "TecnicaTemporal-2026!");
  return user;
}

describe("usuarios en configuración", () => {
  it("conserva el editor y el rol original cuando el servidor rechaza el cambio", async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) => init?.method === "PATCH"
      ? new Response(JSON.stringify({ errors: [{ code: "USER_VERSION_CONFLICT", message: "La cuenta cambió. Actualiza el listado" }] }), { status: 409 })
      : json({ items: [account], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    renderWithAuth(<UsersSettingsPage />, { user: administrator });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `Cambiar rol de ${account.displayName}` }));
    await user.selectOptions(screen.getByLabelText("Nuevo rol"), "SUPERVISOR");
    await user.click(screen.getByRole("button", { name: "Guardar rol" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta cambió");
    expect(screen.getByLabelText("Nuevo rol")).toHaveValue("SUPERVISOR");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar rol" })).toBeEnabled());
  });

  it("no permite cambiar roles a un supervisor aunque pueda gestionar usuarios", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ items: [account], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    renderWithAuth(<UsersSettingsPage />, { user: { ...administrator, roles: ["SUPERVISOR"] } });
    await screen.findByText(account.email);
    expect(screen.queryByRole("button", { name: `Cambiar rol de ${account.displayName}` })).not.toBeInTheDocument();
  });

  it("cambia el rol después de confirmar y actualiza el listado", async () => {
    let changed = false;
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "PATCH") { changed = true; return json({ ...account, roles: ["SUPERVISOR"], version: 2 }); }
      return json({ items: [{ ...account, roles: changed ? ["SUPERVISOR"] : ["TECHNICIAN"] }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    });
    renderWithAuth(<UsersSettingsPage />, { user: administrator });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `Cambiar rol de ${account.displayName}` }));
    await user.selectOptions(screen.getByLabelText("Nuevo rol"), "SUPERVISOR");
    expect(screen.getByText(/Se cerrarán las sesiones/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar rol" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Rol actualizado");
    const mutation = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({ role: "SUPERVISOR", version: 1 });
    expect(await screen.findByText("Supervisor")).toBeInTheDocument();
  });

  it("no muestra el cambio de rol para la cuenta del administrador conectado", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ items: [{ ...account, id: administrator.id, displayName: administrator.displayName, roles: ["ADMIN"] }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    renderWithAuth(<UsersSettingsPage />, { user: administrator });
    await screen.findByText(account.email);
    expect(screen.queryByRole("button", { name: `Cambiar rol de ${administrator.displayName}` })).not.toBeInTheDocument();
  });
  it("crea la cuenta y muestra cómo vincularla sin conservar la contraseña en pantalla", async () => {
    let created = false;
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") { created = true; return json(account, 201); }
      return json({ items: created ? [account] : [], pagination: { page: 1, pageSize: 20, totalItems: created ? 1 : 0, totalPages: created ? 1 : 0 } });
    });
    renderWithAuth(<UsersSettingsPage />, { user: administrator });
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByText(account.email)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cuenta creada");
    expect(screen.getByText("Sin vincular")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña temporal")).not.toBeInTheDocument();
    const mutation = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(mutation?.[1]?.credentials).toBe("include");
    expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({ displayName: account.displayName, email: account.email, temporaryPassword: "TecnicaTemporal-2026!" });
  });

  it("rechaza una confirmación diferente antes de enviar la cuenta", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ items: [], pagination: { page: 1, totalItems: 0, totalPages: 0 } }));
    renderWithAuth(<UsersSettingsPage />, { user: administrator });
    const user = await fillForm();
    await user.clear(screen.getByLabelText("Confirmar contraseña"));
    await user.type(screen.getByLabelText("Confirmar contraseña"), "OtraTemporal-2026!");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("presenta errores de correo duplicado y permite corregir el formulario", async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) => init?.method === "POST"
      ? new Response(JSON.stringify({ errors: [{ code: "USER_EMAIL_EXISTS", message: "Ya existe una cuenta con ese correo" }] }), { status: 409 })
      : json({ items: [], pagination: { page: 1, totalItems: 0, totalPages: 0 } }));
    renderWithAuth(<UsersSettingsPage />, { user: administrator });
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una cuenta con ese correo");
    expect(screen.getByLabelText("Correo de acceso")).toHaveValue(account.email);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled());
  });

  it("no consulta ni muestra cuentas a un técnico sin autorización", () => {
    renderWithAuth(<UsersSettingsPage />, { user: limitedUser });
    expect(screen.queryByRole("button", { name: "Nuevo usuario" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
