import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./layouts/AppShell";
import type { ActivityDetail, ActivityPage, ActivityType } from "./models/activity";
import type { AuthUser } from "./models/auth";
import { renderWithAuth } from "./test/auth-test-utils";

const type: ActivityType = { id: "type-1", code: "SUP", name: "Soporte", description: null, displayOrder: 1 };
const technician = { id: "tech-1", code: "TEC-001", fullName: "Ana López" };

function activity(description: string): ActivityDetail {
  return {
    id: "activity-1",
    branch: { id: "branch-1", code: "TGU-01", name: "Centro", client: { id: "client-1", code: "CLI-001", tradeName: "Cliente Demo" } },
    order: { id: "order-1", orderNumber: "OT-2026-0042" },
    activityType: type,
    status: "PENDING",
    description,
    result: null,
    responsible: technician,
    startedAt: null,
    endedAt: null,
    pausedMinutes: 0,
    productiveMinutes: null,
    createdAt: "2026-08-26T13:00:00.000Z",
    updatedAt: "2026-08-26T13:00:00.000Z",
    version: 1,
    observations: null,
    team: [{ technician, role: "RESPONSIBLE", participationPercentage: "100.00", startedAt: null, endedAt: null }],
    pauses: [],
  };
}

function response<T>(data: T) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockActivityJourneyFetch() {
  let current = activity("Sincronizar router de bodega");
  const calls: string[] = [];
  vi.mocked(fetch).mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    if (method === "GET" && path === "/activity-types") return response([type]);
    if (method === "GET" && path === "/orders") return response({ items: [{ id: "order-1", orderNumber: "OT-2026-0042", client: { tradeName: "Cliente Demo" }, branch: { name: "Centro" }, status: "ASSIGNED" }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    if (method === "GET" && path === "/activities") {
      const page: ActivityPage = { items: [current], pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 } };
      return response(page);
    }
    if (method === "POST" && path === "/activities") {
      const body = JSON.parse(String(init?.body)) as { description: string };
      current = activity(body.description);
      return response(current);
    }
    if (method === "GET" && path === `/activities/${current.id}`) return response(current);
    if (method === "POST" && path.endsWith("/start")) current = { ...current, status: "IN_PROGRESS", startedAt: "2026-08-26T14:00:00.000Z", version: current.version + 1 };
    else if (method === "POST" && path.endsWith("/pause")) current = { ...current, status: "PAUSED", version: current.version + 1, pauses: [{ id: "pause-1", startedAt: "2026-08-26T14:10:00.000Z", endedAt: null, reason: "Esperando acceso" }] };
    else if (method === "POST" && path.endsWith("/resume")) current = { ...current, status: "IN_PROGRESS", version: current.version + 1, pauses: current.pauses.map((pause) => ({ ...pause, endedAt: "2026-08-26T14:20:00.000Z" })) };
    else if (method === "POST" && path.endsWith("/complete")) current = { ...current, status: "COMPLETED", result: "Enlace estable", endedAt: "2026-08-26T15:00:00.000Z", productiveMinutes: 50, version: current.version + 1 };
    else throw new Error(`Ruta no simulada: ${method} ${path}`);
    return response(current);
  });
  return calls;
}

const technicianUser: AuthUser = {
  id: "user-1", email: "ana@geek.test", displayName: "Ana López", mustChangePassword: false,
  technicianId: "tech-1", roles: ["TECHNICIAN"],
  permissions: ["KPI_VIEW_OWN", "ACTIVITIES_CREATE_OWN", "ACTIVITIES_OPERATE_OWN"],
};

afterEach(() => {
  vi.mocked(fetch).mockReset();
  window.history.replaceState({}, "", "/resumen");
});

describe("flujo persistente de actividades", () => {
  it("crea, inicia, pausa, reanuda y completa desde AppShell", async () => {
    const calls = mockActivityJourneyFetch();
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/actividades");
    renderWithAuth(<AppShell />, { user: technicianUser });

    expect(await screen.findByText("Sincronizar router de bodega")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nueva actividad" }));
    const orderSearch = await screen.findByRole("combobox", { name: "Orden" });
    await user.type(orderSearch, "OT-2026");
    await user.click(await screen.findByRole("option", { name: "OT-2026-0042 · Cliente Demo · Centro" }));
    await user.selectOptions(screen.getByLabelText("Tipo de actividad"), "type-1");
    await user.type(screen.getByLabelText("Descripción"), "Revisar enlace principal");
    await user.click(screen.getByRole("button", { name: "Crear actividad" }));

    await user.click(await screen.findByRole("button", { name: "Ver actividad Revisar enlace principal" }));
    const detail = await screen.findByRole("dialog", { name: "Detalle de actividad" });
    await user.click(within(detail).getByRole("button", { name: "Iniciar" }));
    await user.click(screen.getByRole("button", { name: "Iniciar actividad" }));
    await user.click(await within(detail).findByRole("button", { name: "Pausar" }));
    await user.type(screen.getByLabelText("Motivo"), "Esperando acceso");
    await user.click(screen.getByRole("button", { name: "Confirmar pausa" }));
    await user.click(await within(detail).findByRole("button", { name: "Reanudar" }));
    await user.click(screen.getByRole("button", { name: "Reanudar actividad" }));
    await user.click(await within(detail).findByRole("button", { name: "Completar" }));
    await user.type(screen.getByLabelText("Resultado"), "Enlace estable");
    await user.click(screen.getByRole("button", { name: "Completar actividad" }));

    expect(await within(detail).findByText("Completada")).toBeInTheDocument();
    expect(calls).toEqual(expect.arrayContaining([
      "POST /activities", "POST /activities/activity-1/start", "POST /activities/activity-1/pause",
      "POST /activities/activity-1/resume", "POST /activities/activity-1/complete",
    ]));
  });
});
