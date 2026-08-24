import { Prisma } from "../../generated/prisma/client.js";
import { describe, expect, it, vi } from "vitest";
import { createRecurrenceService } from "../../src/recurrences/recurrences.service.js";
import type {
  RecurrenceDetailRecord,
  RecurrenceFailureKind,
  RecurrenceMutationResult,
  RecurrencesRepository,
  RecurrenceSummaryRecord,
} from "../../src/recurrences/recurrences.repository.types.js";
import type {
  AddRecurrenceNoteInput,
  AddRecurrenceVisitInput,
  AdjustRecurrenceInput,
  AnalyzeRecurrenceInput,
  CloseRecurrenceInput,
  CorrectRecurrenceInput,
  DismissRecurrenceInput,
  RecurrenceActorContext,
  RecurrenceListFilters,
  ReportRecurrenceInput,
} from "../../src/recurrences/recurrences.types.js";

const fixedNow = new Date("2026-08-21T12:00:00.000Z");
const recurrenceId = "10000000-0000-4000-8000-000000000001";
const technicianId = "10000000-0000-4000-8000-000000000002";
const foreignTechnicianId = "10000000-0000-4000-8000-000000000003";
const absentRecurrenceId = "10000000-0000-4000-8000-000000000099";
const listFilters: RecurrenceListFilters = { page: 2, pageSize: 10 };
const reportInput: ReportRecurrenceInput = {
  originalOrderId: "20000000-0000-4000-8000-000000000001",
  correctionOrderId: "20000000-0000-4000-8000-000000000002",
  detectedProblem: "La falla reapareció",
};
const analyzeInput: AnalyzeRecurrenceInput = {
  version: 1,
  causeId: "30000000-0000-4000-8000-000000000001",
  impact: "HIGH",
  responsibility: "TECHNICAL_WORK",
  analysis: "Análisis técnico documentado",
  qualityDecisions: [{ technicianId, affectsQuality: true, justification: "Trabajo deficiente" }],
};
const correctInput: CorrectRecurrenceInput = { version: 1, correctiveAction: "Reparar instalación" };
const visitInput: AddRecurrenceVisitInput = { version: 1, orderId: reportInput.correctionOrderId };
const noteInput: AddRecurrenceNoteInput = { content: "Seguimiento técnico" };
const dismissInput: DismissRecurrenceInput = { version: 1, reason: "No atribuible" };
const closeInput: CloseRecurrenceInput = { version: 1 };
const adjustInput: AdjustRecurrenceInput = { version: 1, reason: "Corrección auditada" };

function actor(
  permissions: readonly string[],
  linkedTechnicianId: string | null = null,
): RecurrenceActorContext {
  return {
    userId: "40000000-0000-4000-8000-000000000001",
    technicianId: linkedTechnicianId,
    permissions,
    requestId: "request-1",
  };
}

function summaryRecord(): RecurrenceSummaryRecord {
  return {
    id: recurrenceId,
    recurrenceNumber: "RI-2026-0001",
    status: "ANALYSIS",
    impact: "HIGH",
    responsibility: "TECHNICAL_WORK",
    detectedProblem: reportInput.detectedProblem,
    detectedAt: fixedNow,
    additionalMinutes: 0,
    estimatedCost: new Prisma.Decimal("0"),
    createdAt: fixedNow,
    updatedAt: fixedNow,
    version: 1,
    ordenOriginal: { id: reportInput.originalOrderId, orderNumber: "OT-001" },
    causa: { id: analyzeInput.causeId, code: "INSTALL", name: "Instalación" },
    _count: { ordenes: 0, notas: 0 },
  } as RecurrenceSummaryRecord;
}

