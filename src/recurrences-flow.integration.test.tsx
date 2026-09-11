import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./layouts/AppShell";
import type { AuthUser } from "./models/auth";
import type { Evidence } from "./models/evidence";
import type { RecurrenceDetail, RecurrenceStatus } from "./models/recurrence";
import { renderWithAuth } from "./test/auth-test-utils";

const recurrenceId = "11111111-1111-4111-8111-111111111111";
const originalOrderId = "22222222-2222-4222-8222-222222222222";
const correctionOrderId = "33333333-3333-4333-8333-333333333333";
const visitOrderId = "44444444-4444-4444-8444-444444444444";
const technicianId = "55555555-5555-4555-8555-555555555555";
const clientId = "66666666-6666-4666-8666-666666666666";
const branchId = "77777777-7777-4777-8777-777777777777";
const causeId = "88888888-8888-4888-8888-888888888888";

const reviewer: AuthUser = {
  id: "reviewer-1",
  email: "supervision@geek.test",
  displayName: "Supervisión Geek",
  mustChangePassword: false,
  technicianId: null,
  roles: ["SUPERVISOR"],
  permissions: [
    "RECURRENCES_VIEW_ALL",
    "RECURRENCES_REVIEW",
    "EVIDENCES_VIEW",
    "EVIDENCES_UPLOAD",
    "EVIDENCES_MANAGE",
    "ORDERS_VIEW_ALL",
    "TECHNICIANS_VIEW",
    "CLIENTS_VIEW",
  ],
};

const evidence: Evidence = {
  id: "evidence-1",
  originalName: "enlace-router.pdf",
  mimeType: "application/pdf",
  fileExtension: "pdf",
  sizeBytes: 8,
  description: "Lectura del enlace",
  accessLevel: "TECHNICIAN",
  uploadedBy: { id: reviewer.id, displayName: reviewer.displayName },
  resourceType: "RECURRENCE",
  resourceId: recurrenceId,
  checksumSha256: "abc123",
  version: 1,
  createdAt: "2026-09-10T15:00:00.000Z",
  updatedAt: "2026-09-10T15:00:00.000Z",
};

interface RequestRecord {
  method: string;
  path: string;
  body: Record<string, unknown> | FormData | null;
}

function json(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function detail(version: number, status: RecurrenceStatus): RecurrenceDetail {
  return {
    id: recurrenceId,
    recurrenceNumber: "RI-2026-0042",
    status,
    impact: version >= 6 ? "MEDIUM" : version >= 2 ? "HIGH" : "LOW",
    responsibility: version >= 2 ? "EQUIPMENT" : "UNDETERMINED",
    detectedProblem: "El enlace principal volvió a fallar",
    detectedAt: "2026-09-10T14:00:00.000Z",
    originalOrder: { id: originalOrderId, orderNumber: "OT-ORIG-0042" },
    cause: version >= 2 ? { id: causeId, code: "LINK", name: "Enlace inestable" } : null,
    additionalMinutes: version >= 4 ? 45 : 0,
    estimatedCost: "0.00",
    visitCount: version >= 4 ? 1 : 0,
    noteCount: version >= 4 ? 1 : 0,
    createdAt: "2026-09-10T14:00:00.000Z",
    updatedAt: `2026-09-10T1${Math.min(version + 4, 9)}:00:00.000Z`,
    version,
    analysis: version >= 2 ? "Se confirmó una falla intermitente del equipo" : null,
    correctiveAction: version >= 3 ? "Sustituir equipo y certificar el enlace" : null,
    preventiveAction: version >= 3 ? "Monitorear potencia durante siete días" : null,
    observations: version >= 6 ? "Ajuste validado por supervisión" : null,
    ageOverrideReason: null,
    dismissalReason: null,
    dismissedAt: null,
    closedAt: status === "CLOSED" ? "2026-09-10T19:00:00.000Z" : null,
    visits: version >= 4 ? [{
      id: "visit-1",
      visitNumber: 1,
      additionalMinutes: 45,
      observation: "Validación posterior al reemplazo",
      order: { id: visitOrderId, orderNumber: "OT-VISIT-0044" },
    }] : [],
    technicians: [{
      technician: { id: technicianId, code: "TEC-014", fullName: "Ana López" },
      participation: "ORIGINAL_RESPONSIBLE",
      affectsQuality: false,
      justification: null,
    }],
    notes: version >= 4 ? [{
      id: "note-1",
      content: "Cliente confirma estabilidad durante 24 horas",
      createdAt: "2026-09-10T18:00:00.000Z",
      authorDisplayName: reviewer.displayName,
    }] : [],
    evidences: uploaded ? [{
      id: evidence.id,
      originalName: evidence.originalName,
      mimeType: evidence.mimeType,
      sizeBytes: String(evidence.sizeBytes),
      createdAt: evidence.createdAt,
    }] : [],
  };
}

let current: RecurrenceDetail | null;
let uploaded: boolean;
const requests: RequestRecord[] = [];

function page() {
  const items = current ? [current] : [];
  return { items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 } };
}

