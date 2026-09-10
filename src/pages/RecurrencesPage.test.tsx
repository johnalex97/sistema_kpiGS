import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import type { RecurrencesWorkspace } from "../hooks/useRecurrencesWorkspace";
import type { Evidence } from "../models/evidence";
import type { OrderLookup } from "../models/order-lookup";
import type { RecurrenceDetail, RecurrenceSummary } from "../models/recurrence";
import { RecurrencesPage } from "./RecurrencesPage";
import "../styles.css";

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

const evidence: Evidence = {
  id: "evidence-1",
  originalName: "router-frontal.png",
  mimeType: "image/png",
  fileExtension: "png",
  sizeBytes: 1450,
  description: "Indicador apagado",
  accessLevel: "TECHNICIAN",
  uploadedBy: { id: "user-1", displayName: "Ana López" },
  resourceType: "RECURRENCE",
  resourceId: "rec-created",
  checksumSha256: "abc123",
  version: 1,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
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
    evidencePromptForId: null,
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
    lookupApi: {
      orders: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
      technicians: vi.fn(),
      clients: vi.fn(),
      branches: vi.fn(),
    } as RecurrencesWorkspace["lookupApi"],
    evidenceApi: {
      listRecurrence: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
    } as unknown as RecurrencesWorkspace["evidenceApi"],
    setFilters: vi.fn(),
    select: vi.fn(),
    closeDetail: vi.fn(),
    retryCatalog: vi.fn(),
    retryList: vi.fn(),
    retrySummary: vi.fn(),
    retryDetail: vi.fn(),
    reportRecurrence: vi.fn(async () => true),
    analyzeRecurrence: vi.fn(async () => true),
    uploadEvidence: vi.fn(async () => true),
    downloadEvidence: vi.fn(async () => true),
    archiveEvidence: vi.fn(async () => true),
    clearEvidencePrompt: vi.fn(),
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
    expect(screen.getByRole("status", { name: "Sin casos" })).toHaveAttribute("aria-live", "polite");
    rendered.rerender(view(error));
    expect(screen.getByRole("alert")).toHaveTextContent("No fue posible cargar los casos");
    await user.click(screen.getByRole("button", { name: "Reintentar casos" }));
    expect(error.retryList).toHaveBeenCalledTimes(1);
    rendered.rerender(view(stale));
    expect(screen.getByRole("status")).toHaveTextContent("datos pueden estar desactualizados");
  });

  it("restaura un foco seguro cuando el detalle proviene de URL o popstate", async () => {
    const direct = workspace({
      selected,
      detailState: "ready",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: "rec-1" },
    });
    const rendered = render(view(direct));

    await userEvent.click(screen.getByRole("button", { name: "Cerrar detalle" }));
    expect(screen.getByLabelText("Casos registrados")).toHaveFocus();

    rendered.rerender(view(workspace({
      selected,
      detailState: "ready",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: "rec-1" },
    })));
    rendered.rerender(view(workspace()));
    await waitFor(() => expect(screen.getByLabelText("Casos registrados")).toHaveFocus());
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
    const close = screen.getByRole("button", { name: "Cerrar" });
    expect(getComputedStyle(close).minHeight).toBe("44px");
    expect(getComputedStyle(close).touchAction).toBe("manipulation");
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

  it("opens report only with the orders prerequisite and submits the selected pair", async () => {
    const user = userEvent.setup();
    const original: OrderLookup = { id: "order-1", orderNumber: "OT-100", clientName: "Hospital Norte", branchName: "Central", status: "COMPLETED" };
    const correction: OrderLookup = { id: "order-2", orderNumber: "OT-200", clientName: "Hospital Norte", branchName: "Central", status: "IN_PROGRESS" };
    const orders = vi.fn(async (_search: string, statuses: string[]) => ({
      items: statuses.length === 1 ? [original] : [correction],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }));
    const current = workspace({
      capabilities: { ...workspace().capabilities, canReport: true, lookupCapabilities: { ...workspace().capabilities.lookupCapabilities, orders: true } },
      lookupApi: { orders } as unknown as RecurrencesWorkspace["lookupApi"],
    });
    const rendered = render(view(current));

    const trigger = screen.getByRole("button", { name: "Reportar reincidencia" });
    await user.click(trigger);
    expect(current.setActionMode).toHaveBeenCalledWith("report");
    rendered.rerender(view({ ...current, actionMode: "report" }));
    await user.click(screen.getByRole("combobox", { name: "Orden original" }));
    await user.click(await screen.findByRole("option", { name: /OT-100/ }));
    await user.click(screen.getByRole("combobox", { name: "Orden correctiva" }));
    await user.click(await screen.findByRole("option", { name: /OT-200/ }));
    await user.type(screen.getByLabelText("Problema detectado"), "La falla reapareció");
    await user.click(within(screen.getByRole("dialog", { name: "Reportar reincidencia" })).getByRole("button", { name: "Reportar reincidencia" }));

    expect(current.reportRecurrence).toHaveBeenCalledWith({ originalOrderId: "order-1", correctionOrderId: "order-2", detectedProblem: "La falla reapareció" });
  });

  it("shows immediate evidence for the created detail and restores focus when skipped", async () => {
    const user = userEvent.setup();
    const current = workspace({
      selected: { ...selected, id: "rec-created", recurrenceNumber: "RI-2026-0042", version: 1 },
      query: { filters: { page: 1, pageSize: 20 }, selectedId: "rec-created" },
      detailState: "ready",
      evidencePromptForId: "rec-created",
      capabilities: { ...workspace().capabilities, canUploadEvidence: true },
    });
    render(view(current));

    expect(screen.getByRole("heading", { name: "Agregar evidencia" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Caso creado · evidencia pendiente");
    await user.click(screen.getByRole("button", { name: "Continuar sin evidencia" }));
    expect(current.clearEvidencePrompt).toHaveBeenCalledTimes(1);
  });

  it("abre la gestión de evidencia de un caso existente para perfiles autorizados", async () => {
    const user = userEvent.setup();
    const current = workspace({
      selected,
      detailState: "ready",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: selected.id },
      capabilities: { ...workspace().capabilities, canViewEvidence: true },
    });
    render(view(current));

    await user.click(screen.getByRole("button", { name: "Gestionar evidencia" }));
    expect(screen.getByRole("dialog", { name: "Gestionar evidencia" })).toHaveAttribute("data-recurrence-id", selected.id);
  });

  it("loads the real evidence list and exposes download and archive operations", async () => {
    const listRecurrence = vi.fn().mockResolvedValue({ items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    const current = workspace({
      selected: { ...selected, id: "rec-created", recurrenceNumber: "RI-2026-0042" },
      query: { filters: { page: 1, pageSize: 20 }, selectedId: "rec-created" },
      detailState: "ready",
      evidencePromptForId: "rec-created",
      evidenceApi: { listRecurrence } as unknown as RecurrencesWorkspace["evidenceApi"],
      capabilities: { ...workspace().capabilities, canUploadEvidence: true, canViewEvidence: true, canManageEvidence: true },
    });
    const user = userEvent.setup();
    render(view(current));

    const evidenceDialog = screen.getByRole("dialog", { name: "Agregar evidencia" });
    expect(await within(evidenceDialog).findByText("router-frontal.png")).toBeInTheDocument();
    expect(listRecurrence).toHaveBeenCalledWith("rec-created", 1, expect.any(AbortSignal));
    await user.click(screen.getByRole("button", { name: "Descargar router-frontal.png" }));
    expect(current.downloadEvidence).toHaveBeenCalledWith(evidence);
    await user.click(screen.getByRole("button", { name: "Archivar router-frontal.png" }));
    expect(screen.getByLabelText("Motivo para archivar router-frontal.png")).toBeInTheDocument();
  });

  it("removes report and evidence dialogs immediately when permissions are revoked", () => {
    const allowed = workspace({
      actionMode: "report",
      evidencePromptForId: "rec-1",
      selected,
      detailState: "ready",
      capabilities: {
        ...workspace().capabilities,
        canReport: true,
        canUploadEvidence: true,
        lookupCapabilities: { ...workspace().capabilities.lookupCapabilities, orders: true },
      },
    });
    const rendered = render(view(allowed));
    expect(screen.getByRole("dialog", { name: "Reportar reincidencia" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Agregar evidencia" })).toBeInTheDocument();

    rendered.rerender(view(workspace({ actionMode: "report", evidencePromptForId: "rec-1", selected, detailState: "ready" })));
    expect(screen.queryByRole("dialog", { name: "Reportar reincidencia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Agregar evidencia" })).not.toBeInTheDocument();
  });

  it("keeps report actions and fields touch-safe inside an operational modal layer", async () => {
    const user = userEvent.setup();
    const current = workspace({
      capabilities: { ...workspace().capabilities, canReport: true, lookupCapabilities: { ...workspace().capabilities.lookupCapabilities, orders: true } },
    });
    const rendered = render(view(current));
    const trigger = screen.getByRole("button", { name: "Reportar reincidencia" });
    expect(getComputedStyle(trigger).minHeight).toBe("44px");
    await user.click(trigger);
    rendered.rerender(view({ ...current, actionMode: "report" }));

    const dialog = screen.getByRole("dialog", { name: "Reportar reincidencia" });
    expect(getComputedStyle(dialog.parentElement as HTMLElement).position).toBe("fixed");
    expect(getComputedStyle(within(dialog).getByRole("combobox", { name: "Orden original" })).minHeight).toBe("44px");
    expect(getComputedStyle(within(dialog).getByRole("button", { name: "Cancelar" })).minHeight).toBe("44px");
  });

  it("opens analysis only for an OPEN case with review permission and submits original technicians", async () => {
    const user = userEvent.setup();
    const originalTechnician = {
      technician: { id: "22222222-2222-4222-8222-222222222222", code: "TEC-001", fullName: "Ana López" },
      participation: "ORIGINAL_RESPONSIBLE" as const,
      affectsQuality: false,
      justification: null,
    };
    const open = { ...selected, status: "OPEN" as const, technicians: [originalTechnician] };
    const current = workspace({
      selected: open,
      detailState: "ready",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: open.id },
      catalog: { ...workspace().catalog!, causes: [{ id: "11111111-1111-4111-8111-111111111111", code: "REWORK", name: "Retrabajo" }] },
      capabilities: { ...workspace().capabilities, canReview: true },
    });
    const rendered = render(view(current));

    const trigger = screen.getByRole("button", { name: "Analizar caso" });
    await user.click(trigger);
    expect(current.setActionMode).toHaveBeenCalledWith("analyze");
    rendered.rerender(view({ ...current, actionMode: "analyze" }));
    const dialog = screen.getByRole("dialog", { name: "Analizar caso" });
    await user.selectOptions(within(dialog).getByLabelText("Causa"), "11111111-1111-4111-8111-111111111111");
    await user.selectOptions(within(dialog).getByLabelText("Impacto"), "HIGH");
    await user.selectOptions(within(dialog).getByLabelText("Responsabilidad"), "TECHNICAL_WORK");
    await user.type(within(dialog).getByLabelText("Análisis técnico"), "Intervención incompleta");
    await user.click(within(dialog).getByLabelText("Afecta calidad de Ana López"));
    await user.type(within(dialog).getByLabelText("Justificación para Ana López"), "No certificó la conexión");
    await user.click(within(dialog).getByRole("button", { name: "Guardar análisis" }));

    expect(current.analyzeRecurrence).toHaveBeenCalledWith(expect.objectContaining({
      causeId: "11111111-1111-4111-8111-111111111111",
      qualityDecisions: [{ technicianId: originalTechnician.technician.id, affectsQuality: true, justification: "No certificó la conexión" }],
    }));

    rendered.rerender(view(workspace({ selected, detailState: "ready", capabilities: { ...workspace().capabilities, canReview: true } })));
    expect(screen.queryByRole("button", { name: "Analizar caso" })).not.toBeInTheDocument();
  });

  it("removes analysis on permission revocation and restores focus to the case register", async () => {
    const open = { ...selected, status: "OPEN" as const };
    const allowed = workspace({
      selected: open,
      detailState: "ready",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: open.id },
      actionMode: "analyze",
      capabilities: { ...workspace().capabilities, canReview: true },
    });
    const rendered = render(view(allowed));
    expect(screen.getByRole("dialog", { name: "Analizar caso" })).toBeInTheDocument();

    rendered.rerender(view({ ...allowed, actionMode: "analyze", capabilities: { ...allowed.capabilities, canReview: false } }));

    expect(screen.queryByRole("dialog", { name: "Analizar caso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analizar caso" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Casos registrados")).toHaveFocus());
  });

  it("keeps a conflict draft visible after the case leaves OPEN but blocks resubmission", async () => {
    const user = userEvent.setup();
    const open = { ...selected, status: "OPEN" as const };
    const current = workspace({
      selected: open,
      detailState: "ready",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: open.id },
      actionMode: "analyze",
      capabilities: { ...workspace().capabilities, canReview: true },
    });
    const rendered = render(view(current));
    const dialog = screen.getByRole("dialog", { name: "Analizar caso" });
    await user.type(within(dialog).getByLabelText("Análisis técnico"), "Borrador que debe conservarse");

    rendered.rerender(view({
      ...current,
      selected: { ...open, status: "ANALYSIS", version: open.version + 1 },
      mutation: { name: "analyze", pending: false, error: "El caso cambió en el servidor.", conflict: true },
    }));

    expect(screen.getByRole("dialog", { name: "Analizar caso" })).toBeInTheDocument();
    expect(screen.getByLabelText("Análisis técnico")).toHaveValue("Borrador que debe conservarse");
    expect(screen.getByRole("button", { name: "Guardar análisis" })).toBeDisabled();
    expect(getComputedStyle(screen.getByRole("dialog", { name: "Analizar caso" })).scrollPaddingBlock).toBe("96px 76px");
  });

  it("hides analysis for an ordinary non-OPEN status refresh without conflict mode", () => {
    const current = workspace({
      selected: { ...selected, status: "ANALYSIS" },
      detailState: "ready",
      query: { filters: { page: 1, pageSize: 20 }, selectedId: selected.id },
      actionMode: "analyze",
      capabilities: { ...workspace().capabilities, canReview: true },
    });

    render(view(current));

    expect(screen.queryByRole("dialog", { name: "Analizar caso" })).not.toBeInTheDocument();
  });
});
