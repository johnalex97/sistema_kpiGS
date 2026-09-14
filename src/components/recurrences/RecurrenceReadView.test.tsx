import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
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
import "../../styles.css";

const summary: RecurrenceSummaryMetrics = {
  totalCases: 7000,
  openCases: 3,
  highImpactCases: 2,
  additionalVisits: 5000,
  additionalMinutes: 375,
  estimatedCost: "9007199254740993.25",
  completedBaseOrders: 81000,
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
  visitCount: 1234,
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
  canAddNote: false,
  canViewAll: true,
  canUploadEvidence: false,
  canViewEvidence: true,
  canManageEvidence: false,
  lookupCapabilities: { orders: false, technicians: false, clients: false, branches: false },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function filterLookups(): RecurrenceLookupApi {
  return {
    orders: vi.fn().mockResolvedValue({
      items: [{ id: "order-1", orderNumber: "OT-1831", clientName: "Cliente Demo", branchName: "Centro", status: "COMPLETED" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
    technicians: vi.fn().mockResolvedValue({
      items: [{ id: "tech-1", code: "TEC-004", fullName: "Luis Romero", specialty: null, workPhone: null, workEmail: null, status: "AVAILABLE", hiredOn: "2025-01-01", leftOn: null, user: null, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
    clients: vi.fn().mockResolvedValue({
      items: [{ id: "client-1", code: "CLI-001", name: "Cliente Demo" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
    branches: vi.fn().mockResolvedValue({
      items: [{ id: "branch-1", code: "SUC-001", name: "Centro" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
  };
}

describe("lectura de reincidencias", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("presenta métricas reales con formatos operativos", () => {
    render(<RecurrenceSummaryCards metrics={summary} state="ready" onRetry={vi.fn()} />);

    expect(screen.getByText("8.60%")).toBeInTheDocument();
    expect(screen.getByText("7,000")).toBeInTheDocument();
    expect(screen.getByText("3 abiertos · 2 de impacto alto")).toBeInTheDocument();
    expect(screen.getByText("5,000 visitas · 6 h 15 min")).toBeInTheDocument();
    expect(screen.getByText("Costo estimado").parentElement?.textContent).toContain(
      "L\u00a09,007,199,254,740,993.25",
    );
  });

  it("mantiene los controles accesibles y emite parches que reinician la página", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(patch: Partial<RecurrenceListFilters>) => void>();
    const lookups = filterLookups();
    render(<RecurrenceFilters filters={{ page: 3, pageSize: 20 }} catalog={catalog} catalogState="ready" canViewAll lookupApi={lookups} lookupCapabilities={{ orders: true, technicians: true, clients: true, branches: true }} onChange={onChange} onRetryCatalog={vi.fn()} now={() => new Date("2026-09-02T12:00:00-06:00")} />);

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
    expect(screen.getByLabelText("Técnico")).toHaveAttribute("role", "combobox");
    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toHaveAttribute("name", "recurrenceStatus");
    expect(screen.getByLabelText("Orden original")).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText("Orden original")).toHaveAttribute("aria-autocomplete", "list");

    onChange.mockClear();
    await user.type(screen.getByRole("combobox", { name: "Orden original" }), "OT-1831");
    // JSDOM's CSS engine throws while computing styles for role queries in this
    // stylesheet-heavy suite; the integration test asserts the option role.
    await user.click(await screen.findByText("OT-1831 · Cliente Demo · Centro"));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Aplicar alcance" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ originalOrderId: "order-1", page: 1 }));

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      originalOrderId: undefined,
      detectedFrom: "2026-09-01T00:00:00-06:00",
      detectedTo: "2026-09-30T23:59:59.999-06:00",
      page: 1,
    }));
  });

  it("invalida de inmediato una búsqueda de alcance cuando cambia el texto durante el debounce", async () => {
    const pending = deferred<Awaited<ReturnType<RecurrenceLookupApi["clients"]>>>();
    const lookups = filterLookups();
    vi.mocked(lookups.clients).mockImplementationOnce(() => pending.promise);
    render(<RecurrenceFilters filters={{ page: 1, pageSize: 20 }} catalog={catalog} catalogState="ready" canViewAll lookupApi={lookups} lookupCapabilities={{ orders: true, technicians: true, clients: true, branches: true }} onChange={vi.fn()} onRetryCatalog={vi.fn()} />);

    const client = screen.getByRole("combobox", { name: "Cliente" });
    fireEvent.focus(client);
    await waitFor(() => expect(lookups.clients).toHaveBeenCalledTimes(1));
    const firstSignal = vi.mocked(lookups.clients).mock.calls[0]?.[2] as AbortSignal;

    fireEvent.change(client, { target: { value: "Cliente vigente" } });
    expect(firstSignal.aborted).toBe(true);
    pending.resolve({
      items: [{ id: "client-stale", code: "OLD", name: "Cliente obsoleto" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    await act(async () => { await Promise.resolve(); });

    expect(screen.queryByText(/Cliente obsoleto/)).not.toBeInTheDocument();
  });

  it("aplica el alcance vigente tras popstate y limpia la sucursal al elegir otro cliente", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(patch: Partial<RecurrenceListFilters>) => void>();
    const lookups = filterLookups();
    const rendered = render(<RecurrenceFilters filters={{ originalOrderId: "order-old", clientId: "client-old", branchId: "branch-old", page: 1, pageSize: 20 }} catalog={catalog} catalogState="ready" canViewAll lookupApi={lookups} lookupCapabilities={{ orders: true, technicians: true, clients: true, branches: true }} onChange={onChange} onRetryCatalog={vi.fn()} />);

    rendered.rerender(<RecurrenceFilters filters={{ originalOrderId: "order-current", clientId: "client-current", branchId: "branch-current", page: 1, pageSize: 20 }} catalog={catalog} catalogState="ready" canViewAll lookupApi={lookups} lookupCapabilities={{ orders: true, technicians: true, clients: true, branches: true }} onChange={onChange} onRetryCatalog={vi.fn()} />);
    await user.clear(screen.getByRole("combobox", { name: "Cliente" }));
    await user.type(screen.getByRole("combobox", { name: "Cliente" }), "Cliente Demo");
    await user.click(await screen.findByText("Cliente Demo · CLI-001"));
    await user.click(screen.getByRole("button", { name: "Aplicar alcance" }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      originalOrderId: "order-current",
      clientId: "client-1",
      branchId: undefined,
      page: 1,
    }));
  });

  it("conserva el catálogo visible y permite reintentarlo cuando queda obsoleto", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<RecurrenceFilters filters={{ page: 1, pageSize: 20 }} catalog={catalog} catalogState="error" canViewAll onChange={vi.fn()} onRetryCatalog={retry} />);

    expect(screen.getByLabelText("Estado")).toBeEnabled();
    expect(screen.getByRole("status", { name: "Catálogo desactualizado" })).toHaveTextContent("pueden estar desactualizados");
    await user.click(screen.getByRole("button", { name: "Reintentar filtros" }));
    expect(retry).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("6 h 15 min")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /RI-2026-0001/ }).textContent).toContain(
      "L\u00a06,240.50",
    );
    await user.click(screen.getByRole("button", { name: "Ver RI-2026-0001" }));
    expect(onSelect).toHaveBeenCalledWith("rec-1", expect.any(HTMLButtonElement));
  });

  it("presenta tarjetas semánticas reales en el ancho móvil", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 640px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RecurrenceTable recurrences={[recurrence]} onSelect={onSelect} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = screen.getByRole("article", { name: "RI-2026-0001" });
    expect(within(card).getByText("Orden original")).toBeInTheDocument();
    expect(within(card).getByText("OT-1831")).toBeInTheDocument();
    expect(within(card).getByText("Impacto alto")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Ver RI-2026-0001" }));
    expect(onSelect).toHaveBeenCalledWith("rec-1", expect.any(HTMLButtonElement));
  });

  it("presenta el detalle como diálogo modal con foco contenido en móvil", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 640px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const user = userEvent.setup();
    render(<RecurrenceDetail recurrence={detail} capabilities={capabilities} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Detalle de RI-2026-0001" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = within(dialog).getByRole("button", { name: "Cerrar detalle" });
    close.focus();
    await user.keyboard("{Tab}");
    expect(close).toHaveFocus();
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
    expect(
      within(dialog).getByText("certificacion-enlace.pdf").closest("li")?.textContent,
    ).toContain("512\u00a0KB");
    expect(within(dialog).queryByRole("button", { name: /analizar|corregir|descargar|archivar/i })).not.toBeInTheDocument();

    await act(async () => { await user.keyboard("{Escape}"); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("describe un descarte como flujo alternativo de cuatro pasos y muestra su auditoría", () => {
    render(<RecurrenceDetail recurrence={{
      ...detail,
      status: "DISMISSED",
      ageOverrideReason: "Incidencia confirmada fuera de la ventana estándar.",
      dismissalReason: "La visita adicional corresponde a una ampliación solicitada.",
      dismissedAt: "2026-08-31T13:00:00.000Z",
    }} capabilities={capabilities} onClose={vi.fn()} />);

    const progress = screen.getByRole("region", { name: "Progreso del caso" });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(4);
    expect(within(progress).getByText("Descartado").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Incidencia confirmada fuera de la ventana estándar.")).toBeInTheDocument();
    expect(screen.getByText("La visita adicional corresponde a una ampliación solicitada.")).toBeInTheDocument();
    expect(screen.getByText("Fecha de descarte")).toBeInTheDocument();
  });

  it("permite quebrar textos operativos extensos dentro del detalle", () => {
    render(<RecurrenceDetail recurrence={detail} capabilities={capabilities} onClose={vi.fn()} />);

    for (const content of [
      detail.analysis!,
      detail.technicians[0]!.justification!,
      detail.observations!,
      detail.notes[0]!.content,
    ]) {
      expect(getComputedStyle(screen.getByText(content)).overflowWrap).toBe("anywhere");
    }
  });

  it("contiene una observación de visita extensa sin espacios", () => {
    const visitObservation = "CERTIFICACIONDECONTINUIDADDEENLACEEXTENSA1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    render(<RecurrenceDetail recurrence={{
      ...detail,
      visits: [{ ...detail.visits[0]!, observation: visitObservation }],
    }} capabilities={capabilities} onClose={vi.fn()} />);

    const visitMetadata = screen.getByText(new RegExp(visitObservation, "u"));
    expect(visitMetadata.tagName).toBe("SMALL");
    expect(getComputedStyle(visitMetadata).overflowWrap).toBe("anywhere");
  });

  it("muestra la fecha de cierre persistida", () => {
    render(<RecurrenceDetail recurrence={{ ...detail, status: "CLOSED", closedAt: "2026-08-31T14:00:00.000Z" }} capabilities={capabilities} onClose={vi.fn()} />);

    expect(screen.getByText("Fecha de cierre")).toBeInTheDocument();
  });

  it("no revela evidencias sin capacidad de lectura", () => {
    render(<RecurrenceDetail recurrence={detail} capabilities={{ ...capabilities, canViewEvidence: false }} onClose={vi.fn()} />);

    expect(screen.queryByText("certificacion-enlace.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("La evidencia no está disponible para tu perfil.")).toBeInTheDocument();
  });
});
