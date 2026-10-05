import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { adminUser, renderWithAuth } from "../test/auth-test-utils";

const administrator = { ...adminUser, permissions: [...adminUser.permissions, "USERS_MANAGE"] };
const option = { id: "service-1", code: "VPN_SUPPORT", name: "Soporte VPN", description: "Redes privadas", displayOrder: 1, isActive: true, createdAt: "2026-10-05T15:00:00Z", updatedAt: "2026-10-05T15:00:00Z" };
function page(items: unknown[]) { return { items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 } }; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } }); }
beforeEach(() => {
  window.history.replaceState({}, "", "/configuracion");
  vi.mocked(fetch).mockReset().mockImplementation(async input => String(input).includes("/catalogs/") ? json(page([option])) : json(page([])));
});
afterEach(() => window.history.replaceState({}, "", "/resumen"));
async function openCatalogs() {
  renderWithAuth(<AppShell />, { user: administrator });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Catálogos" }));
  await screen.findByText("Soporte VPN");
  return user;
}
describe("catálogos en Configuración", () => {
  it("mantiene visible el resultado del guardado bloqueando la navegación local mientras espera", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async (input, init) => init?.method === "PATCH" ? new Promise<Response>(resolve => { finish = resolve; }) : json(page(String(input).includes("/catalogs/") ? [option] : [])));
    const user = await openCatalogs();
    await user.click(screen.getByRole("button", { name: "Editar Soporte VPN" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByRole("button", { name: "Usuarios" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Causas de reincidencia" })).toBeDisabled();
    finish(json(option));
    expect(await screen.findByRole("status")).toHaveTextContent("Opción actualizada");
    expect(screen.getByRole("button", { name: "Usuarios" })).toBeEnabled();
  });
  it("abre los tres catálogos desde Configuración sin perder Usuarios", async () => {
    const user = await openCatalogs();
    expect(screen.getByRole("button", { name: "Servicios" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(screen.getByRole("navigation", { name: "Tipos de catálogo" })).getByRole("button", { name: "Actividades" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/catalogs/activities"))).toBe(true));
    await user.click(screen.getByRole("button", { name: "Causas de reincidencia" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/catalogs/recurrence-causes"))).toBe(true));
    await user.click(screen.getByRole("button", { name: "Usuarios" }));
    expect(await screen.findByRole("button", { name: "Nuevo usuario" })).toBeInTheDocument();
  });

  it("crea una opción y muestra el registro guardado", async () => {
    let created = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === "POST") { created = true; return json({ ...option, name: "Nueva instalación", code: "NEW_INSTALL" }, 201); }
      return json(page(String(input).includes("/catalogs/") ? created ? [{ ...option, name: "Nueva instalación", code: "NEW_INSTALL" }] : [option] : []));
    });
    const user = await openCatalogs();
    await user.click(screen.getByRole("button", { name: "Nueva opción" }));
    await user.type(screen.getByLabelText("Código interno"), "NEW_INSTALL");
    await user.type(screen.getByLabelText("Nombre"), "Nueva instalación");
    await user.click(screen.getByRole("button", { name: "Crear opción" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Opción creada");
    expect(await screen.findByText("Nueva instalación")).toBeInTheDocument();
    const mutation = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({ name: "Nueva instalación", code: "NEW_INSTALL", isActive: true });
  });

  it("desactiva una opción con código de solo lectura y control de concurrencia", async () => {
    let disabled = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === "PATCH") { disabled = true; return json({ ...option, isActive: false }); }
      return json(page(String(input).includes("/catalogs/") ? [{ ...option, isActive: !disabled }] : []));
    });
    const user = await openCatalogs();
    await user.click(screen.getByRole("button", { name: "Editar Soporte VPN" }));
    expect(screen.getByLabelText("Código interno")).toHaveAttribute("readonly");
    await user.click(screen.getByLabelText("Disponible en nuevos trabajos"));
    expect(screen.getByText(/Los trabajos existentes conservarán/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Opción actualizada");
    expect(await screen.findByText("Inactiva")).toBeInTheDocument();
    const mutation = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({ isActive: false, updatedAt: option.updatedAt });
    expect(JSON.parse(String(mutation?.[1]?.body))).not.toHaveProperty("code");
  });

  it("mantiene el formulario y muestra el rechazo de un cambio obsoleto", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => init?.method === "PATCH"
      ? new Response(JSON.stringify({ errors: [{ code: "CATALOG_VERSION_CONFLICT", message: "La opción cambió. Actualiza el listado" }] }), { status: 409 })
      : json(page(String(input).includes("/catalogs/") ? [option] : [])));
    const user = await openCatalogs();
    await user.click(screen.getByRole("button", { name: "Editar Soporte VPN" }));
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "Nombre propuesto");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La opción cambió");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Nombre propuesto");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra el autor y los cambios del historial", async () => {
    vi.mocked(fetch).mockImplementation(async input => String(input).includes("/history") ? json(page([{
      id: "audit-1", action: "CATALOG_UPDATED", occurredAt: "2026-10-05T18:00:00Z", actor: { id: "u1", displayName: "Ada Admin" },
      beforeData: { code: "VPN_SUPPORT", name: "Soporte VPN", isActive: true, displayOrder: 1, description: "Redes privadas" },
      afterData: { code: "VPN_SUPPORT", name: "Soporte VPN", isActive: false, displayOrder: 1, description: "Redes privadas" },
    }])) : json(page(String(input).includes("/catalogs/") ? [option] : [])));
    const user = await openCatalogs();
    await user.click(screen.getByRole("button", { name: "Ver cambios de Soporte VPN" }));
    expect(await screen.findByRole("heading", { name: "Historial de Soporte VPN" })).toBeInTheDocument();
    expect(await screen.findByText("Estado: Activa → Inactiva")).toBeInTheDocument();
    expect(screen.getByText("Actualización · Ada Admin")).toBeInTheDocument();
  });

  it("oculta Catálogos a un supervisor aunque pueda administrar usuarios", async () => {
    renderWithAuth(<AppShell />, { user: { ...administrator, roles: ["SUPERVISOR"] } });
    await screen.findByRole("heading", { name: "Usuarios" });
    expect(screen.queryByRole("button", { name: "Catálogos" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/catalogs/"))).toBe(false);
  });
});