function summary() {
  return {
    totalCases: current ? 1 : 0,
    openCases: current && current.status !== "CLOSED" && current.status !== "DISMISSED" ? 1 : 0,
    highImpactCases: current?.impact === "HIGH" ? 1 : 0,
    additionalVisits: current?.visitCount ?? 0,
    additionalMinutes: current?.additionalMinutes ?? 0,
    estimatedCost: current?.estimatedCost ?? "0.00",
    completedBaseOrders: 12,
    recurrenceRate: current ? "8.33" : "0.00",
  };
}

function order(id: string, orderNumber: string, status: string) {
  return { id, orderNumber, status, client: { tradeName: "Cliente Norte" }, branch: { name: "Sucursal Centro" } };
}

function installFetchServer() {
  vi.mocked(fetch).mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string"
      ? JSON.parse(init.body) as Record<string, unknown>
      : init?.body instanceof FormData ? init.body : null;
    requests.push({ method, path: `${url.pathname}${url.search}`, body });
    const path = url.pathname.replace("/api/v1", "");

    if (method === "GET" && path === "/recurrences/catalog") return json({
      causes: [{ id: causeId, code: "LINK", name: "Enlace inestable" }],
      states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
      impacts: ["LOW", "MEDIUM", "HIGH"],
      responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
      transitions: [],
    });
    if (method === "GET" && path === "/recurrences") return json(page());
    if (method === "GET" && path === "/recurrences/summary") return json(summary());
    if (method === "GET" && path === `/recurrences/${recurrenceId}`) return json(current);
    if (method === "GET" && path === "/orders") {
      const search = url.searchParams.get("search") ?? "";
      const items = search.includes("ORIG")
        ? [order(originalOrderId, "OT-ORIG-0042", "COMPLETED")]
        : search.includes("VISIT")
          ? [order(visitOrderId, "OT-VISIT-0044", "IN_PROGRESS")]
          : search.includes("CORR")
            ? [order(correctionOrderId, "OT-CORR-0043", "IN_PROGRESS")]
            : [];
      return json({ items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 } });
    }
    if (method === "GET" && path === "/technicians") return json({
      items: [{ id: technicianId, code: "TEC-014", fullName: "Ana López", status: "AVAILABLE" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    if (method === "GET" && path === "/clients") return json({
      items: [{ id: clientId, code: "CLI-014", tradeName: "Cliente Norte" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    if (method === "GET" && path === `/clients/${clientId}/branches`) return json({
      items: [{ id: branchId, code: "SUC-014", name: "Sucursal Centro" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    if (method === "GET" && path === `/recurrences/${recurrenceId}/evidences`) return json({
      items: uploaded ? [evidence] : [],
      pagination: { page: 1, pageSize: 20, totalItems: uploaded ? 1 : 0, totalPages: uploaded ? 1 : 0 },
    });
    if (method === "GET" && path === `/evidences/${evidence.id}/download`) return new Response("%PDF-1.7", {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="enlace-router.pdf"' },
    });
    if (method === "POST" && path === "/recurrences") {
      current = detail(1, "OPEN");
      return json(current);
    }
    if (method === "POST" && path === `/recurrences/${recurrenceId}/evidences`) {
      uploaded = true;
      return json(evidence);
    }
    if (method === "POST" && path === `/recurrences/${recurrenceId}/analysis`) {
      current = detail(2, "ANALYSIS");
      return json(current);
    }
    if (method === "POST" && path === `/recurrences/${recurrenceId}/correction`) {
      current = detail(3, "CORRECTION");
      return json(current);
    }
    if (method === "POST" && path === `/recurrences/${recurrenceId}/visits`) {
      current = detail(4, "CORRECTION");
      return json(current);
    }
    if (method === "POST" && path === `/recurrences/${recurrenceId}/notes`) {
      current = detail(4, "CORRECTION");
      return json(current);
    }
    if (method === "POST" && path === `/recurrences/${recurrenceId}/close`) {
      current = detail(5, "CLOSED");
      return json(current);
    }
    if (method === "POST" && path === `/recurrences/${recurrenceId}/adjust`) {
      current = detail(6, "CLOSED");
      return json(current);
    }
    throw new Error(`Solicitud no prevista: ${method} ${path}`);
  });
}

beforeEach(() => {
  current = null;
  uploaded = false;
  requests.length = 0;
  window.history.replaceState({}, "", "/reincidencias");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:recurrence") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  installFetchServer();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/resumen");
});

describe("flujo integrado de reincidencias", () => {
  it("lista, filtra y completa el ciclo versionado con evidencia y descarga", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AppShell />, { user: reviewer });

    await screen.findByRole("status", { name: "Sin casos" });
    await user.selectOptions(screen.getByLabelText("Estado"), "OPEN");
    await waitFor(() => expect(new URLSearchParams(window.location.search).getAll("recurrenceStatus")).toEqual(["OPEN"]));
    await waitFor(() => expect(requests.some(({ path }) => path.includes("/recurrences/summary?") && path.includes("status=OPEN"))).toBe(true));

    await user.click(screen.getByRole("button", { name: "Reportar reincidencia" }));
    const report = await screen.findByRole("dialog", { name: "Reportar reincidencia" });
    await user.type(within(report).getByRole("combobox", { name: "Orden original" }), "OT-ORIG");
    await user.click(await screen.findByRole("option", { name: /OT-ORIG-0042/ }));
    await user.type(within(report).getByRole("combobox", { name: "Orden correctiva" }), "OT-CORR");
    await user.click(await screen.findByRole("option", { name: /OT-CORR-0043/ }));
    await user.type(within(report).getByLabelText("Problema detectado"), "El enlace principal volvió a fallar");
    await user.click(within(report).getByRole("button", { name: "Reportar reincidencia" }));

    const evidenceDialog = await screen.findByRole("dialog", { name: "Agregar evidencia" });
    await user.upload(within(evidenceDialog).getByLabelText("Archivo de evidencia"), new File(["%PDF-1.7"], "enlace-router.pdf", { type: "application/pdf" }));
    await user.type(within(evidenceDialog).getByLabelText("Descripción"), "Lectura del enlace");
    await user.click(within(evidenceDialog).getByRole("button", { name: "Subir evidencia" }));

    const detailPanel = await screen.findByRole("dialog", { name: "Detalle de RI-2026-0042" });
    await user.click(within(detailPanel).getByRole("button", { name: "Gestionar evidencia" }));
    const manager = await screen.findByRole("dialog", { name: "Gestionar evidencia" });
    await user.click(await within(manager).findByRole("button", { name: "Descargar enlace-router.pdf" }));
    await user.click(within(manager).getByRole("button", { name: "Cerrar" }));

    await user.click(within(detailPanel).getByRole("button", { name: "Analizar caso" }));
    const analysis = await screen.findByRole("dialog", { name: "Analizar caso" });
    await user.selectOptions(within(analysis).getByLabelText("Causa"), causeId);
    await user.selectOptions(within(analysis).getByLabelText("Impacto"), "HIGH");
    await user.selectOptions(within(analysis).getByLabelText("Responsabilidad"), "EQUIPMENT");
    await user.type(within(analysis).getByLabelText("Análisis técnico"), "Se confirmó una falla intermitente del equipo");
    await user.click(within(analysis).getByRole("button", { name: "Guardar análisis" }));

    await user.click(await within(detailPanel).findByRole("button", { name: "Iniciar corrección" }));
    const correction = await screen.findByRole("dialog", { name: "Iniciar corrección" });
    await user.type(within(correction).getByLabelText("Acción correctiva"), "Sustituir equipo y certificar el enlace");
    await user.type(within(correction).getByLabelText("Acción preventiva"), "Monitorear potencia durante siete días");
    await user.click(within(correction).getByRole("button", { name: "Iniciar corrección" }));

    await user.click(await within(detailPanel).findByRole("button", { name: "Agregar visita" }));
    const visit = await screen.findByRole("dialog", { name: "Agregar visita" });
    await user.type(within(visit).getByRole("combobox", { name: "Orden de la visita" }), "OT-VISIT");
    await user.click(await screen.findByRole("option", { name: /OT-VISIT-0044/ }));
    await user.type(within(visit).getByLabelText("Observación"), "Validación posterior al reemplazo");
    await user.click(within(visit).getByRole("button", { name: "Agregar visita" }));

    await user.click(await within(detailPanel).findByRole("button", { name: "Agregar nota" }));
    const note = await screen.findByRole("dialog", { name: "Agregar nota" });
    await user.type(within(note).getByLabelText("Nota"), "Cliente confirma estabilidad durante 24 horas");
    await user.click(within(note).getByRole("button", { name: "Agregar nota" }));

    await user.click(await within(detailPanel).findByRole("button", { name: "Cerrar caso" }));
    const close = await screen.findByRole("dialog", { name: "Cerrar caso" });
    await user.click(within(close).getByRole("button", { name: "Confirmar cierre" }));

    await user.click(await within(detailPanel).findByRole("button", { name: "Ajustar caso" }));
    const adjustment = await screen.findByRole("dialog", { name: "Ajustar caso cerrado" });
    await user.type(within(adjustment).getByLabelText("Motivo del ajuste"), "Corrección validada por supervisión");
    await user.selectOptions(within(adjustment).getByLabelText("Impacto"), "MEDIUM");
    await user.click(within(adjustment).getByRole("button", { name: "Guardar ajuste" }));

    expect(await within(detailPanel).findByText("Registro operativo · v6")).toBeInTheDocument();
    const mutations = requests.filter(({ method, path }) => method === "POST" && path.includes("/recurrences"));
    expect(mutations.map(({ path, body }) => ({
      path: new URL(path, "http://local").pathname.replace("/api/v1", ""),
      version: body instanceof FormData ? body.get("version") : body?.version,
    }))).toEqual([
      { path: "/recurrences", version: undefined },
      { path: `/recurrences/${recurrenceId}/evidences`, version: null },
      { path: `/recurrences/${recurrenceId}/analysis`, version: 1 },
      { path: `/recurrences/${recurrenceId}/correction`, version: 2 },
      { path: `/recurrences/${recurrenceId}/visits`, version: 3 },
      { path: `/recurrences/${recurrenceId}/notes`, version: undefined },
      { path: `/recurrences/${recurrenceId}/close`, version: 4 },
      { path: `/recurrences/${recurrenceId}/adjust`, version: 5 },
    ]);
    expect(requests.find(({ path }) => path.includes("/evidences/evidence-1/download"))).toBeDefined();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recurrence");
    expect(requests.filter(({ method, path }) => method === "GET" && path.includes("/recurrences/summary")).length).toBeGreaterThan(6);
    expect(requests.filter(({ method, path }) => method === "GET" && /\/recurrences\?/.test(path)).length).toBeGreaterThan(6);
  }, 30_000);

  it("filtra el alcance global mediante opciones legibles y no anuncia un conteo ficticio", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AppShell />, { user: reviewer });
    await screen.findByRole("status", { name: "Sin casos" });

    expect(screen.queryByText("4", { selector: ".sidebar nav em" })).not.toBeInTheDocument();
    const technician = screen.getByRole("combobox", { name: "Técnico" });
    await user.type(technician, "Ana");
    await user.click(await screen.findByRole("option", { name: /Ana López.*TEC-014/ }));
    const client = screen.getByRole("combobox", { name: "Cliente" });
    await user.type(client, "Norte");
    await user.click(await screen.findByRole("option", { name: /Cliente Norte.*CLI-014/ }));
    const branch = screen.getByRole("combobox", { name: "Sucursal" });
    await user.type(branch, "Centro");
    await user.click(await screen.findByRole("option", { name: /Sucursal Centro.*SUC-014/ }));
    await user.click(screen.getByRole("button", { name: "Aplicar alcance" }));

    await waitFor(() => {
      const query = new URLSearchParams(window.location.search);
      expect(query.get("recurrenceTechnicianId")).toBe(technicianId);
      expect(query.get("recurrenceClientId")).toBe(clientId);
      expect(query.get("recurrenceBranchId")).toBe(branchId);
    });
    expect(screen.getByRole("combobox", { name: "Técnico" })).toHaveValue("Ana López · TEC-014");
    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveValue("Cliente Norte · CLI-014");
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("Sucursal Centro · SUC-014");
  });
});