function detailRecord(): RecurrenceDetailRecord {
  return {
    ...summaryRecord(),
    analysis: analyzeInput.analysis,
    correctiveAction: null,
    preventiveAction: null,
    observations: null,
    ageOverrideReason: null,
    dismissalReason: null,
    dismissedAt: null,
    closedAt: null,
    ordenes: [],
    tecnicos: [{
      participation: "ORIGINAL_RESPONSIBLE",
      affectsQuality: true,
      justification: "Trabajo deficiente",
      tecnico: { id: technicianId, code: "TEC-001", fullName: "Ana Técnica" },
    }],
    notas: [],
    evidencias: [],
  } as RecurrenceDetailRecord;
}

function repositoryWith(
  mutation: RecurrenceMutationResult = { kind: "UPDATED", recurrence: detailRecord() },
): RecurrencesRepository {
  const detail = detailRecord();
  return {
    listCauses: vi.fn(async () => [{ id: analyzeInput.causeId, code: "INSTALL", name: "Instalación" }]),
    listRecurrences: vi.fn(async () => ({ items: [summaryRecord()], totalItems: 11 })),
    findRecurrence: vi.fn(async () => detail),
    reportRecurrence: vi.fn(async () => ({ kind: "CREATED" as const, recurrence: detail })),
    analyzeRecurrence: vi.fn(async () => mutation),
    correctRecurrence: vi.fn(async () => mutation),
    addVisit: vi.fn(async () => mutation),
    addNote: vi.fn(async () => mutation),
    dismissRecurrence: vi.fn(async () => mutation),
    closeRecurrence: vi.fn(async () => mutation),
    adjustClosedRecurrence: vi.fn(async () => mutation),
  };
}

function expectForbidden(operation: Promise<unknown>) {
  return expect(operation).rejects.toMatchObject({
    statusCode: 403,
    code: "FORBIDDEN",
    message: "No tiene permiso para realizar esta acción",
  });
}

function service(repository: RecurrencesRepository = repositoryWith()) {
  return createRecurrenceService(repository, () => fixedNow, 30);
}

// @ts-expect-error RecurrenceService must receive the validated environment threshold.
createRecurrenceService(repositoryWith(), () => fixedNow);

