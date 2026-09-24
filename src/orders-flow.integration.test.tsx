import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./layouts/AppShell";
import type { AuthUser } from "./models/auth";
import type { Evidence } from "./models/evidence";
import type { OrderDetail, OrderHistoryEntry, OrderStatus } from "./models/order";
import { renderWithAuth } from "./test/auth-test-utils";

const orderId = "order-14";
const technicianId = "tech-14";
const serviceType = { id: "service-1", code: "SUPPORT", name: "Soporte técnico" };
const material = { id: "material-1", code: "MAT-001", name: "Cable UTP", unit: "metro", referenceCost: "18.75" };
const primary = { id: technicianId, code: "TEC-014", fullName: "Ana López" };

const adminUser: AuthUser = {
  id: "admin-14",
  email: "admin@geek.test",
  displayName: "Ada Admin",
  mustChangePassword: false,
  technicianId: null,
  roles: ["ADMIN"],
  permissions: [
    "ORDERS_VIEW_ALL",
    "ORDERS_MANAGE",
    "CLIENTS_VIEW",
    "TECHNICIANS_VIEW",
    "EVIDENCES_VIEW",
    "EVIDENCES_UPLOAD",
    "EVIDENCES_MANAGE",
  ],
};

const technicianUser: AuthUser = {
  id: "user-tech-14",
  email: "ana@geek.test",
  displayName: "Ana López",
  mustChangePassword: false,
  technicianId,
  roles: ["TECHNICIAN"],
  permissions: ["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN", "EVIDENCES_VIEW", "EVIDENCES_UPLOAD"],
};

function order(status: OrderStatus, version: number): OrderDetail {
  const assigned = status !== "PENDING";
  return {
    id: orderId,
    orderNumber: "OT-2026-0014",
    client: { id: "client-1", code: "CLI-001", tradeName: "Farmacia Central" },
    branch: { id: "branch-1", code: "TGU", name: "Sucursal Centro" },
    serviceType,
    priority: "HIGH",
    status,
    reportedProblem: "Enlace principal sin servicio",
    description: "Revisar cableado del rack",
    scheduledFor: "2026-09-18T14:00:00.000Z",
    primaryTechnician: assigned ? primary : null,
    supportCount: 0,
    overdue: false,
    startedAt: ["IN_PROGRESS", "PAUSED", "COMPLETED"].includes(status) ? "2026-09-18T15:00:00.000Z" : null,
    endedAt: status === "COMPLETED" ? "2026-09-18T16:00:00.000Z" : null,
    estimatedMinutes: 60,
    totalMinutes: status === "COMPLETED" ? 60 : null,
    createdAt: "2026-09-18T12:00:00.000Z",
    updatedAt: "2026-09-18T15:00:00.000Z",
    version,
    diagnosis: status === "COMPLETED" ? "Conector dañado" : null,
    result: status === "COMPLETED" ? "Enlace restablecido" : null,
    cancellationReason: status === "CANCELLED" ? "Solicitud administrativa confirmada" : null,
    participants: assigned ? [{ ...primary, role: "PRIMARY", assignedAt: "2026-09-18T13:00:00.000Z", unassignedAt: null, active: true }] : [],
    materials: [],
  };
}

function json(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyOf(init?: RequestInit): Record<string, unknown> | null {
  return typeof init?.body === "string"
    ? JSON.parse(init.body) as Record<string, unknown>
    : null;
}

interface MutationCall {
  method: string;
  path: string;
  version: number | undefined;
}

function list(current: OrderDetail | null) {
  const items = current ? [current] : [];
  return { items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 } };
}

