import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecurrenceApi } from "./recurrences";

function jsonResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const recurrenceDetail = {
  id: "rec-1",
  recurrenceNumber: "REC-2026-0001",
  status: "OPEN",
  impact: "LOW",
  responsibility: "UNDETERMINED",
  detectedProblem: "Intermitencia de red",
  detectedAt: "2026-08-31T12:00:00.000Z",
  originalOrder: { id: "order-1", orderNumber: "OT-001" },
  cause: null,
  additionalMinutes: 0,
  estimatedCost: "0.00",
  visitCount: 0,
  noteCount: 0,
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
  version: 1,
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
} as const;

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("createRecurrenceApi", () => {
  it("serializa arreglos repetidos, fechas ISO, texto vacío omitido y paginación", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      items: [],
      pagination: { page: 2, pageSize: 20, totalItems: 0, totalPages: 0 },
    }));

    await createRecurrenceApi().list({
      search: "   ",
      status: ["OPEN", "ANALYSIS"],
      impact: ["HIGH"],
      responsibility: ["TECHNICAL_WORK", "EQUIPMENT"],
      detectedFrom: "2026-08-01T00:00:00.000-06:00",
      detectedTo: "2026-08-31T23:59:59.999-06:00",
      page: 2,
      pageSize: 20,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    const query = new URL(String(url), "http://localhost").searchParams;
    expect(query.getAll("status")).toEqual(["OPEN", "ANALYSIS"]);
    expect(query.getAll("impact")).toEqual(["HIGH"]);
    expect(query.getAll("responsibility")).toEqual(["TECHNICAL_WORK", "EQUIPMENT"]);
    expect(query.get("detectedFrom")).toBe("2026-08-01T00:00:00.000-06:00");
    expect(query.get("detectedTo")).toBe("2026-08-31T23:59:59.999-06:00");
    expect(query.has("search")).toBe(false);
    expect(query.get("page")).toBe("2");
    expect(query.get("pageSize")).toBe("20");
    expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it("consulta catálogo, resumen y detalle codificado con la señal de aborto", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ causes: [], states: [], impacts: [], responsibilities: [], transitions: [] }))
      .mockResolvedValueOnce(jsonResponse({
        totalCases: 0,
        openCases: 0,
        highImpactCases: 0,
        additionalVisits: 0,
        additionalMinutes: 0,
        estimatedCost: "0.00",
        completedBaseOrders: 0,
        recurrenceRate: "0.00",
      }))
      .mockResolvedValueOnce(jsonResponse(recurrenceDetail));
    const controller = new AbortController();
    const api = createRecurrenceApi();

    await api.catalog(controller.signal);
    await api.summary({ search: "enlace", status: ["OPEN"] }, controller.signal);
    await api.detail("rec/id con espacio", controller.signal);

    const [catalogUrl, catalogInit] = vi.mocked(fetch).mock.calls[0]!;
    const [summaryUrl, summaryInit] = vi.mocked(fetch).mock.calls[1]!;
    const [detailUrl, detailInit] = vi.mocked(fetch).mock.calls[2]!;
    expect(String(catalogUrl)).toContain("/recurrences/catalog");
    expect(catalogInit).toEqual(expect.objectContaining({ signal: controller.signal, credentials: "include" }));
    expect(String(summaryUrl)).toContain("/recurrences/summary?search=enlace&status=OPEN");
    expect(summaryInit).toEqual(expect.objectContaining({ signal: controller.signal, credentials: "include" }));
    expect(String(detailUrl)).toContain("/recurrences/rec%2Fid%20con%20espacio");
    expect(detailInit).toEqual(expect.objectContaining({ signal: controller.signal, credentials: "include" }));
  });

  it.each<{
    name: string;
    path: string;
    body: unknown;
    invoke: () => Promise<unknown>;
  }>([
    {
      name: "reportar sin serializar campos indefinidos",
      path: "/recurrences",
      body: { originalOrderId: "order-1", correctionOrderId: "order-2", detectedProblem: "Intermitencia de red" },
      invoke: () => createRecurrenceApi().report({
        originalOrderId: "order-1",
        correctionOrderId: "order-2",
        detectedProblem: "Intermitencia de red",
        omitted: undefined,
      } as never),
    },
    {
      name: "analizar",
      path: "/recurrences/rec%2Fid%20con%20espacio/analysis",
      body: {
        version: 1,
        causeId: "cause-1",
        impact: "HIGH",
        responsibility: "TECHNICAL_WORK",
        analysis: "Diagnóstico confirmado",
        qualityDecisions: [],
      },
      invoke: () => createRecurrenceApi().analyze("rec/id con espacio", {
        version: 1,
        causeId: "cause-1",
        impact: "HIGH",
        responsibility: "TECHNICAL_WORK",
        analysis: "Diagnóstico confirmado",
        qualityDecisions: [],
      }),
    },
    {
      name: "iniciar corrección",
      path: "/recurrences/rec%2Fid%20con%20espacio/correction",
      body: { version: 1, correctiveAction: "Cambiar conector" },
      invoke: () => createRecurrenceApi().correct("rec/id con espacio", { version: 1, correctiveAction: "Cambiar conector" }),
    },
    {
      name: "agregar visita",
      path: "/recurrences/rec%2Fid%20con%20espacio/visits",
      body: { version: 1, orderId: "order-3" },
      invoke: () => createRecurrenceApi().addVisit("rec/id con espacio", { version: 1, orderId: "order-3" }),
    },
    {
      name: "agregar nota",
      path: "/recurrences/rec%2Fid%20con%20espacio/notes",
      body: { content: "Cliente informado" },
      invoke: () => createRecurrenceApi().addNote("rec/id con espacio", { content: "Cliente informado" }),
    },
    {
      name: "descartar",
      path: "/recurrences/rec%2Fid%20con%20espacio/dismiss",
      body: { version: 1, reason: "No corresponde a una recurrencia" },
      invoke: () => createRecurrenceApi().dismiss("rec/id con espacio", { version: 1, reason: "No corresponde a una recurrencia" }),
    },
    {
      name: "cerrar",
      path: "/recurrences/rec%2Fid%20con%20espacio/close",
      body: { version: 1 },
      invoke: () => createRecurrenceApi().close("rec/id con espacio", { version: 1 }),
    },
    {
      name: "ajustar",
      path: "/recurrences/rec%2Fid%20con%20espacio/adjust",
      body: { version: 1, reason: "Ajuste autorizado posterior", observations: "Datos verificados" },
      invoke: () => createRecurrenceApi().adjust("rec/id con espacio", {
        version: 1,
        reason: "Ajuste autorizado posterior",
        observations: "Datos verificados",
      }),
    },
  ])("envía ruta, POST y cuerpo exacto al $name", async ({ path, body, invoke }) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(recurrenceDetail));

    await expect(invoke()).resolves.toEqual(recurrenceDetail);

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify(body),
    }));
  });
});
