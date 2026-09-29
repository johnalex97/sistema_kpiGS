import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "./auth/AuthContext";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./auth/AuthGate";
import { AppShell } from "./layouts/AppShell";
import { authContext, adminUser } from "./test/auth-test-utils";
import type { ClientBranch, ClientContact, ClientDetail } from "./models/client";

const managed = ["CLIENTS_VIEW", "CLIENTS_MANAGE"];
const dates = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const branch: ClientBranch = { ...dates, id: "b1", clientId: "c1", code: "S-001", name: "Centro", address: "Principal", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null, isActive: true, isEffectivelyActive: true, version: 3 };
const contact: ClientContact = { ...dates, id: "p1", clientId: "c1", branchId: null, scope: "CLIENT", branchName: null, fullName: "Ana", position: null, email: "ana@acme.test", phone: null, isActive: true, isEffectivelyActive: true, isPrimary: true, version: 3 };
const client: ClientDetail = { ...dates, id: "c1", code: "CLI-001", tradeName: "Acme", legalName: null, taxId: null, email: null, phone: null, notes: null, isActive: true, version: 3, branches: [branch], contacts: [contact] };
const page = <T,>(items: T[]) => ({ items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 } });
const response = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
function shell(permissions = managed) { return <AuthContext.Provider value={authContext({ user: { ...adminUser, permissions } })}><AppShell /></AuthContext.Provider>; }

beforeEach(() => {
  // jsdom cannot resolve CSS min() with mixed percentage/viewport units.
  // Only test dimensions are fixed; focus/visibility behavior stays real.
  const style = document.createElement("style");
  style.id = "clients-jsdom-viewport";
  style.textContent = ".clients-wizard { width: 680px; max-height: 760px; }";
  document.head.append(style);
  window.history.replaceState({}, "", "/clientes");
  vi.stubGlobal("innerWidth", 1280);
  vi.mocked(fetch).mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/branches")) return response(page([branch]));
    if (path.endsWith("/contacts")) return response(page([contact]));
    if (path.endsWith("/c1")) return response(client);
    return response(page([{ ...client, activeBranchCount: 1, activeContactCount: 1 }]));
  });
});
afterEach(() => { document.getElementById("clients-jsdom-viewport")?.remove(); vi.unstubAllGlobals(); vi.mocked(fetch).mockReset(); });

