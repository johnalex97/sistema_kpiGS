import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivityApi } from "./activities";
import type {
  ActivityDetail,
  ActivityPage,
  ActivityType,
  AdjustActivityInput,
  CancelActivityInput,
  CompleteActivityInput,
  CreateActivityInput,
  ManualActivityInput,
  PauseActivityInput,
  UpdateActivityInput,
} from "../models/activity";

function jsonResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const activityType: ActivityType = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "SUPPORT",
  name: "Soporte",
  description: "Atención técnica",
  displayOrder: 1,
};

const activityDetail: ActivityDetail = {
  id: "22222222-2222-4222-8222-222222222222",
  branch: {
    id: "33333333-3333-4333-8333-333333333333",
    code: "TGU-01",
    name: "Centro",
    client: {
      id: "44444444-4444-4444-8444-444444444444",
      code: "CLI-001",
      tradeName: "Cliente Demo",
    },
  },
  order: {
    id: "55555555-5555-4555-8555-555555555555",
    orderNumber: "OT-2026-0042",
  },
  activityType,
  status: "PENDING",
  description: "Revisar router central",
  result: null,
  responsible: {
    id: "66666666-6666-4666-8666-666666666666",
    code: "TEC-001",
    fullName: "Ana López",
  },
  startedAt: null,
  endedAt: null,
  pausedMinutes: 0,
  productiveMinutes: null,
  createdAt: "2026-08-26T13:00:00.000Z",
  updatedAt: "2026-08-26T13:00:00.000Z",
  version: 4,
  observations: null,
  team: [{
    technician: {
      id: "66666666-6666-4666-8666-666666666666",
      code: "TEC-001",
      fullName: "Ana López",
    },
    role: "RESPONSIBLE",
    participationPercentage: "100.00",
    startedAt: null,
    endedAt: null,
  }],
  pauses: [],
};

const emptyPage: ActivityPage = {
  items: [],
  pagination: { page: 2, pageSize: 25, totalItems: 0, totalPages: 0 },
};

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("createActivityApi", () => {
  it("serializa estados repetidos, fechas y paginación", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(emptyPage));

    await createActivityApi().list({
      status: ["PENDING", "IN_PROGRESS"],
      search: "router central",
      startedFrom: "2026-08-26T06:00:00.000-06:00",
      page: 2,
      pageSize: 25,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("status=PENDING");
    expect(String(url)).toContain("status=IN_PROGRESS");
    expect(String(url)).toContain("search=router+central");
    expect(String(url)).toContain("startedFrom=2026-08-26T06%3A00%3A00.000-06%3A00");
    expect(String(url)).toContain("page=2&pageSize=25");
    expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it("consulta catálogo y detalle sin alterar identificadores", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([activityType]))
      .mockResolvedValueOnce(jsonResponse(activityDetail));
    const api = createActivityApi();

    await expect(api.listTypes()).resolves.toEqual([activityType]);
    await expect(api.detail(activityDetail.id)).resolves.toEqual(activityDetail);

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("/activity-types");
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toContain(`/activities/${activityDetail.id}`);
  });

  it.each<{
    name: string;
    path: string;
    method: string;
    body: unknown;
    invoke: () => Promise<ActivityDetail>;
  }>([
    {
      name: "crear una actividad programada",
      path: "/activities",
      method: "POST",
      body: {
        orderId: activityDetail.order!.id,
        activityTypeId: activityType.id,
        description: "Revisar router central",
      } satisfies CreateActivityInput,
      invoke: () => createActivityApi().create({
        orderId: activityDetail.order!.id,
        activityTypeId: activityType.id,
        description: "Revisar router central",
      }),
    },
    {
      name: "crear una actividad manual",
      path: "/activities/manual",
      method: "POST",
      body: {
        branchId: activityDetail.branch.id,
        activityTypeId: activityType.id,
        description: "Entrega documentada",
        startedAt: "2026-08-26T08:00:00.000-06:00",
        endedAt: "2026-08-26T09:00:00.000-06:00",
        result: "Entregado",
        justification: "Registro al finalizar la visita",
      } satisfies ManualActivityInput,
      invoke: () => createActivityApi().createManual({
        branchId: activityDetail.branch.id,
        activityTypeId: activityType.id,
        description: "Entrega documentada",
        startedAt: "2026-08-26T08:00:00.000-06:00",
        endedAt: "2026-08-26T09:00:00.000-06:00",
        result: "Entregado",
        justification: "Registro al finalizar la visita",
      }),
    },
    {
      name: "editar una actividad pendiente",
      path: `/activities/${activityDetail.id}`,
      method: "PATCH",
      body: { version: 4, description: "Revisar router de bodega" } satisfies UpdateActivityInput,
      invoke: () => createActivityApi().update(activityDetail.id, { version: 4, description: "Revisar router de bodega" }),
    },
    {
      name: "reemplazar el equipo",
      path: `/activities/${activityDetail.id}/team`,
      method: "PUT",
      body: {
        version: 4,
        team: [{ technicianId: activityDetail.responsible!.id, role: "RESPONSIBLE", participationPercentage: "100.00" }],
      },
      invoke: () => createActivityApi().replaceTeam(activityDetail.id, 4, [{
        technicianId: activityDetail.responsible!.id,
        role: "RESPONSIBLE",
        participationPercentage: "100.00",
      }]),
    },
    {
      name: "iniciar",
      path: `/activities/${activityDetail.id}/start`,
      method: "POST",
      body: { version: 4 },
      invoke: () => createActivityApi().start(activityDetail.id, 4),
    },
    {
      name: "pausar con motivo",
      path: `/activities/${activityDetail.id}/pause`,
      method: "POST",
      body: { version: 4, reason: "Almuerzo" } satisfies PauseActivityInput,
      invoke: () => createActivityApi().pause(activityDetail.id, { version: 4, reason: "Almuerzo" }),
    },
    {
      name: "reanudar",
      path: `/activities/${activityDetail.id}/resume`,
      method: "POST",
      body: { version: 4 },
      invoke: () => createActivityApi().resume(activityDetail.id, 4),
    },
    {
      name: "completar con resultado",
      path: `/activities/${activityDetail.id}/complete`,
      method: "POST",
      body: { version: 4, result: "Operativo" } satisfies CompleteActivityInput,
      invoke: () => createActivityApi().complete(activityDetail.id, { version: 4, result: "Operativo" }),
    },
    {
      name: "cancelar con motivo",
      path: `/activities/${activityDetail.id}/cancel`,
      method: "POST",
      body: { version: 4, reason: "Cliente reprogramó" } satisfies CancelActivityInput,
      invoke: () => createActivityApi().cancel(activityDetail.id, { version: 4, reason: "Cliente reprogramó" }),
    },
    {
      name: "ajustar una actividad completada",
      path: `/activities/${activityDetail.id}/adjustments`,
      method: "POST",
      body: { version: 4, reason: "Corrección autorizada", result: "Operativo estable" } satisfies AdjustActivityInput,
      invoke: () => createActivityApi().adjust(activityDetail.id, {
        version: 4,
        reason: "Corrección autorizada",
        result: "Operativo estable",
      }),
    },
  ])("envía método, ruta y cuerpo exactos al $name", async ({ path, method, body, invoke }) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(activityDetail));

    await expect(invoke()).resolves.toEqual(activityDetail);

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.objectContaining({
      method,
      credentials: "include",
      body: JSON.stringify(body),
    }));
  });

  it("codifica identificadores antes de construir las rutas", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(activityDetail));

    await createActivityApi().detail("actividad/con espacios");

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("/activities/actividad%2Fcon%20espacios");
  });
});
