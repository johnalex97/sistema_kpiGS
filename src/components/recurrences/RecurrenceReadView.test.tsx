import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecurrenceCapabilities } from "../../hooks/useRecurrencesWorkspace";
import type {
  RecurrenceCatalog,
  RecurrenceDetail as RecurrenceDetailModel,
  RecurrenceListFilters,
  RecurrenceSummary,
  RecurrenceSummaryMetrics,
} from "../../models/recurrence";
import { RecurrenceDetail } from "./RecurrenceDetail";
import { RecurrenceFilters } from "./RecurrenceFilters";
import { RecurrenceSummaryCards } from "./RecurrenceSummaryCards";
import { RecurrenceTable } from "./RecurrenceTable";

const summary: RecurrenceSummaryMetrics = {
  totalCases: 7,
  openCases: 3,
  highImpactCases: 2,
  additionalVisits: 5,
  additionalMinutes: 375,
  estimatedCost: "6240.50",
  completedBaseOrders: 81,
  recurrenceRate: "8.60",
};

const recurrence: RecurrenceSummary = {
  id: "rec-1",
  recurrenceNumber: "RI-2026-0001",
  status: "ANALYSIS",
  impact: "HIGH",
  responsibility: "TECHNICAL_WORK",
  detectedProblem: "Pérdida intermitente de conexión",
  detectedAt: "2026-08-28T15:00:00.000Z",
  originalOrder: { id: "order-1", orderNumber: "OT-1831" },
  cause: { id: "cause-1", code: "CABLE", name: "Terminación deficiente" },
  additionalMinutes: 375,
  estimatedCost: "6240.50",
  visitCount: 3,
  noteCount: 1,
  createdAt: "2026-08-28T15:00:00.000Z",
  updatedAt: "2026-08-30T19:15:00.000Z",
  version: 4,
};

const detail: RecurrenceDetailModel = {
  ...recurrence,
  analysis: "La terminación perdió continuidad bajo carga.",
  correctiveAction: "Reemplazar conector y certificar enlace.",
  preventiveAction: "Añadir prueba de carga al cierre.",
  observations: "Cliente confirma estabilidad.",
  ageOverrideReason: null,
  dismissalReason: null,
  dismissedAt: null,
  closedAt: null,
  visits: [{
    id: "visit-1",
    visitNumber: 2,
    additionalMinutes: 95,
    observation: "Se reprodujo la pérdida de enlace.",
    order: { id: "order-2", orderNumber: "OT-1844" },
  }],
  technicians: [{
    technician: { id: "tech-1", code: "TEC-004", fullName: "Luis Romero" },
    participation: "ORIGINAL_RESPONSIBLE",
    affectsQuality: true,
    justification: "La certificación original quedó incompleta.",
  }],
  notes: [{
    id: "note-1",
    content: "Cliente confirma estabilidad durante 24 horas.",
    createdAt: "2026-08-30T18:00:00.000Z",
    authorDisplayName: "Ana Supervisora",
  }],
  evidences: [{
    id: "evidence-1",
    originalName: "certificacion-enlace.pdf",
    mimeType: "application/pdf",
    sizeBytes: "524288",
    createdAt: "2026-08-30T18:30:00.000Z",
  }],
};

const catalog: RecurrenceCatalog = {
  causes: [recurrence.cause!],
  states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
  impacts: ["LOW", "MEDIUM", "HIGH"],
  responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
  transitions: [],
};

const capabilities: RecurrenceCapabilities = {
  canReport: false,
  canReview: false,
  canViewAll: true,
  canUploadEvidence: false,
  canViewEvidence: true,
  canManageEvidence: false,
  lookupCapabilities: { orders: false, technicians: false, clients: false, branches: false },
};

