import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KpiApi } from "../api/kpis";
import type { TechnicianApi } from "../api/technicians";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import type { TechniciansWorkspace } from "../hooks/useTechniciansWorkspace";
import type { KpiDashboardItem } from "../models/kpi";
import type { Technician, TechnicianPage } from "../models/technician";
import { TechniciansPage } from "./TechniciansPage";

const technician: Technician = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "TEC-001",
  fullName: "Ana López",
  specialty: "Redes",
  workPhone: null,
  workEmail: "ana@geek.test",
  status: "AVAILABLE",
  hiredOn: "2025-02-03",
  leftOn: null,
  user: null,
  createdAt: "2025-02-03T14:00:00.000Z",
  updatedAt: "2026-08-27T15:30:00.000Z",
  version: 4,
};

const kpi: KpiDashboardItem = {
  technicianId: technician.id,
  code: technician.code,
  fullName: technician.fullName,
  completedCredits: "8.5",
  appliedTarget: 10,
  registeredMinutes: 420,
  productiveMinutes: 365,
  productivityScore: "92.00",
  complianceScore: null,
  efficiencyScore: "86.90",
  qualityScore: "91.10",
  overallScore: "91.25",
};

const page: TechnicianPage = {
  items: [technician],
  pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2 },
};

function workspace(overrides: Partial<TechniciansWorkspace> = {}): TechniciansWorkspace {
  return {
    query: { filters: { page: 1, pageSize: 20, includeInactive: false } },
    page,
    selected: null,
    kpis: new Map([[technician.id, kpi]]),
    kpiState: "ready",
    listState: "ready",
    stale: false,
    listError: null,
    detailState: "idle",
    mutation: null,
    setFilters: vi.fn(),
    retryList: vi.fn(),
    select: vi.fn(),
    closeDetail: vi.fn(),
    createTechnician: vi.fn(async () => true),
    updateTechnician: vi.fn(async () => true),
    changeStatus: vi.fn(async () => true),
    deactivate: vi.fn(async () => true),
    reactivate: vi.fn(async () => true),
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
      technicianId: null,
      roles: ["ADMIN"],
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

function pageView(current: TechniciansWorkspace, permissions = ["TECHNICIANS_VIEW", "KPI_VIEW_ALL"]) {
  return <AuthContext.Provider value={authValue(permissions)}><TechniciansPage search="" workspace={current} /></AuthContext.Provider>;
}

describe("TechniciansPage", () => {
  it("ofrece el ciclo laboral correcto según estado y permiso", () => {
    const active = workspace({ selected: technician, detailState: "ready" });
    const view = render(pageView(active, ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivar" })).not.toBeInTheDocument();

    view.rerender(pageView(workspace({ selected: { ...technician, status: "INACTIVE" }, detailState: "ready" }), ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));
    expect(screen.getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();

    view.rerender(pageView(workspace({ selected: technician, detailState: "ready" }), ["TECHNICIANS_VIEW"]));
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).not.toBeInTheDocument();
  });

  it("mantiene el diálogo y sus valores al recuperar un conflicto de versión", async () => {
    const user = userEvent.setup();
    const current = workspace({ selected: technician, detailState: "ready", changeStatus: vi.fn(async () => false) });
    const view = render(pageView(current, ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));

    await user.click(screen.getByRole("button", { name: "Cambiar estado" }));
    await user.selectOptions(screen.getByLabelText("Nuevo estado"), "ON_ROUTE");
    await user.click(screen.getByRole("button", { name: "Guardar estado" }));
    expect(current.changeStatus).toHaveBeenCalledWith("ON_ROUTE");

    view.rerender(pageView(workspace({
      selected: { ...technician, version: 5 },
      detailState: "ready",
      changeStatus: current.changeStatus,
      mutation: { name: "status", pending: false, conflict: true, error: "El registro cambió; revisa la versión actual." },
    }), ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));
    expect(screen.getByRole("dialog", { name: "Cambiar estado" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nuevo estado")).toHaveValue("ON_ROUTE");
    expect(screen.getByRole("alert")).toHaveTextContent("registro cambió");
    expect(screen.getByText("Ficha v5")).toBeInTheDocument();
  });

  it("envía desactivación y reactivación por el workspace", async () => {
    const user = userEvent.setup();
    const active = workspace({ selected: technician, detailState: "ready" });
    const view = render(pageView(active, ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));

    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    await user.type(screen.getByLabelText("Motivo"), "Finalización autorizada por operaciones");
    await user.click(screen.getByRole("button", { name: "Desactivar técnico" }));
    expect(active.deactivate).toHaveBeenCalledWith({ reason: "Finalización autorizada por operaciones" });

    const inactive = workspace({ selected: { ...technician, status: "INACTIVE" }, detailState: "ready" });
    view.rerender(pageView(inactive, ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));
    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    await user.type(screen.getByLabelText("Motivo"), "Retorno autorizado por operaciones");
    await user.click(screen.getByRole("button", { name: "Reactivar técnico" }));
    expect(inactive.reactivate).toHaveBeenCalledWith("Retorno autorizado por operaciones");
  });

  it("muestra crear y editar sólo con permiso y cierra únicamente tras éxito", async () => {
    const user = userEvent.setup();
    const current = workspace({ selected: technician, detailState: "ready" });
    const eligibleApi = {
      list: vi.fn(), detail: vi.fn(), eligibleUsers: vi.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })),
      create: vi.fn(), update: vi.fn(), changeStatus: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn(),
    } as unknown as TechnicianApi;
    const view = render(<AuthContext.Provider value={authValue(["TECHNICIANS_VIEW"])}><TechniciansPage workspace={current} api={eligibleApi} /></AuthContext.Provider>);
    expect(screen.queryByRole("button", { name: "Nuevo técnico" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();

    view.rerender(<AuthContext.Provider value={authValue(["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"])}><TechniciansPage workspace={current} api={eligibleApi} /></AuthContext.Provider>);
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("dialog", { name: "Editar técnico" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(current.updateTechnician).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Editar técnico" })).not.toBeInTheDocument();

    current.createTechnician = vi.fn(async () => false);
    await user.click(screen.getByRole("button", { name: "Nuevo técnico" }));
    await user.type(screen.getByLabelText("Nombre completo"), "Carlos Mejía");
    await user.click(screen.getByRole("button", { name: "Crear técnico" }));
    expect(await screen.findByRole("dialog", { name: "Nuevo técnico" })).toBeInTheDocument();

    view.rerender(<AuthContext.Provider value={authValue(["TECHNICIANS_VIEW"])}><TechniciansPage workspace={current} api={eligibleApi} /></AuthContext.Provider>);
    expect(screen.queryByRole("dialog", { name: "Nuevo técnico" })).not.toBeInTheDocument();
  });

  it("cierra el detalle antes de abrir Nuevo técnico y un solo Escape cierra el único diálogo", async () => {
    const user = userEvent.setup();
    const current = workspace({ selected: technician, detailState: "ready" });
    render(pageView(current, ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));
    expect(screen.getByRole("dialog", { name: "Detalle del técnico" })).toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: "Nuevo técnico" });
    await user.click(createButton);
    expect(current.closeDetail).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Detalle del técnico" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nuevo técnico" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(current.closeDetail).toHaveBeenCalledOnce();
    expect(createButton).toHaveFocus();
  });

  it("mantiene formularios y acciones dentro de un backdrop de overlay", async () => {
    const user = userEvent.setup();
    const current = workspace({ selected: technician, detailState: "ready" });
    const view = render(pageView(current, ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));

    await user.click(screen.getByRole("button", { name: "Nuevo técnico" }));
    expect(screen.getByRole("dialog", { name: "Nuevo técnico" }).closest(".activity-form-backdrop")).toHaveClass("technician-form-backdrop");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    view.unmount();
    render(pageView(workspace({ selected: technician, detailState: "ready" }), ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));
    await user.click(screen.getByRole("button", { name: "Cambiar estado" }));
    expect(screen.getByRole("dialog", { name: "Cambiar estado" }).closest(".activity-form-backdrop")).toHaveClass("technician-action-backdrop");
  });

  it("restaura el foco a la acción exacta del detalle al cerrar overlays", async () => {
    const user = userEvent.setup();
    const current = workspace({ selected: technician, detailState: "ready" });
    render(pageView(current, ["TECHNICIANS_VIEW", "TECHNICIANS_MANAGE"]));

    const editButton = screen.getByRole("button", { name: "Editar" });
    await user.click(editButton);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus();

    const statusButton = screen.getByRole("button", { name: "Cambiar estado" });
    await user.click(statusButton);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Cambiar estado" })).toHaveFocus();
  });
  it("orienta durante carga, vacío, error recuperable y datos obsoletos", () => {
    const loading = workspace({ page: null, listState: "loading" });
    const empty = workspace({ page: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }, listState: "empty" });
    const error = workspace({ page: null, listState: "error", listError: "Sin conexión" });
    const stale = workspace({ stale: true, listError: "Sin conexión" });
    const view = render(pageView(loading));

    expect(screen.getByRole("status")).toHaveTextContent("Cargando técnicos");
    view.rerender(pageView(empty));
    expect(screen.getByText("No hay técnicos para estos filtros")).toBeInTheDocument();
    view.rerender(pageView(error));
    expect(screen.getByRole("alert")).toHaveTextContent("Sin conexión");
    view.rerender(pageView(stale));
    expect(screen.getByRole("status")).toHaveTextContent("Los datos pueden estar desactualizados");
  });

  it("anuncia la actualización sin ocultar la página ni los filtros conservados", () => {
    const refreshing = workspace({
      listState: "loading",
      query: { filters: { status: "ON_ROUTE", page: 2, pageSize: 20, includeInactive: true } },
    });

    render(pageView(refreshing));

    expect(screen.getByRole("status")).toHaveTextContent("Actualizando técnicos");
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado del técnico")).toHaveValue("ON_ROUTE");
    expect(screen.getByLabelText("Incluir técnicos inactivos")).toBeChecked();
  });

  it("aplica estado, inactivos y paginación mediante el workspace", async () => {
    const user = userEvent.setup();
    const current = workspace();
    render(pageView(current));

    await user.selectOptions(screen.getByLabelText("Estado del técnico"), "ON_ROUTE");
    expect(current.setFilters).toHaveBeenCalledWith({ status: "ON_ROUTE" });
    await user.click(screen.getByLabelText("Incluir técnicos inactivos"));
    expect(current.setFilters).toHaveBeenCalledWith({ includeInactive: true });
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(current.setFilters).toHaveBeenCalledWith({ page: 2 });
  });

  it("abre el detalle y oculta KPI sin permiso", async () => {
    const user = userEvent.setup();
    const current = workspace();
    const view = render(pageView(current, ["TECHNICIANS_VIEW"]));

    expect(screen.queryByRole("columnheader", { name: "KPI semanal" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver técnico Ana López" }));
    expect(current.select).toHaveBeenCalledWith(technician.id);
    view.rerender(pageView(workspace({ selected: technician, detailState: "ready", closeDetail: current.closeDetail }), ["TECHNICIANS_VIEW"]));
    expect(screen.getByRole("dialog", { name: "Detalle del técnico" })).toBeInTheDocument();
    expect(screen.queryByText("Productividad")).not.toBeInTheDocument();
  });

  it("permite reintentar un detalle fallido sin perder el técnico elegido", async () => {
    const user = userEvent.setup();
    const current = workspace();
    const view = render(pageView(current));

    await user.click(screen.getByRole("button", { name: "Ver técnico Ana López" }));
    view.rerender(pageView(workspace({ detailState: "error", select: current.select })));
    await user.click(screen.getByRole("button", { name: "Reintentar detalle" }));

    expect(current.select).toHaveBeenCalledTimes(2);
    expect(current.select).toHaveBeenLastCalledWith(technician.id);
  });

  it("conecta APIs inyectadas y consulta el KPI de la semana de Tegucigalpa", async () => {
    window.history.replaceState({}, "", "/tecnicos");
    const api = {
      list: vi.fn(async () => ({ items: [technician], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })),
      detail: vi.fn(), eligibleUsers: vi.fn(), create: vi.fn(), update: vi.fn(), changeStatus: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn(),
    } as unknown as TechnicianApi;
    const kpiApi = {
      getDashboard: vi.fn(async () => ({ status: "PREVIEW", items: [kpi], warnings: [], capabilities: {} })),
    } as unknown as KpiApi;

    render(<AuthContext.Provider value={authValue(["TECHNICIANS_VIEW", "KPI_VIEW_ALL"])}><TechniciansPage search="Ana" api={api} kpiApi={kpiApi} now={() => new Date("2026-08-27T12:00:00-06:00")} /></AuthContext.Provider>);

    await waitFor(() => expect(screen.getByText("Ana López")).toBeInTheDocument());
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ search: "Ana", page: 1, pageSize: 20 }), expect.any(AbortSignal));
    expect(kpiApi.getDashboard).toHaveBeenCalledWith({ periodStart: "2026-08-24", granularity: "WEEK" }, expect.any(AbortSignal));
  });
});
