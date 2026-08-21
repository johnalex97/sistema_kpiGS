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

describe("RecurrenceService read permission matrix", () => {
  it.each([
    ["ADMIN", ["RECURRENCES_VIEW_ALL", "RECURRENCES_REVIEW"], null],
    ["SUPERVISOR", ["RECURRENCES_REVIEW"], null],
    ["view-all technician", ["RECURRENCES_VIEW_ALL", "RECURRENCES_VIEW_OWN"], technicianId],
    ["management technician", ["RECURRENCES_REVIEW", "RECURRENCES_VIEW_OWN"], technicianId],
  ] as const)("uses ALL scope for %s", async (_role, permissions, linkedTechnicianId) => {
    const repository = repositoryWith();
    const service = createRecurrenceService(repository, () => fixedNow);

    const result = await service.list(listFilters, actor(permissions, linkedTechnicianId));
    await service.get(recurrenceId, actor(permissions, linkedTechnicianId));

    expect(repository.listRecurrences).toHaveBeenCalledWith(listFilters, { kind: "ALL" });
    expect(repository.findRecurrence).toHaveBeenCalledWith(recurrenceId, { kind: "ALL" });
    expect(result).toMatchObject({
      pagination: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 },
      items: [{ id: recurrenceId, estimatedCost: "0.00" }],
    });
  });

  it("uses the linked technician scope for own catalog, list, and detail reads", async () => {
    const repository = repositoryWith();
    const service = createRecurrenceService(repository, () => fixedNow);
    const technician = actor(["RECURRENCES_VIEW_OWN"], technicianId);

    const catalog = await service.getCatalog(technician);
    await service.list(listFilters, technician);
    await service.get(recurrenceId, technician);

    expect(catalog).toEqual({ causes: [{ id: analyzeInput.causeId, code: "INSTALL", name: "Instalación" }] });
    expect(repository.listRecurrences).toHaveBeenCalledWith(
      listFilters,
      { kind: "TECHNICIAN", technicianId },
    );
    expect(repository.findRecurrence).toHaveBeenCalledWith(
      recurrenceId,
      { kind: "TECHNICIAN", technicianId },
    );
  });

  it.each([
    ["unlinked technician", ["RECURRENCES_VIEW_OWN"], null],
    ["missing permission", [], technicianId],
  ] as const)("denies %s read access", async (_name, permissions, linkedTechnicianId) => {
    const service = createRecurrenceService(repositoryWith(), () => fixedNow);
    await expectForbidden(service.list(listFilters, actor(permissions, linkedTechnicianId)));
  });

  it("returns the same recurrence-not-found envelope for an absent and an out-of-scope recurrence", async () => {
    const missing = repositoryWith();
    vi.mocked(missing.findRecurrence).mockResolvedValue(null);
    const service = createRecurrenceService(missing, () => fixedNow);

    await expect(service.get(recurrenceId, actor(["RECURRENCES_VIEW_OWN"], technicianId)))
      .rejects.toMatchObject({ statusCode: 404, code: "RECURRENCE_NOT_FOUND", message: "El caso de reincidencia solicitado no existe" });
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
    const service = createRecurrenceService(repositoryWith(), () => fixedNow);
    await expect(operation(service, actor(["RECURRENCES_REVIEW"], technicianId))).resolves.toMatchObject({ id: recurrenceId });
  });

  it.each(managementOperations)("denies a linked technician without review to %s", async (_name, operation) => {
    const service = createRecurrenceService(repositoryWith(), () => fixedNow);
    await expectForbidden(operation(service, actor(["RECURRENCES_VIEW_OWN", "RECURRENCES_REPORT_OWN"], technicianId)));
  });

  it("passes the configured warning-days threshold to the analysis workflow", async () => {
    const repository = repositoryWith();
    const service = createRecurrenceService(repository, () => fixedNow, 45);
    const reviewer = actor(["RECURRENCES_REVIEW"]);

    await service.analyze(recurrenceId, analyzeInput, reviewer);

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
    const service = createRecurrenceService(repository, () => fixedNow);

    await expect(service.report(reportInput, actor(permissions, linkedTechnicianId))).resolves.toMatchObject({ id: recurrenceId });
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
    const service = createRecurrenceService(repositoryWith(), () => fixedNow);
    await expectForbidden(service.report(reportInput, actor(permissions, linkedTechnicianId)));
  });

  it.each([
    ["reviewer", ["RECURRENCES_REVIEW"], null],
    ["linked visible technician", ["RECURRENCES_VIEW_OWN"], technicianId],
  ] as const)("allows a recurrence note from %s", async (_name, permissions, linkedTechnicianId) => {
    const service = createRecurrenceService(repositoryWith(), () => fixedNow);
    await expect(service.addNote(recurrenceId, noteInput, actor(permissions, linkedTechnicianId))).resolves.toMatchObject({ id: recurrenceId });
  });

  it.each([
    ["unlinked report-only actor", ["RECURRENCES_REPORT_OWN"], null],
    ["linked reporter without view permission", ["RECURRENCES_REPORT_OWN"], technicianId],
  ] as const)("denies notes from %s", async (_name, permissions, linkedTechnicianId) => {
    const service = createRecurrenceService(repositoryWith(), () => fixedNow);
    await expectForbidden(service.addNote(recurrenceId, noteInput, actor(permissions, linkedTechnicianId)));
  });
});

describe("RecurrenceService public failure policy", () => {
  it.each([
    ["RECURRENCE_NOT_FOUND", 404, "RECURRENCE_NOT_FOUND"],
    ["RECURRENCE_ORDER_NOT_FOUND", 404, "ORDER_NOT_FOUND"],
    ["RECURRENCE_CAUSE_NOT_FOUND", 404, "RECURRENCE_NOT_FOUND"],
    ["VERSION_CONFLICT", 409, "VERSION_CONFLICT"],
    ["INVALID_RECURRENCE_TRANSITION", 409, "INVALID_RECURRENCE_TRANSITION"],
    ["RECURRENCE_ORDER_MISMATCH", 409, "RECURRENCE_ORDER_MISMATCH"],
    ["RECURRENCE_DUPLICATE", 409, "RECURRENCE_DUPLICATE"],
    ["RECURRENCE_VISIT_DUPLICATE", 409, "RECURRENCE_DUPLICATE"],
    ["RECURRENCE_QUALITY_INVALID", 422, "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["RECURRENCE_DOCUMENTATION_INCOMPLETE", 422, "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["RECURRENCE_EVIDENCE_REQUIRED", 422, "RECURRENCE_EVIDENCE_REQUIRED"],
  ] as const)("maps %s to the documented public error", async (kind, statusCode, code) => {
    const repository = repositoryWith({ kind: kind as RecurrenceFailureKind });
    const service = createRecurrenceService(repository, () => fixedNow);

    await expect(service.analyze(recurrenceId, analyzeInput, actor(["RECURRENCES_REVIEW"])))
      .rejects.toMatchObject({ statusCode, code });
  });

  it("does not expose a raw persistence error as a public service message", async () => {
    const repository = repositoryWith();
    vi.mocked(repository.analyzeRecurrence).mockRejectedValue(
      new Error("Prisma failure: postgres://private-db/recurrente"),
    );
    const service = createRecurrenceService(repository, () => fixedNow);

    await expect(service.analyze(recurrenceId, analyzeInput, actor(["RECURRENCES_REVIEW"])))
      .rejects.toMatchObject({ statusCode: 500, code: "INTERNAL_ERROR", message: "Ocurrió un error interno" });
  });
});