describe("aceptación integrada de Clientes", () => {
  it("crea en wizard con US y conserva el país al editar la sucursal", async () => {
    const usBranch = { ...branch, country: "US" };
    let creation: unknown;
    let update: unknown;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/clients") && init?.method === "POST") {
        creation = JSON.parse(String(init.body));
        return response({ ...client, branches: [usBranch] });
      }
      if (path.endsWith("/branches/b1") && init?.method === "PATCH") {
        update = JSON.parse(String(init.body));
        return response({ ...usBranch, name: "Renovada", version: 9 });
      }
      if (path.endsWith("/branches")) return response(page([usBranch]));
      if (path.endsWith("/c1")) return response({ ...client, branches: [usBranch] });
      return response(page([{ ...client, activeBranchCount: 1, activeContactCount: 1 }]));
    });
    const user = userEvent.setup();
    render(shell());
    await user.click(await screen.findByRole("button", { name: "Nuevo cliente" }));
    await user.type(screen.getByRole("textbox", { name: /Nombre comercial/ }), "Acme");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.type(screen.getByRole("textbox", { name: /Nombre de la sucursal/ }), "Centro");
    await user.type(screen.getByRole("textbox", { name: /Dirección/ }), "Principal");
    expect(screen.getByRole("textbox", { name: /País/ })).toHaveValue("HN");
    await user.clear(screen.getByRole("textbox", { name: /País/ }));
    await user.type(screen.getByRole("textbox", { name: /País/ }), "US");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    await user.click(await screen.findByRole("tab", { name: "Sucursales" }));
    await user.click(await screen.findByRole("button", { name: "Editar sucursal" }));
    expect(screen.getByRole("textbox", { name: "País" })).toHaveValue("US");
    await user.clear(screen.getByRole("textbox", { name: "Nombre" }));
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Renovada");
    await user.click(screen.getByRole("button", { name: "Guardar sucursal" }));
    await waitFor(() => expect(update).toMatchObject({ name: "Renovada", country: "US", version: 3 }));
    expect(creation).toMatchObject({ mainBranch: { country: "US" } });
    expect(screen.queryByRole("dialog", { name: "Editar sucursal" })).toBeNull();
  });
  it("cambiar a móvil con formulario abierto no pone el detalle encima del diálogo", async () => {
    const user = userEvent.setup();
    render(shell());
    await user.click(await screen.findByRole("button", { name: "Abrir ficha de Acme" }));
    await user.click(await screen.findByRole("button", { name: "Editar cliente" }));
    const field = screen.getByLabelText("Nombre comercial");
    expect(field).toHaveFocus();
    vi.stubGlobal("innerWidth", 390);
    fireEvent(window, new Event("resize"));
    expect(field).toHaveFocus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Editar cliente Acme" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Detalle de Acme" })).toBeVisible();
  });
  it.each([
    ["Resumen", "Editar cliente", "Editar cliente Acme"],
    ["Resumen", "Desactivar cliente", "Desactivar cliente Acme"],
    ["Sucursales", "Nueva sucursal", "Nueva sucursal"],
    ["Sucursales", "Editar sucursal", "Editar sucursal"],
    ["Sucursales", "Desactivar sucursal", "Desactivar sucursal Centro"],
    ["Contactos", "Nuevo contacto", "Nuevo contacto"],
    ["Contactos", "Editar contacto", "Editar contacto"],
    ["Contactos", "Desactivar contacto", "Desactivar contacto Ana"],
  ])("%s: %s contiene foco y restaura al cerrar", async (tab, action, label) => {
    const user = userEvent.setup();
    render(shell());
    await user.click(await screen.findByRole("button", { name: "Abrir ficha de Acme" }));
    await user.click(await screen.findByRole("tab", { name: tab }));
    const trigger = await screen.findByRole("button", { name: action });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: label });
    const first = document.activeElement;
    expect(dialog.contains(first)).toBe(true);
    expect(trigger.closest("[inert]")).not.toBeNull();
    await user.tab({ shift: true });
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons[buttons.length - 1]).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    expect(parseFloat(getComputedStyle(first as Element).minHeight)).toBeGreaterThanOrEqual(44);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("ruta, filtros, ficha, teclado, sucursales y principal confirmado con versión 17", async () => {
    let created = false;
    let saved: unknown;
    const next = { ...contact, id: "p2", fullName: "Bea", version: 17 };
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/contacts") && init?.method === "POST") {
        saved = JSON.parse(String(init.body)); created = true; return response(next);
      }
      const contacts = created ? [{ ...contact, isPrimary: false, version: 17 }, next] : [contact];
      if (path.endsWith("/contacts")) return response(page(contacts));
      if (path.endsWith("/branches")) return response(page([branch]));
      if (path.endsWith("/c1")) return response({ ...client, contacts });
      return response(page([{ ...client, activeBranchCount: 1, activeContactCount: contacts.length }]));
    });
    const user = userEvent.setup();
    render(shell());
    await screen.findByRole("button", { name: "Abrir ficha de Acme" });
    await user.type(screen.getByLabelText("Buscar clientes"), "Acme");
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("search")).toBe("Acme"));
    await user.click(screen.getByRole("button", { name: "Abrir ficha de Acme" }));
    await screen.findByRole("article", { name: "Ficha de Acme" });
    screen.getByRole("tab", { name: "Resumen" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Sucursales" })).toHaveFocus();
    await screen.findByRole("article", { name: "Sucursal Centro" });
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Contactos" })).toHaveFocus();
    await screen.findByRole("article", { name: "Contacto Ana" });
    await user.keyboard("{Home}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Contactos" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Nuevo contacto" }));
    await user.type(screen.getByLabelText("Nombre completo"), "Bea");
    await user.click(screen.getByLabelText("Contacto principal"));
    await user.click(screen.getByRole("button", { name: "Guardar contacto" }));
    const card = await screen.findByRole("article", { name: "Contacto Bea" });
    expect(within(card).getByText("Principal general")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Contacto Ana" })).queryByText("Principal general")).toBeNull();
    expect(saved).toMatchObject({ fullName: "Bea", scope: "CLIENT", isPrimary: true });
    expect(saved).not.toHaveProperty("branchId");
    await user.click(within(card).getByRole("button", { name: "Editar contacto" }));
    expect(screen.getByRole("dialog", { name: "Editar contacto" })).toHaveTextContent("Versión base 17");
  });

  it("revocar manage destruye el wizard y su borrador, conservando lectura", async () => {
    const user = userEvent.setup();
    const view = render(shell());
    await screen.findByRole("button", { name: "Abrir ficha de Acme" });
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    await user.type(screen.getByLabelText("Nombre comercial *"), "Borrador privado");
    view.rerender(shell(["CLIENTS_VIEW"]));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir ficha de Acme" })).toBeVisible();
    view.rerender(shell());
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    expect(screen.getByLabelText("Nombre comercial *")).toHaveValue("");
  });

  it("revocar view aborta lecturas pendientes y AppShell elimina nombres y contactos", async () => {
    const user = userEvent.setup();
    const view = render(shell());
    await user.click(await screen.findByRole("button", { name: "Abrir ficha de Acme" }));
    await screen.findByRole("article", { name: "Ficha de Acme" });
    await user.click(screen.getByRole("tab", { name: "Contactos" }));
    await screen.findByRole("article", { name: "Contacto Ana" });
    const signals: AbortSignal[] = [];
    vi.mocked(fetch).mockImplementation((_url, init) => { signals.push(init!.signal as AbortSignal); return new Promise(() => {}); });
    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(signals).toHaveLength(3);
    view.rerender(shell([]));
    expect(screen.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
    expect(document.body).not.toHaveTextContent("Acme");
    expect(document.body).not.toHaveTextContent("ana@acme.test");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("403 de lectura muestra acceso denegado sin retener datos", async () => {
    const user = userEvent.setup();
    render(shell());
    await screen.findByRole("button", { name: "Abrir ficha de Acme" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Denegado" } }), { status: 403 }));
    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(await screen.findByRole("heading", { name: "Acceso denegado" })).toBeVisible();
    expect(document.body).not.toHaveTextContent("Acme");
  });

  it("401 mantiene la expiración global de sesión", async () => {
    const user = userEvent.setup();
    const api = { me: vi.fn(async () => ({ ...adminUser, permissions: managed })), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() };
    render(<AuthProvider api={api}><AuthGate><AppShell /></AuthGate></AuthProvider>);
    await screen.findByRole("button", { name: "Abrir ficha de Acme" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sesión vencida" } }), { status: 401 }));
    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    await screen.findByRole("button", { name: /iniciar sesión/i });
    expect(document.body).not.toHaveTextContent("Acme");
  });

  it("detalle móvil y diálogo anidado aíslan foco y Escape pending no cierra ninguno", async () => {
    vi.stubGlobal("innerWidth", 390);
    const user = userEvent.setup();
    render(shell());
    const trigger = await screen.findByRole("button", { name: "Abrir ficha de Acme" });
    await user.click(trigger);
    const detail = await screen.findByRole("dialog", { name: "Detalle de Acme" });
    expect(detail.contains(document.activeElement)).toBe(true);
    const lifecycleTrigger = within(detail).getByRole("button", { name: "Desactivar cliente" });
    await user.click(lifecycleTrigger);
    const dialog = screen.getByRole("dialog", { name: "Desactivar cliente Acme" });
    expect(detail.closest("[inert]")).not.toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(lifecycleTrigger).toHaveFocus();
    expect(detail.closest("[inert]")).toBeNull();
    await user.click(lifecycleTrigger);
    await user.type(screen.getByLabelText("Motivo"), "Cierre administrativo");
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await user.click(screen.getByRole("button", { name: "Confirmar desactivación" }));
    const pending = screen.getByRole("dialog", { name: "Desactivar cliente Acme" });
    fireEvent.keyDown(pending, { key: "Escape" });
    expect(pending).toBeInTheDocument();
    expect(detail).toBeInTheDocument();
    expect(pending).toHaveFocus();
    await act(async () => complete(response({ ...client, isActive: false, version: 17 })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Desactivar cliente Acme" })).toBeNull());
    fireEvent.keyDown(detail, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });
});
