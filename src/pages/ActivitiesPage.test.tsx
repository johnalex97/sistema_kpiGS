import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import type { ActivitiesWorkspace } from "../hooks/useActivitiesWorkspace";
import type { ActivityDetail, ActivityPage, ActivitySummary } from "../models/activity";
import { ActivitiesPage } from "./ActivitiesPage";

const summary: ActivitySummary = {
  id: "11111111-1111-4111-8111-111111111111",
  branch: {
    id: "22222222-2222-4222-8222-222222222222",
    code: "TGU-01",
    name: "Centro",
    client: { id: "33333333-3333-4333-8333-333333333333", code: "CLI-001", tradeName: "Cliente Demo" },
  },
  order: { id: "44444444-4444-4444-8444-444444444444", orderNumber: "OT-2026-0042" },
  activityType: { id: "55555555-5555-4555-8555-555555555555", code: "SUP", name: "Soporte", description: null, displayOrder: 1 },
  status: "PENDING",
  description: "Revisar router central",
  result: null,
  responsible: { id: "66666666-6666-4666-8666-666666666666", code: "TEC-001", fullName: "Ana López" },
  startedAt: null,
  endedAt: null,
  pausedMinutes: 0,
  productiveMinutes: null,
  createdAt: "2026-08-26T13:00:00.000Z",
  updatedAt: "2026-08-26T13:00:00.000Z",
  version: 1,
};

const detail: ActivityDetail = {
  ...summary,
  observations: "Validar señal al finalizar",
  team: [{
    technician: summary.responsible!,
    role: "RESPONSIBLE",
    participationPercentage: "100.00",
    startedAt: null,
    endedAt: null,
  }],
  pauses: [{
    id: "77777777-7777-4777-8777-777777777777",
    startedAt: "2026-08-26T14:00:00.000Z",
    endedAt: "2026-08-26T14:10:00.000Z",
    reason: "Esperando acceso",
  }],
};

const page: ActivityPage = {
  items: [summary],
  pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 2 },
};

function workspace(overrides: Partial<ActivitiesWorkspace> = {}): ActivitiesWorkspace {
  return {
    query: { view: "open", filters: { status: ["PENDING", "IN_PROGRESS", "PAUSED"], page: 1, pageSize: 25 } },
    page,
    selected: null,
    listState: "ready",
    stale: false,
    listError: null,
    detailState: "idle",
    mutation: null,
    setView: vi.fn(),
    setFilters: vi.fn(),
    retryList: vi.fn(),
    select: vi.fn(),
    closeDetail: vi.fn(),
    refresh: vi.fn(async () => undefined),
    createActivity: vi.fn(async () => true),
    updateActivity: vi.fn(async () => true),
    replaceActivityTeam: vi.fn(async () => true),
    runAction: vi.fn(async () => true),
    clearMutationError: vi.fn(),
    ...overrides,
  };
}

function authValue(permissions: string[]): AuthContextValue {
  return {
    status: "authenticated",
    user: {
      id: "user-1",
      email: "user@geek.test",
      displayName: "Usuario",
      mustChangePassword: false,
      technicianId: "66666666-6666-4666-8666-666666666666",
      roles: ["TECHNICIAN"],
      permissions,
    },
    notice: null,
    returnPath: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
    hasPermission: (...required) => required.some((permission) => permissions.includes(permission)),
  };
}

function pageView(current: ActivitiesWorkspace, permissions = ["ACTIVITIES_VIEW_ALL"]) {
  return (
    <AuthContext.Provider value={authValue(permissions)}>
      <ActivitiesPage search="" workspace={current} />
    </AuthContext.Provider>
  );
}