describe("RecurrenceService read permission matrix", () => {
  it.each([
    ["ADMIN", ["RECURRENCES_VIEW_ALL", "RECURRENCES_REVIEW"], null],
    ["SUPERVISOR", ["RECURRENCES_REVIEW"], null],
    ["view-all technician", ["RECURRENCES_VIEW_ALL", "RECURRENCES_VIEW_OWN"], technicianId],
    ["management technician", ["RECURRENCES_REVIEW", "RECURRENCES_VIEW_OWN"], technicianId],
  ] as const)("uses ALL scope for %s", async (_role, permissions, linkedTechnicianId) => {
    const repository = repositoryWith();
    const recurrenceService = service(repository);

    const result = await recurrenceService.list(listFilters, actor(permissions, linkedTechnicianId));
    await recurrenceService.get(recurrenceId, actor(permissions, linkedTechnicianId));

    expect(repository.listRecurrences).toHaveBeenCalledWith(listFilters, { kind: "ALL" });
    expect(repository.findRecurrence).toHaveBeenCalledWith(recurrenceId, { kind: "ALL" });
    expect(result).toMatchObject({
      pagination: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 },
      items: [{ id: recurrenceId, estimatedCost: "0.00" }],
    });
  });

  it("uses the linked technician scope for own catalog, list, and detail reads", async () => {
    const repository = repositoryWith();
    const recurrenceService = service(repository);
    const technician = actor(["RECURRENCES_VIEW_OWN"], technicianId);

    const catalog = await recurrenceService.getCatalog(technician);
    await recurrenceService.list(listFilters, technician);
    await recurrenceService.get(recurrenceId, technician);

    expect(catalog).toEqual({
      causes: [{ id: analyzeInput.causeId, code: "INSTALL", name: "Instalación" }],
      states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
      impacts: ["LOW", "MEDIUM", "HIGH"],
      responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
      transitions: [
        { command: "ANALYZE", from: "OPEN", to: "ANALYSIS" },
        { command: "START_CORRECTION", from: "ANALYSIS", to: "CORRECTION" },
        { command: "CLOSE", from: "CORRECTION", to: "CLOSED" },
        { command: "DISMISS", from: "OPEN", to: "DISMISSED" },
        { command: "DISMISS", from: "ANALYSIS", to: "DISMISSED" },
      ],
    });
    expect(repository.listRecurrences).toHaveBeenCalledWith(
      listFilters,
      { kind: "TECHNICIAN", technicianId },
    );
    expect(repository.findRecurrence).toHaveBeenCalledWith(
      recurrenceId,
      { kind: "TECHNICIAN", technicianId },
    );
  });

  it("keeps INTERNAL evidence metadata out of every technician detail hydration", async () => {
    const record = {
      ...detailRecord(),
      evidencias: [
        { id: "evidence-internal", originalName: "internal.pdf", mimeType: "application/pdf", sizeBytes: 10n, accessLevel: "INTERNAL", createdAt: fixedNow },
        { id: "evidence-technician", originalName: "technician.pdf", mimeType: "application/pdf", sizeBytes: 11n, accessLevel: "TECHNICIAN", createdAt: fixedNow },
      ],
    } as RecurrenceDetailRecord;
    const repository = repositoryWith({ kind: "UPDATED", recurrence: record });
    vi.mocked(repository.findRecurrence).mockResolvedValue(record);
    const recurrenceService = service(repository);
    const technician = actor(["RECURRENCES_VIEW_OWN"], technicianId);
    const management = actor(["RECURRENCES_REVIEW"], technicianId);

    const managementDetail = await recurrenceService.get(recurrenceId, management);
    const technicianDetail = await recurrenceService.get(recurrenceId, technician);
    const technicianNoteResult = await recurrenceService.addNote(recurrenceId, noteInput, technician);

    expect(managementDetail.evidences.map(({ id }) => id)).toEqual([
      "evidence-internal",
      "evidence-technician",
    ]);
    expect(technicianDetail.evidences.map(({ id }) => id)).toEqual(["evidence-technician"]);
    expect(technicianNoteResult.evidences.map(({ id }) => id)).toEqual(["evidence-technician"]);
  });

  it.each([
    ["unlinked technician", ["RECURRENCES_VIEW_OWN"], null],
    ["missing permission", [], technicianId],
  ] as const)("denies %s read access", async (_name, permissions, linkedTechnicianId) => {
    const recurrenceService = service();
    await expectForbidden(recurrenceService.list(listFilters, actor(permissions, linkedTechnicianId)));
  });

  it.each([
    ["absent", absentRecurrenceId, actor(["RECURRENCES_VIEW_OWN"], technicianId), { kind: "TECHNICIAN", technicianId }],
    ["out-of-scope", recurrenceId, actor(["RECURRENCES_VIEW_OWN"], foreignTechnicianId), { kind: "TECHNICIAN", technicianId: foreignTechnicianId }],
  ] as const)("returns RECURRENCE_NOT_FOUND for a %s recurrence", async (_scenario, id, currentActor, scope) => {
    const missing = repositoryWith();
    vi.mocked(missing.findRecurrence).mockResolvedValue(null);
    const recurrenceService = service(missing);

    await expect(recurrenceService.get(id, currentActor))
      .rejects.toMatchObject({ statusCode: 404, code: "RECURRENCE_NOT_FOUND", message: "El caso de reincidencia solicitado no existe" });
    expect(missing.findRecurrence).toHaveBeenCalledWith(id, scope);
  });
});