function installAdminApi() {
  let current: OrderDetail | null = null;
  const mutations: MutationCall[] = [];
  vi.mocked(fetch).mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = bodyOf(init);

    if (method === "GET" && path === "/orders/catalog") return json({ serviceTypes: [serviceType], materials: [material] });
    if (method === "GET" && path === "/orders") return json(list(current));
    if (method === "GET" && path === "/clients") return json({ items: [{ id: "client-1", code: "CLI-001", tradeName: "Farmacia Central" }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    if (method === "GET" && path === "/clients/client-1/branches") return json({ items: [{ id: "branch-1", code: "TGU", name: "Sucursal Centro", address: "Centro", isEffectivelyActive: true }], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } });
    if (method === "GET" && path === "/technicians") return json({ items: [{ ...primary, status: "AVAILABLE" }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    if (method === "GET" && path === `/orders/${orderId}` && current) return json(current);

    if (method === "POST" && path === "/orders") {
      mutations.push({ method, path, version: body?.version as number | undefined });
      current = { ...order("PENDING", 3), primaryTechnician: null, participants: [] };
      return json(current);
    }
    if (method === "PATCH" && path === `/orders/${orderId}` && current) {
      mutations.push({ method, path, version: body?.version as number | undefined });
      current = { ...current, description: String(body?.description), version: 9 };
      return json(current);
    }
    if (method === "POST" && path === `/orders/${orderId}/assignments` && current) {
      mutations.push({ method, path, version: body?.version as number | undefined });
      current = order("ASSIGNED", 17);
      return json(current);
    }
    if (method === "POST" && path === `/orders/${orderId}/cancel` && current) {
      mutations.push({ method, path, version: body?.version as number | undefined });
      current = { ...order("CANCELLED", 25), cancellationReason: String(body?.cancellationReason) };
      return json(current);
    }
    if (method === "POST" && path === `/orders/${orderId}/adjustments` && current) {
      mutations.push({ method, path, version: body?.version as number | undefined });
      current = { ...current, description: String(body?.description), version: 42 };
      return json(current);
    }
    throw new Error(`Solicitud administrativa no prevista: ${method} ${path}`);
  });
  return mutations;
}

function installTechnicianApi() {
  let current = order("ASSIGNED", 51);
  let evidences: Evidence[] = [];
  const mutations: MutationCall[] = [];
  const history: OrderHistoryEntry[] = [{
    id: "history-1",
    previousStatus: "ASSIGNED",
    newStatus: "ON_ROUTE",
    action: "ON_ROUTE",
    comment: "Salida confirmada",
    occurredAt: "2026-09-18T14:30:00.000Z",
    user: { id: technicianUser.id, displayName: technicianUser.displayName },
    metadata: null,
  }];

  const transition = (nextStatus: OrderStatus, nextVersion: number, body: Record<string, unknown> | null, method: string, path: string) => {
    mutations.push({ method, path, version: body?.version as number | undefined });
    current = { ...order(nextStatus, nextVersion), materials: current.materials };
    return json(current);
  };

  vi.mocked(fetch).mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = bodyOf(init);

    if (method === "GET" && path === "/orders/catalog") return json({ serviceTypes: [serviceType], materials: [material] });
    if (method === "GET" && path === "/orders") return json(list(current));
    if (method === "GET" && path === `/orders/${orderId}`) return json(current);
    if (method === "POST" && path === `/orders/${orderId}/on-route`) return transition("ON_ROUTE", 63, body, method, path);
    if (method === "POST" && path === `/orders/${orderId}/start`) return transition("IN_PROGRESS", 78, body, method, path);
    if (method === "POST" && path === `/orders/${orderId}/pause`) return transition("PAUSED", 105, body, method, path);
    if (method === "POST" && path === `/orders/${orderId}/resume`) return transition("IN_PROGRESS", 122, body, method, path);
    if (method === "POST" && path === `/orders/${orderId}/complete`) return transition("COMPLETED", 140, body, method, path);
    if (method === "POST" && path === `/orders/${orderId}/materials`) {
      mutations.push({ method, path, version: body?.version as number | undefined });
      current = {
        ...current,
        version: 91,
        materials: [{
          id: "usage-1",
          material: { id: material.id, code: material.code, name: material.name, unit: material.unit },
          quantity: String(body?.quantity),
          historicalUnitCost: material.referenceCost,
          observation: String(body?.observation),
          createdAt: "2026-09-18T15:15:00.000Z",
        }],
      };
      return json(current);
    }
    if (method === "DELETE" && path === `/orders/${orderId}/materials/usage-1`) {
      mutations.push({ method, path, version: body?.version as number | undefined });
      current = { ...current, version: 99, materials: [] };
      return json(current);
    }
    if (method === "GET" && path === `/orders/${orderId}/evidences`) return json({ items: evidences, pagination: { page: 1, pageSize: 20, totalItems: evidences.length, totalPages: evidences.length ? 1 : 0 } });
    if (method === "POST" && path === `/orders/${orderId}/evidences`) {
      evidences = [{
        id: "evidence-1",
        originalName: "rack-final.pdf",
        mimeType: "application/pdf",
        fileExtension: "pdf",
        sizeBytes: 7,
        description: "Cierre técnico",
        accessLevel: "TECHNICIAN",
        uploadedBy: { id: technicianUser.id, displayName: technicianUser.displayName },
        resourceType: "ORDER",
        resourceId: orderId,
        checksumSha256: "checksum",
        version: 3,
        createdAt: "2026-09-18T15:30:00.000Z",
        updatedAt: "2026-09-18T15:30:00.000Z",
      }];
      return json(evidences[0]);
    }
    if (method === "GET" && path === `/orders/${orderId}/history`) return json({ items: history, pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    throw new Error(`Solicitud técnica no prevista: ${method} ${path}`);
  });
  return mutations;
}

afterEach(() => {
  cleanup();
  vi.mocked(fetch).mockReset();
  window.history.replaceState({}, "", "/resumen");
});

describe("flujo integrado de órdenes", () => {
  it("limpia búsqueda visible, consulta URL y selección conjuntamente", async () => {
    installAdminApi();
    window.history.replaceState({}, "", "/ordenes");
    renderWithAuth(<AppShell />, { user: adminUser });
    const user = userEvent.setup();
    const search = screen.getByLabelText("Buscar orden, cliente o técnico");
    await user.type(search, "OT");
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("search")).toBe("OT"));
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(search).toHaveValue("");
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("search")).toBe(false));
    expect(new URLSearchParams(window.location.search).has("orderId")).toBe(false);
  });
  it("permite a administración crear, editar, asignar, cancelar y ajustar con la versión confirmada", async () => {
    const mutations = installAdminApi();
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/ordenes");
    renderWithAuth(<AppShell />, { user: adminUser });

    await screen.findByText("No hay órdenes para estos filtros");
    await user.click(screen.getByRole("button", { name: "Nueva orden" }));
    const createDialog = screen.getByRole("dialog", { name: "Nueva orden" });
    await user.type(within(createDialog).getByLabelText("Cliente"), "Farmacia");
    await user.click(await screen.findByText("Farmacia Central"));
    await user.selectOptions(within(createDialog).getByLabelText("Sucursal"), "branch-1");
    await user.selectOptions(screen.getByLabelText("Tipo de servicio"), "service-1");
    await user.type(screen.getByLabelText("Problema reportado"), "Enlace principal sin servicio");
    await user.type(screen.getByLabelText("Descripción"), "Revisar cableado del rack");
    await user.click(screen.getByText("Crear orden"));

    expect(await screen.findByText("Versión 3")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Editar orden"));
    const editDialog = (await screen.findByText(/Editar OT-2026-0014/)).closest("[role='dialog']") as HTMLElement;
    await user.clear(within(editDialog).getByLabelText("Descripción"));
    await user.type(within(editDialog).getByLabelText("Descripción"), "Rack y patch panel revisados");
    await user.click(within(editDialog).getByText("Guardar cambios"));
    expect(await screen.findByText("Versión 9")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Buscar técnico"), "Ana");
    await user.click(await screen.findByText("Ana López"));
    await user.click(screen.getByText("Asignar técnico"));
    expect(await screen.findByText("Versión 17")).toBeInTheDocument();

    await user.click(screen.getByText("Cancelar orden"));
    await user.type(screen.getByLabelText("Motivo de cancelación"), "Solicitud administrativa confirmada");
    await user.click(screen.getByText("Cancelar definitivamente"));
    expect(await screen.findByText("Versión 25")).toBeInTheDocument();

    await user.click(screen.getByText("Ajustar orden"));
    await user.type(screen.getByLabelText("Motivo del ajuste"), "Corrección autorizada por supervisión");
    const adjustDialog = screen.getByText("CORRECCIÓN AUDITADA").closest("[role='dialog']") as HTMLElement;
    await user.clear(within(adjustDialog).getByLabelText("Descripción"));
    await user.type(within(adjustDialog).getByLabelText("Descripción"), "Cierre administrativo documentado");
    await user.click(within(adjustDialog).getByText("Guardar ajuste"));
    expect(await screen.findByText("Versión 42")).toBeInTheDocument();

    expect(mutations).toEqual([
      { method: "POST", path: "/orders", version: undefined },
      { method: "PATCH", path: `/orders/${orderId}`, version: 3 },
      { method: "POST", path: `/orders/${orderId}/assignments`, version: 9 },
      { method: "POST", path: `/orders/${orderId}/cancel`, version: 17 },
      { method: "POST", path: `/orders/${orderId}/adjustments`, version: 25 },
    ]);
  }, 15_000);

  it("permite al técnico operar, registrar material y evidencia, y consultar el historial por teclado", async () => {
    const mutations = installTechnicianApi();
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/ordenes");
    renderWithAuth(<AppShell />, { user: technicianUser });

    await user.click(await screen.findByRole("button", { name: "Abrir OT-2026-0014" }));
    expect(await screen.findByText("Versión 51")).toBeInTheDocument();
    const route = screen.getByLabelText("Ruta operativa de la orden");
    expect(within(route).getByText("Asignada")).toHaveAttribute("aria-current", "step");
    expect(route.querySelectorAll('i[aria-hidden="true"]')).toHaveLength(6);
    const tabs = screen.getByRole("tablist", { name: "Áreas del detalle" });
    const summaryTab = within(tabs).getByRole("tab", { name: "Resumen" });
    const materialsTab = within(tabs).getByRole("tab", { name: "Materiales" });
    summaryTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(tabs).getByRole("tab", { name: "Equipo" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(materialsTab).toHaveFocus();
    const materialsPanel = screen.getByRole("tabpanel", { name: "Materiales" });
    expect(materialsTab).toHaveAttribute("aria-controls", materialsPanel.id);
    await user.keyboard("{End}");
    expect(within(tabs).getByRole("tab", { name: "Historial" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(summaryTab).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(within(tabs).getByRole("tab", { name: "Historial" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Salir en camino" }));
    expect(await screen.findByText("Versión 63")).toBeInTheDocument();
    expect(screen.getByText("OT-2026-0014: En camino. Versión 63.", { selector: "[aria-live='polite']" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Iniciar trabajo" }));
    expect(await screen.findByText("Versión 78")).toBeInTheDocument();

    await user.click(screen.getByText("Materiales"));
    await user.selectOptions(screen.getByLabelText("Material"), material.id);
    await user.type(screen.getByLabelText("Cantidad"), "2.125");
    await user.type(screen.getByLabelText("Observación"), "Tramo reemplazado");
    await user.click(screen.getByText("Registrar material", { selector: "button[type='submit']" }));
    expect(await screen.findByText("Versión 91")).toBeInTheDocument();
    expect(screen.getByText("Cable UTP")).toBeInTheDocument();

    const removeButton = screen.getByLabelText("Retirar Cable UTP");
    await user.click(removeButton);
    const removal = screen.getByLabelText("Retirar material", { selector: "[role='dialog']" });
    expect(within(removal).getByLabelText("Cerrar retiro")).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(within(removal).getByText("Confirmar retiro")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Retirar material", { selector: "[role='dialog']" })).not.toBeInTheDocument();
    expect(removeButton).toHaveFocus();

    await user.click(screen.getByText("Evidencias"));
    await screen.findByText("No hay evidencias activas para esta orden.");
    await user.upload(screen.getByLabelText("Archivo de evidencia"), new File(["informe"], "rack-final.pdf", { type: "application/pdf" }));
    await user.type(screen.getByLabelText("Descripción"), "Cierre técnico");
    await user.click(screen.getByText("Subir evidencia"));
    expect(await screen.findByText("rack-final.pdf")).toBeInTheDocument();

    await user.click(screen.getByText("Historial"));
    expect(await screen.findByText("Salida confirmada")).toBeInTheDocument();

    await user.click(screen.getByText("Pausar trabajo"));
    await user.type(screen.getByLabelText("Comentario"), "Esperando acceso al rack");
    await user.click(screen.getByText("Pausar orden", { selector: "button[type='submit']" }));
    expect(await screen.findByText("Versión 105")).toBeInTheDocument();
    await user.click(screen.getByText("Reanudar trabajo"));
    expect(await screen.findByText("Versión 122")).toBeInTheDocument();
    await user.click(screen.getByText("Finalizar orden"));
    await user.type(screen.getByLabelText("Diagnóstico"), "Conector dañado");
    await user.type(screen.getByLabelText("Resultado"), "Enlace restablecido");
    await user.click(screen.getByText("Finalizar orden", { selector: "button[type='submit']" }));
    expect(await screen.findByText("Versión 140")).toBeInTheDocument();
    expect(screen.getByText("Finalizada", { selector: "[aria-current='step']" })).toBeInTheDocument();

    expect(mutations).toEqual([
      { method: "POST", path: `/orders/${orderId}/on-route`, version: 51 },
      { method: "POST", path: `/orders/${orderId}/start`, version: 63 },
      { method: "POST", path: `/orders/${orderId}/materials`, version: 78 },
      { method: "POST", path: `/orders/${orderId}/pause`, version: 91 },
      { method: "POST", path: `/orders/${orderId}/resume`, version: 105 },
      { method: "POST", path: `/orders/${orderId}/complete`, version: 122 },
    ]);
  }, 15_000);
});