describe("ActivitiesPage", () => {
  it("muestra carga, vacío, error recuperable y datos obsoletos", () => {
    const loading = workspace({ page: null, listState: "loading" });
    const empty = workspace({ page: { items: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } }, listState: "empty" });
    const error = workspace({ page: null, listState: "error", listError: "Sin conexión" });
    const stale = workspace({ stale: true, listError: "Sin conexión" });
    const view = render(pageView(loading));

    expect(screen.getByRole("status")).toHaveTextContent("Cargando actividades");
    view.rerender(pageView(empty));
    expect(screen.getByText("No hay actividades para estos filtros")).toBeInTheDocument();
    view.rerender(pageView(error));
    expect(screen.getByRole("alert")).toHaveTextContent("Sin conexión");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    view.rerender(pageView(stale));
    expect(screen.getByRole("status")).toHaveTextContent("Los datos pueden estar desactualizados");
  });

  it("cambia vista, estado y página mediante el workspace", async () => {
    const user = userEvent.setup();
    const current = workspace();
    render(pageView(current));

    await user.click(screen.getByRole("tab", { name: "Historial" }));
    expect(current.setView).toHaveBeenCalledWith("history");
    await user.selectOptions(screen.getByLabelText("Estado"), "PAUSED");
    expect(current.setFilters).toHaveBeenCalledWith({ status: ["PAUSED"] });
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(current.setFilters).toHaveBeenCalledWith({ page: 2 });
  });

  it("abre el detalle, muestra equipo y pausas, cierra con Escape y restaura foco", async () => {
    const user = userEvent.setup();
    const current = workspace();
    const view = render(pageView(current, ["ACTIVITIES_MANAGE"]));
    const trigger = screen.getByRole("button", { name: "Ver actividad Revisar router central" });

    await user.click(trigger);
    expect(current.select).toHaveBeenCalledWith(summary.id);
    view.rerender(pageView(workspace({ selected: detail, detailState: "ready", closeDetail: current.closeDetail }), ["ACTIVITIES_MANAGE"]));
    const dialog = screen.getByRole("dialog", { name: "Detalle de actividad" });
    expect(within(dialog).getByText("Ana López")).toBeInTheDocument();
    expect(within(dialog).getByText("Esperando acceso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar actividad" })).toBeInTheDocument();

    await act(async () => { await user.keyboard("{Escape}"); });
    expect(current.closeDetail).toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("oculta ajustes administrativos a un técnico operativo", () => {
    const completed = { ...detail, status: "COMPLETED" as const, result: "Enlace estable", endedAt: "2026-08-26T15:00:00.000Z" };
    render(pageView(workspace({ selected: completed, detailState: "ready" }), ["ACTIVITIES_OPERATE_OWN"]));

    expect(screen.queryByRole("button", { name: "Ajustar actividad" })).not.toBeInTheDocument();
    expect(screen.getByText("Enlace estable")).toBeInTheDocument();
  });

  it("confirma una accion y la envia al workspace una sola vez", async () => {
    const user = userEvent.setup();
    const current = workspace({ selected: detail, detailState: "ready" });
    render(pageView(current, ["ACTIVITIES_OPERATE_OWN"]));

    await user.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(screen.getByRole("dialog", { name: "Iniciar actividad" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Iniciar actividad" }));

    expect(current.runAction).toHaveBeenCalledTimes(1);
    expect(current.runAction).toHaveBeenCalledWith({ type: "start" });
  });

  it.each([
    ["IN_PROGRESS", ["Pausar", "Completar"], ["Iniciar", "Reanudar", "Ajustar actividad"]],
    ["PAUSED", ["Reanudar", "Completar"], ["Iniciar", "Pausar", "Ajustar actividad"]],
    ["COMPLETED", ["Ajustar actividad"], ["Iniciar", "Pausar", "Reanudar", "Completar"]],
    ["CANCELLED", [], ["Iniciar", "Pausar", "Reanudar", "Completar", "Ajustar actividad"]],
  ] as const)("respeta las acciones disponibles en estado %s", (status, visible, hidden) => {
    render(pageView(workspace({ selected: { ...detail, status }, detailState: "ready" }), ["ACTIVITIES_MANAGE"]));
    visible.forEach((name) => expect(screen.getByRole("button", { name })).toBeInTheDocument());
    hidden.forEach((name) => expect(screen.queryByRole("button", { name })).not.toBeInTheDocument());
  });
});