describe("lectura de reincidencias", () => {
  it("presenta métricas reales con formatos operativos", () => {
    render(<RecurrenceSummaryCards metrics={summary} state="ready" onRetry={vi.fn()} />);

    expect(screen.getByText("8.60%")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3 abiertos · 2 de impacto alto")).toBeInTheDocument();
    expect(screen.getByText("5 visitas · 6 h 15 min")).toBeInTheDocument();
    expect(screen.getByText("L 6,240.50")).toBeInTheDocument();
  });

  it("mantiene los controles accesibles y emite parches que reinician la página", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(patch: Partial<RecurrenceListFilters>) => void>();
    render(<RecurrenceFilters filters={{ page: 3, pageSize: 20 }} catalog={catalog} catalogState="ready" canViewAll onChange={onChange} onRetryCatalog={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Estado"), "ANALYSIS");
    expect(onChange).toHaveBeenCalledWith({ status: ["ANALYSIS"], page: 1 });
    await user.selectOptions(screen.getByLabelText("Impacto"), "HIGH");
    expect(onChange).toHaveBeenCalledWith({ impact: ["HIGH"], page: 1 });
    await user.selectOptions(screen.getByLabelText("Responsabilidad"), "TECHNICAL_WORK");
    expect(onChange).toHaveBeenCalledWith({ responsibility: ["TECHNICAL_WORK"], page: 1 });
    await user.type(screen.getByLabelText("Desde"), "2026-08-03");
    expect(onChange).toHaveBeenCalledWith({ detectedFrom: "2026-08-03T00:00:00-06:00", page: 1 });
    await user.type(screen.getByLabelText("Hasta"), "2026-08-31");
    expect(onChange).toHaveBeenCalledWith({ detectedTo: "2026-08-31T23:59:59.999-06:00", page: 1 });
    expect(screen.getByLabelText("Técnico")).toBeInTheDocument();
    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
  });

  it("oculta filtros de alcance para una consulta propia", () => {
    render(<RecurrenceFilters filters={{ page: 1, pageSize: 20 }} catalog={catalog} catalogState="ready" canViewAll={false} onChange={vi.fn()} onRetryCatalog={vi.fn()} />);

    expect(screen.queryByLabelText("Orden original")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Técnico")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cliente")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sucursal")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
  });

  it("presenta la tabla y entrega la selección por su identificador", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RecurrenceTable recurrences={[recurrence]} onSelect={onSelect} />);

    expect(screen.getByRole("columnheader", { name: "Orden original" })).toBeInTheDocument();
    expect(screen.getByText("Impacto alto")).toBeInTheDocument();
    expect(screen.getByText("En análisis")).toBeInTheDocument();
    expect(screen.getByText("6 h 15 min")).toBeInTheDocument();
    expect(screen.getByText("L 6,240.50")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver RI-2026-0001" }));
    expect(onSelect).toHaveBeenCalledWith("rec-1", expect.any(HTMLButtonElement));
  });

  it("enfoca el detalle, expone historia autorizada y cierra con Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecurrenceDetail recurrence={detail} capabilities={capabilities} onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Detalle de RI-2026-0001" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByText("Luis Romero")).toBeInTheDocument();
    expect(within(dialog).getByText("Afecta calidad")).toBeInTheDocument();
    expect(within(dialog).getByText("OT-1844")).toBeInTheDocument();
    expect(within(dialog).getByText("Cliente confirma estabilidad durante 24 horas.")).toBeInTheDocument();
    expect(within(dialog).getByText("certificacion-enlace.pdf")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /analizar|corregir|descargar|archivar/i })).not.toBeInTheDocument();

    await act(async () => { await user.keyboard("{Escape}"); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no revela evidencias sin capacidad de lectura", () => {
    render(<RecurrenceDetail recurrence={detail} capabilities={{ ...capabilities, canViewEvidence: false }} onClose={vi.fn()} />);

    expect(screen.queryByText("certificacion-enlace.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("La evidencia no está disponible para tu perfil.")).toBeInTheDocument();
  });
});
