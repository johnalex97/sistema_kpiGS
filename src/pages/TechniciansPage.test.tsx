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
