import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrdersApi } from "./orders";

function jsonResponse<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const orderDetail = {
  id: "order-1",
  orderNumber: "OT-2026-0001",
  client: { id: "client-1", code: "CLI-001", tradeName: "Acme" },
  branch: { id: "branch-1", code: "MAIN", name: "Principal" },
  serviceType: { id: "service-1", code: "SUPPORT", name: "Soporte" },
  priority: "HIGH",
  status: "ASSIGNED",
  reportedProblem: "Sin conectividad",
  scheduledFor: "2026-09-20T14:00:00.000Z",
  primaryTechnician: { id: "tech-1", code: "TEC-001", fullName: "Ana López" },
  supportCount: 0,
  overdue: false,
  startedAt: null,
  endedAt: null,
  estimatedMinutes: 60,
  totalMinutes: null,
  createdAt: "2026-09-16T14:00:00.000Z",
  updatedAt: "2026-09-16T14:00:00.000Z",
  version: 4,
  description: "Revisar enlace",
  diagnosis: null,
  result: null,
  cancellationReason: null,
  participants: [],
  materials: [],
} as const;

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("createOrdersApi", () => {
  it("serializes repeated filters, dates, booleans and pagination", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      items: [],
      pagination: { page: 2, pageSize: 20, totalItems: 0, totalPages: 0 },
    }));

    await createOrdersApi().list({
      search: "  GS-2026  ",
      statuses: ["ASSIGNED", "IN_PROGRESS"],
      priorities: ["HIGH", "CRITICAL"],
      overdue: true,
      clientId: "client-1",
      branchId: "branch-1",
      technicianId: "tech-1",
      serviceTypeId: "service-1",
      scheduledFrom: "2026-09-01T00:00:00.000-06:00",
      scheduledTo: "2026-09-30T23:59:59.999-06:00",
      page: 2,
      pageSize: 20,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    const query = new URL(String(url)).searchParams;
    expect(query.get("search")).toBe("GS-2026");
    expect(query.getAll("status")).toEqual(["ASSIGNED", "IN_PROGRESS"]);
    expect(query.getAll("priority")).toEqual(["HIGH", "CRITICAL"]);
    expect(query.get("overdue")).toBe("true");
    expect(query.get("clientId")).toBe("client-1");
    expect(query.get("branchId")).toBe("branch-1");
    expect(query.get("technicianId")).toBe("tech-1");
    expect(query.get("serviceTypeId")).toBe("service-1");
    expect(query.get("scheduledFrom")).toBe("2026-09-01T00:00:00.000-06:00");
    expect(query.get("scheduledTo")).toBe("2026-09-30T23:59:59.999-06:00");
    expect(query.get("page")).toBe("2");
    expect(query.get("pageSize")).toBe("20");
    expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it("reads encoded detail and paged history with an abort signal", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(orderDetail))
      .mockResolvedValueOnce(jsonResponse({
        items: [],
        pagination: { page: 3, pageSize: 20, totalItems: 0, totalPages: 0 },
      }));
    const controller = new AbortController();
    const api = createOrdersApi();

    await api.detail("order/id con espacio", controller.signal);
    await api.history("order/id con espacio", 3, controller.signal);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/orders/order%2Fid%20con%20espacio"),
      expect.objectContaining({ signal: controller.signal, credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/orders/order%2Fid%20con%20espacio/history?page=3&pageSize=20"),
      expect.objectContaining({ signal: controller.signal, credentials: "include" }),
    );
  });

  it.each<{
    name: string;
    method: "POST" | "PATCH" | "DELETE";
    path: string;
    body: unknown;
    invoke: () => Promise<unknown>;
  }>([
    {
      name: "crear",
      method: "POST",
      path: "/orders",
      body: { branchId: "branch-1", serviceTypeId: "service-1", priority: "HIGH", reportedProblem: "Sin red" },
      invoke: () => createOrdersApi().create({ branchId: "branch-1", serviceTypeId: "service-1", priority: "HIGH", reportedProblem: "Sin red" }),
    },
    {
      name: "editar",
      method: "PATCH",
      path: "/orders/order%2Fid",
      body: { version: 4, priority: "CRITICAL" },
      invoke: () => createOrdersApi().update("order/id", { version: 4, priority: "CRITICAL" }),
    },
    {
      name: "asignar",
      method: "POST",
      path: "/orders/order%2Fid/assignments",
      body: { version: 4, technicianId: "tech-1", role: "PRIMARY" },
      invoke: () => createOrdersApi().assign("order/id", { version: 4, technicianId: "tech-1", role: "PRIMARY" }),
    },
    {
      name: "retirar asignación",
      method: "DELETE",
      path: "/orders/order%2Fid/assignments/tech%2Fid",
      body: { version: 4, reason: "Reasignación" },
      invoke: () => createOrdersApi().unassign("order/id", "tech/id", { version: 4, reason: "Reasignación" }),
    },
    {
      name: "salir en ruta",
      method: "POST",
      path: "/orders/order%2Fid/on-route",
      body: { version: 4 },
      invoke: () => createOrdersApi().onRoute("order/id", { version: 4 }),
    },
    {
      name: "iniciar",
      method: "POST",
      path: "/orders/order%2Fid/start",
      body: { version: 4 },
      invoke: () => createOrdersApi().start("order/id", { version: 4 }),
    },
    {
      name: "pausar",
      method: "POST",
      path: "/orders/order%2Fid/pause",
      body: { version: 4, comment: "Esperando acceso" },
      invoke: () => createOrdersApi().pause("order/id", { version: 4, comment: "Esperando acceso" }),
    },
    {
      name: "reanudar",
      method: "POST",
      path: "/orders/order%2Fid/resume",
      body: { version: 4 },
      invoke: () => createOrdersApi().resume("order/id", { version: 4 }),
    },
    {
      name: "finalizar",
      method: "POST",
      path: "/orders/order%2Fid/complete",
      body: { version: 4, diagnosis: "Cable dañado", result: "Cable sustituido" },
      invoke: () => createOrdersApi().complete("order/id", { version: 4, diagnosis: "Cable dañado", result: "Cable sustituido" }),
    },
    {
      name: "cancelar",
      method: "POST",
      path: "/orders/order%2Fid/cancel",
      body: { version: 4, cancellationReason: "Solicitud retirada" },
      invoke: () => createOrdersApi().cancel("order/id", { version: 4, cancellationReason: "Solicitud retirada" }),
    },
    {
      name: "ajustar",
      method: "POST",
      path: "/orders/order%2Fid/adjustments",
      body: { version: 4, reason: "Corrección aprobada", result: "Resultado verificado" },
      invoke: () => createOrdersApi().adjust("order/id", { version: 4, reason: "Corrección aprobada", result: "Resultado verificado" }),
    },
    {
      name: "agregar material",
      method: "POST",
      path: "/orders/order%2Fid/materials",
      body: { version: 4, materialId: "material-1", quantity: "2.000" },
      invoke: () => createOrdersApi().addMaterial("order/id", { version: 4, materialId: "material-1", quantity: "2.000" }),
    },
    {
      name: "editar material",
      method: "PATCH",
      path: "/orders/order%2Fid/materials/usage%2Fid",
      body: { version: 4, quantity: "3.000" },
      invoke: () => createOrdersApi().updateMaterial("order/id", "usage/id", { version: 4, quantity: "3.000" }),
    },
    {
      name: "retirar material",
      method: "DELETE",
      path: "/orders/order%2Fid/materials/usage%2Fid",
      body: { version: 4 },
      invoke: () => createOrdersApi().removeMaterial("order/id", "usage/id", { version: 4 }),
    },
  ])("sends exact route, method and body to $name", async ({ method, path, body, invoke }) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(orderDetail));

    await expect(invoke()).resolves.toEqual(orderDetail);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(path),
      expect.objectContaining({
        method,
        credentials: "include",
        body: JSON.stringify(body),
      }),
    );
  });
});