describe("RecurrenceService KPI revision processing", () => {
  it("processes durable revision requests after a successful close without failing the recurrence", async () => {
    const repository = repositoryWith();
    const processRevisionRequests = vi.fn(async () => { throw new Error("temporary KPI failure"); });
    const recurrenceService = createRecurrenceService(repository, () => fixedNow, 30, processRevisionRequests);

    await expect(recurrenceService.close(recurrenceId, closeInput, actor(["RECURRENCES_REVIEW"])))
      .resolves.toMatchObject({ id: recurrenceId });
    expect(processRevisionRequests).toHaveBeenCalledWith(10, fixedNow);
  });
});

describe("RecurrenceService write permission matrix", () => {
  const managementOperations = [
    ["analyze", (service: ReturnType<typeof createRecurrenceService>, currentActor: RecurrenceActorContext) => service.analyze(recurrenceId, analyzeInput, currentActor)],
    ["correct", (service: ReturnType<typeof createRecurrenceService>, currentActor: RecurrenceActorContext) => service.correct(recurrenceId, correctInput, currentActor)],
    ["add visit", (service: ReturnType<typeof createRecurrenceService>, currentActor: RecurrenceActorContext) => service.addVisit(recurrenceId, visitInput, currentActor)],
    ["dismiss", (service: ReturnType<typeof createRecurrenceService>, currentActor: RecurrenceActorContext) => service.dismiss(recurrenceId, dismissInput, currentActor)],
    ["close", (service: ReturnType<typeof createRecurrenceService>, currentActor: RecurrenceActorContext) => service.close(recurrenceId, closeInput, currentActor)],
    ["adjust", (service: ReturnType<typeof createRecurrenceService>, currentActor: RecurrenceActorContext) => service.adjust(recurrenceId, adjustInput, currentActor)],
  ] as const;

  it.each(managementOperations)("allows a reviewer to %s", async (_name, operation) => {
    const recurrenceService = service();
    await expect(operation(recurrenceService, actor(["RECURRENCES_REVIEW"], technicianId))).resolves.toMatchObject({ id: recurrenceId });
  });

  it.each(managementOperations)("denies a linked technician without review to %s", async (_name, operation) => {
    const recurrenceService = service();
    await expectForbidden(operation(recurrenceService, actor(["RECURRENCES_VIEW_OWN", "RECURRENCES_REPORT_OWN"], technicianId)));
  });

  it("passes the configured warning-days threshold to the analysis workflow", async () => {
    const repository = repositoryWith();
    const recurrenceService = createRecurrenceService(repository, () => fixedNow, 45);
    const reviewer = actor(["RECURRENCES_REVIEW"]);

    await recurrenceService.analyze(recurrenceId, analyzeInput, reviewer);

    expect(repository.analyzeRecurrence).toHaveBeenCalledWith(
      recurrenceId,
      analyzeInput,
      reviewer,
      fixedNow,
      45,
    );
  });

  it.each([
    ["reviewer", ["RECURRENCES_REVIEW"], null],
    ["linked reporting technician", ["RECURRENCES_REPORT_OWN"], technicianId],
  ] as const)("allows recurrence report for %s", async (_name, permissions, linkedTechnicianId) => {
    const repository = repositoryWith();
    const recurrenceService = service(repository);

    await expect(recurrenceService.report(reportInput, actor(permissions, linkedTechnicianId))).resolves.toMatchObject({ id: recurrenceId });
    expect(repository.reportRecurrence).toHaveBeenCalledWith(
      reportInput,
      actor(permissions, linkedTechnicianId),
      fixedNow,
    );
  });

  it.each([
    ["unlinked reporter", ["RECURRENCES_REPORT_OWN"], null],
    ["technician without reporting permission", ["RECURRENCES_VIEW_OWN"], technicianId],
  ] as const)("denies report from %s", async (_name, permissions, linkedTechnicianId) => {
    const recurrenceService = service();
    await expectForbidden(recurrenceService.report(reportInput, actor(permissions, linkedTechnicianId)));
  });

  it.each([
    ["reviewer", ["RECURRENCES_REVIEW"], null],
    ["linked visible technician", ["RECURRENCES_VIEW_OWN"], technicianId],
  ] as const)("allows a recurrence note from %s", async (_name, permissions, linkedTechnicianId) => {
    const recurrenceService = service();
    await expect(recurrenceService.addNote(recurrenceId, noteInput, actor(permissions, linkedTechnicianId))).resolves.toMatchObject({ id: recurrenceId });
  });

  it.each([
    ["unlinked report-only actor", ["RECURRENCES_REPORT_OWN"], null],
    ["linked reporter without view permission", ["RECURRENCES_REPORT_OWN"], technicianId],
  ] as const)("denies notes from %s", async (_name, permissions, linkedTechnicianId) => {
    const recurrenceService = service();
    await expectForbidden(recurrenceService.addNote(recurrenceId, noteInput, actor(permissions, linkedTechnicianId)));
  });
});

