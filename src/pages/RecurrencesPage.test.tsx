import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import type { RecurrencesWorkspace } from "../hooks/useRecurrencesWorkspace";
import type { RecurrenceDetail, RecurrenceSummary } from "../models/recurrence";
import { RecurrencesPage } from "./RecurrencesPage";

const item: RecurrenceSummary = {
  id: "rec-1",
  recurrenceNumber: "RI-2026-0001",
  status: "ANALYSIS",
  impact: "HIGH",
  responsibility: "TECHNICAL_WORK",
  detectedProblem: "Pérdida intermitente de conexión",
  detectedAt: "2026-08-28T15:00:00.000Z",
  originalOrder: { id: "order-1", orderNumber: "OT-1831" },
  cause: { id: "cause-1", code: "CABLE", name: "Terminación deficiente" },
  additionalMinutes: 95,
  estimatedCost: "1500.00",
  visitCount: 2,
  noteCount: 0,
  createdAt: "2026-08-28T15:00:00.000Z",
  updatedAt: "2026-08-30T19:15:00.000Z",
  version: 4,
};

const selected: RecurrenceDetail = {
  ...item,
  analysis: null,
  correctiveAction: null,
  preventiveAction: null,
  observations: null,
  ageOverrideReason: null,
  dismissalReason: null,
  dismissedAt: null,
  closedAt: null,
  visits: [],
  technicians: [],
  notes: [],
  evidences: [],
};

function workspace(overrides: Partial<RecurrencesWorkspace> = {}): RecurrencesWorkspace {
  return {
    query: { filters: { page: 1, pageSize: 20 }, selectedId: null },
    catalog: {
      causes: [],
      states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
      impacts: ["LOW", "MEDIUM", "HIGH"],
      responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
      transitions: [],
    },
    page: { items: [item], pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2 } },
    summary: {
      totalCases: 7,
      openCases: 3,
      highImpactCases: 2,
      additionalVisits: 5,
      additionalMinutes: 375,
      estimatedCost: "6240.50",
      completedBaseOrders: 81,
      recurrenceRate: "8.60",
    },
    selected: null,
    catalogState: "ready",
    listState: "ready",
    summaryState: "ready",
    detailState: "idle",
    listStale: false,
    mutation: null,
    capabilities: {
      canReport: false,
      canReview: false,
      canViewAll: true,
      canUploadEvidence: false,
      canViewEvidence: false,
      canManageEvidence: false,
      lookupCapabilities: { orders: false, technicians: false, clients: false, branches: false },
    },
    actionMode: null,
    lookupApi: {} as RecurrencesWorkspace["lookupApi"],
    evidenceApi: {} as RecurrencesWorkspace["evidenceApi"],
    setFilters: vi.fn(),
    select: vi.fn(),
    closeDetail: vi.fn(),
    retryCatalog: vi.fn(),
    retryList: vi.fn(),
    retrySummary: vi.fn(),
    retryDetail: vi.fn(),
    setActionMode: vi.fn(),
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
      roles: ["SUPERVISOR"],
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

function view(current: RecurrencesWorkspace, permissions = ["RECURRENCES_VIEW_ALL"]) {
  return <AuthContext.Provider value={authValue(permissions)}><RecurrencesPage search="" workspace={current} /></AuthContext.Provider>;
}

describe("RecurrencesPage", () => {
  it("consulta casos, aplica filtros, pagina y abre el detalle por el workspace", async () => {
    const user = userEvent.setup();
    const current = workspace();
    const rendered = render(view(current));

    expect(screen.getByText("8.60%")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Estado"), "ANALYSIS");
    expect(current.setFilters).toHaveBeenCalledWith({ status: ["ANALYSIS"], page: 1 });
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(current.setFilters).toHaveBeenCalledWith({ page: 2 });
    const trigger = screen.getByRole("button", { name: "Ver RI-2026-0001" });
    await user.click(trigger);
    expect(current.select).toHaveBeenCalledWith("rec-1");

    rendered.rerender(view(workspace({ selected, detailState: "ready", closeDetail: current.closeDetail })));
    await user.click(screen.getByRole("button", { name: "Cerrar detalle" }));
    expect(current.closeDetail).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it("orienta durante carga, vacío, error recuperable y datos obsoletos", async () => {
    const user = userEvent.setup();
    const loading = workspace({ page: null, summary: null, listState: "loading", summaryState: "loading" });
    const empty = workspace({ page: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }, listState: "empty" });
    const error = workspace({ page: null, listState: "error" });
    const stale = workspace({ listStale: true });
    const rendered = render(view(loading));

    expect(screen.getByRole("status", { name: "Cargando casos" })).toBeInTheDocument();
    rendered.rerender(view(empty));
    expect(screen.getByText("No hay reincidencias para estos filtros")).toBeInTheDocument();
    rendered.rerender(view(error));
    expect(screen.getByRole("alert")).toHaveTextContent("No fue posible cargar los casos");
    await user.click(screen.getByRole("button", { name: "Reintentar casos" }));
    expect(error.retryList).toHaveBeenCalledTimes(1);
    rendered.rerender(view(stale));
    expect(screen.getByRole("status")).toHaveTextContent("datos pueden estar desactualizados");
  });

  it("reintenta resumen, catálogo y detalle sólo en su región afectada", async () => {
    const user = userEvent.setup();
    const current = workspace({
      summary: null,
      summaryState: "error",
      catalog: null,
      catalogState: "error",
      detailState: "error",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: "rec-1" },
    });
    render(view(current));

    await user.click(screen.getByRole("button", { name: "Reintentar resumen" }));
    await user.click(screen.getByRole("button", { name: "Reintentar filtros" }));
    await user.click(screen.getByRole("button", { name: "Reintentar detalle" }));
    expect(current.retrySummary).toHaveBeenCalledTimes(1);
    expect(current.retryCatalog).toHaveBeenCalledTimes(1);
    expect(current.retryDetail).toHaveBeenCalledTimes(1);
  });

  it("no muestra alcance global ni acciones futuras a un lector propio", () => {
    const current = workspace({
      selected,
      detailState: "ready",
      capabilities: { ...workspace().capabilities, canViewAll: false, canReport: true },
    });
    render(view(current, ["RECURRENCES_VIEW_OWN", "RECURRENCES_REPORT_OWN"]));

    expect(screen.queryByLabelText("Técnico")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reportar reincidencia/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /analizar caso/i })).not.toBeInTheDocument();
  });
});