describe("RecurrenceService public failure policy", () => {
  it.each([
    ["RECURRENCE_NOT_FOUND", 404, "RECURRENCE_NOT_FOUND", "El caso de reincidencia solicitado no existe"],
    ["RECURRENCE_ORDER_NOT_FOUND", 404, "ORDER_NOT_FOUND", "La orden solicitada no existe"],
    ["RECURRENCE_CAUSE_NOT_FOUND", 404, "RECURRENCE_NOT_FOUND", "El caso de reincidencia solicitado no existe"],
    ["VERSION_CONFLICT", 409, "VERSION_CONFLICT", "La reincidencia fue modificada por otra operación"],
    ["INVALID_RECURRENCE_TRANSITION", 409, "INVALID_RECURRENCE_TRANSITION", "La transición de estado no es válida"],
    ["RECURRENCE_ORDER_MISMATCH", 409, "RECURRENCE_ORDER_MISMATCH", "Las órdenes no pertenecen al mismo cliente y sucursal"],
    ["RECURRENCE_DUPLICATE", 409, "RECURRENCE_DUPLICATE", "La reincidencia o visita ya existe"],
    ["RECURRENCE_NUMBER_EXHAUSTED", 409, "RECURRENCE_NUMBER_EXHAUSTED", "La numeraciÃ³n anual de reincidencias estÃ¡ agotada"],
    ["RECURRENCE_VISIT_DUPLICATE", 409, "RECURRENCE_DUPLICATE", "La reincidencia o visita ya existe"],
    ["RECURRENCE_QUALITY_INVALID", 422, "RECURRENCE_DOCUMENTATION_INCOMPLETE", "La documentación de la reincidencia está incompleta"],
    ["RECURRENCE_DOCUMENTATION_INCOMPLETE", 422, "RECURRENCE_DOCUMENTATION_INCOMPLETE", "La documentación de la reincidencia está incompleta"],
    ["RECURRENCE_EVIDENCE_REQUIRED", 422, "RECURRENCE_EVIDENCE_REQUIRED", "La reincidencia requiere al menos una evidencia activa"],
  ] as const)("maps %s to the documented public error", async (kind, statusCode, code, message) => {
    const repository = repositoryWith({ kind: kind as RecurrenceFailureKind });
    const recurrenceService = service(repository);

    await expect(recurrenceService.analyze(recurrenceId, analyzeInput, actor(["RECURRENCES_REVIEW"])))
      .rejects.toMatchObject({ statusCode, code, message });
  });

  it("does not expose a raw persistence error as a public service message", async () => {
    const repository = repositoryWith();
    vi.mocked(repository.analyzeRecurrence).mockRejectedValue(
      new Error("Prisma failure: postgres://private-db/recurrente"),
    );
    const recurrenceService = service(repository);

    await expect(recurrenceService.analyze(recurrenceId, analyzeInput, actor(["RECURRENCES_REVIEW"])))
      .rejects.toMatchObject({ statusCode: 500, code: "INTERNAL_ERROR", message: "Ocurrió un error interno" });
  });
});
