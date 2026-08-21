import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createDatabaseClient } from "../../src/config/database.js";
import { createRecurrencesWorkflowRepository } from "../../src/recurrences/recurrences.workflow.repository.js";
import type {
  AnalyzeRecurrenceInput,
  RecurrenceActorContext,
} from "../../src/recurrences/recurrences.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const now = new Date("2026-08-20T15:30:00.000Z");
const ids = {
  reviewerUser: "85000000-0000-4000-8000-000000000001",
  visibleUser: "85000000-0000-4000-8000-000000000002",
  outsiderUser: "85000000-0000-4000-8000-000000000003",
  originalResponsible: "85000000-0000-4000-8000-000000000011",
  originalParticipant: "85000000-0000-4000-8000-000000000012",
  correctionParticipant: "85000000-0000-4000-8000-000000000013",
  addedParticipant: "85000000-0000-4000-8000-000000000014",
  outsiderTechnician: "85000000-0000-4000-8000-000000000015",
  client: "85000000-0000-4000-8000-000000000021",
  branch: "85000000-0000-4000-8000-000000000022",
  otherBranch: "85000000-0000-4000-8000-000000000023",
  serviceType: "85000000-0000-4000-8000-000000000024",
  originalOrder: "85000000-0000-4000-8000-000000000031",
  firstVisitOrder: "85000000-0000-4000-8000-000000000032",
  secondVisitOrder: "85000000-0000-4000-8000-000000000033",
  concurrentVisitOrder: "85000000-0000-4000-8000-000000000034",
  foreignBranchOrder: "85000000-0000-4000-8000-000000000035",
  cancelledOrder: "85000000-0000-4000-8000-000000000036",
  activeCause: "85000000-0000-4000-8000-000000000041",
  inactiveCause: "85000000-0000-4000-8000-000000000042",
  recurrence: "85000000-0000-4000-8000-000000000051",
} as const;

const reviewer: RecurrenceActorContext = {
  userId: ids.reviewerUser,
  technicianId: null,
  permissions: ["RECURRENCES_REVIEW"],
  requestId: "85000000-0000-4000-8000-000000000091",
};
const visibleTechnician: RecurrenceActorContext = {
  userId: ids.visibleUser,
  technicianId: ids.correctionParticipant,
  permissions: ["RECURRENCES_VIEW_OWN"],
  requestId: "85000000-0000-4000-8000-000000000092",
};
const outsider: RecurrenceActorContext = {
  userId: ids.outsiderUser,
  technicianId: ids.outsiderTechnician,
  permissions: ["RECURRENCES_VIEW_OWN"],
  requestId: "85000000-0000-4000-8000-000000000093",
};

function technicalAnalysis(overrides: Partial<AnalyzeRecurrenceInput> = {}): AnalyzeRecurrenceInput {
  return {
    version: 1,
    causeId: ids.activeCause,
    impact: "HIGH",
    responsibility: "TECHNICAL_WORK",
    analysis: "La terminación original dejó el conector sin asegurar.",
    qualityDecisions: [
      { technicianId: ids.originalResponsible, affectsQuality: true, justification: "El cierre técnico omitió la prueba de tracción." },
      { technicianId: ids.originalParticipant, affectsQuality: false },
    ],
    ageOverrideReason: "El cliente mantuvo el enlace fuera de servicio durante la remodelación.",
    estimatedCost: "125.50",
    costReason: "Estimación de conectores y nueva visita técnica.",
    ...overrides,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function cleanupFixture(): Promise<void> {
  await database.auditoria.deleteMany({ where: { entityId: ids.recurrence } });
  await database.reincidenciaNota.deleteMany({ where: { reincidenciaId: ids.recurrence } });
  await database.reincidenciaTecnico.deleteMany({ where: { reincidenciaId: ids.recurrence } });
  await database.reincidenciaOrden.deleteMany({ where: { reincidenciaId: ids.recurrence } });
  await database.reincidencia.deleteMany({ where: { id: ids.recurrence } });
  const orderIds = [
    ids.originalOrder,
    ids.firstVisitOrder,
    ids.secondVisitOrder,
    ids.concurrentVisitOrder,
    ids.foreignBranchOrder,
    ids.cancelledOrder,
  ];
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: orderIds } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: orderIds } } });
  await database.tecnico.deleteMany({ where: { id: { in: [
    ids.originalResponsible,
    ids.originalParticipant,
    ids.correctionParticipant,
    ids.addedParticipant,
    ids.outsiderTechnician,
  ] } } });
  await database.causaReincidencia.deleteMany({ where: { id: { in: [ids.activeCause, ids.inactiveCause] } } });
  await database.tipoServicio.deleteMany({ where: { id: ids.serviceType } });
  await database.sucursalCliente.deleteMany({ where: { id: { in: [ids.branch, ids.otherBranch] } } });
  await database.cliente.deleteMany({ where: { id: ids.client } });
  await database.usuario.deleteMany({ where: { id: { in: [ids.reviewerUser, ids.visibleUser, ids.outsiderUser] } } });
}

async function createFixture(): Promise<void> {
  await cleanupFixture();
  await database.usuario.createMany({ data: [
    { id: ids.reviewerUser, email: "workflow-reviewer@example.test", displayName: "Workflow reviewer", status: "ACTIVE" },
    { id: ids.visibleUser, email: "workflow-visible@example.test", displayName: "Visible technician", status: "ACTIVE" },
    { id: ids.outsiderUser, email: "workflow-outsider@example.test", displayName: "Outside technician", status: "ACTIVE" },
  ] });
  await database.tecnico.createMany({ data: [
    { id: ids.originalResponsible, code: "WF-01", fullName: "Original responsible" },
    { id: ids.originalParticipant, code: "WF-02", fullName: "Original participant" },
    { id: ids.correctionParticipant, userId: ids.visibleUser, code: "WF-03", fullName: "Correction participant" },
    { id: ids.addedParticipant, code: "WF-04", fullName: "Additional participant" },
    { id: ids.outsiderTechnician, userId: ids.outsiderUser, code: "WF-05", fullName: "Outside technician" },
  ] });
  await database.cliente.create({ data: { id: ids.client, code: "WF-CLIENT", tradeName: "Workflow Client" } });
  await database.sucursalCliente.createMany({ data: [
    { id: ids.branch, clienteId: ids.client, code: "WF-BRANCH", name: "Workflow branch", address: "Main avenue" },
    { id: ids.otherBranch, clienteId: ids.client, code: "WF-OTHER", name: "Other branch", address: "Other avenue" },
  ] });
  await database.tipoServicio.create({ data: { id: ids.serviceType, code: "WF-SERVICE", name: "Workflow service" } });
  await database.ordenTrabajo.createMany({ data: [
    { id: ids.originalOrder, orderNumber: "OT-WF-0001", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: new Date("2026-07-01T15:30:00.000Z"), reportedProblem: "Original problem" },
    { id: ids.firstVisitOrder, orderNumber: "OT-WF-0002", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "IN_PROGRESS", reportedProblem: "First recurrence visit" },
    { id: ids.secondVisitOrder, orderNumber: "OT-WF-0003", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "ASSIGNED", reportedProblem: "Second recurrence visit" },
    { id: ids.concurrentVisitOrder, orderNumber: "OT-WF-0004", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "PENDING", reportedProblem: "Concurrent recurrence visit" },
    { id: ids.foreignBranchOrder, orderNumber: "OT-WF-0005", sucursalId: ids.otherBranch, tipoServicioId: ids.serviceType, status: "ASSIGNED", reportedProblem: "Wrong branch" },
    { id: ids.cancelledOrder, orderNumber: "OT-WF-0006", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "CANCELLED", reportedProblem: "Cancelled visit" },
  ] });
  await database.ordenTecnico.createMany({ data: [
    { ordenId: ids.originalOrder, tecnicoId: ids.originalResponsible, role: "PRIMARY", assignedAt: new Date("2026-06-01T08:00:00.000Z"), unassignedAt: new Date("2026-07-02T08:00:00.000Z") },
    { ordenId: ids.originalOrder, tecnicoId: ids.originalParticipant, role: "SUPPORT", assignedAt: new Date("2026-06-05T08:00:00.000Z"), unassignedAt: new Date("2026-06-20T08:00:00.000Z") },
    { ordenId: ids.firstVisitOrder, tecnicoId: ids.correctionParticipant, role: "PRIMARY", assignedAt: new Date("2026-08-01T08:00:00.000Z") },
    { ordenId: ids.secondVisitOrder, tecnicoId: ids.correctionParticipant, role: "SUPPORT", assignedAt: new Date("2026-08-15T08:00:00.000Z") },
    { ordenId: ids.secondVisitOrder, tecnicoId: ids.addedParticipant, role: "PRIMARY", assignedAt: new Date("2026-08-15T08:00:00.000Z") },
    { ordenId: ids.concurrentVisitOrder, tecnicoId: ids.addedParticipant, role: "PRIMARY", assignedAt: new Date("2026-08-15T08:00:00.000Z") },
  ] });
  await database.causaReincidencia.createMany({ data: [
    { id: ids.activeCause, code: "WF-ACTIVE", name: "Active workflow cause" },
    { id: ids.inactiveCause, code: "WF-INACTIVE", name: "Inactive workflow cause", isActive: false },
  ] });
  await database.reincidencia.create({ data: {
    id: ids.recurrence,
    recurrenceNumber: "RI-2038-8501",
    originalOrderId: ids.originalOrder,
    reportedById: ids.visibleUser,
    status: "OPEN",
    detectedProblem: "The original failure returned.",
    detectedAt: now,
  } });
  await database.reincidenciaOrden.create({ data: { reincidenciaId: ids.recurrence, ordenId: ids.firstVisitOrder, visitNumber: 1 } });
  await database.reincidenciaTecnico.createMany({ data: [
    { reincidenciaId: ids.recurrence, tecnicoId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE" },
    { reincidenciaId: ids.recurrence, tecnicoId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT" },
    { reincidenciaId: ids.recurrence, tecnicoId: ids.correctionParticipant, participation: "CORRECTION_PARTICIPANT" },
  ] });
}

async function setAnalysisState(version = 1): Promise<void> {
  await database.reincidencia.update({ where: { id: ids.recurrence }, data: {
    status: "ANALYSIS",
    version,
    causeId: ids.activeCause,
    impact: "HIGH",
    responsibility: "TECHNICAL_WORK",
    analysis: "Existing root-cause analysis.",
    reviewedById: ids.reviewerUser,
    reviewedAt: new Date("2026-08-20T14:00:00.000Z"),
    ageOverrideReason: "Existing temporal justification.",
    estimatedCost: "100.00",
  } });
  await database.reincidenciaTecnico.update({
    where: { reincidenciaId_tecnicoId_participation: {
      reincidenciaId: ids.recurrence,
      tecnicoId: ids.originalResponsible,
      participation: "ORIGINAL_RESPONSIBLE",
    } },
    data: { affectsQuality: true, justification: "Existing quality decision." },
  });
}

beforeEach(createFixture);
afterEach(cleanupFixture);
afterAll(disconnectTestDatabase);

describe("recurrence analysis workflow persistence", () => {
  // Mutation caught: omitting any classification field, quality update, version bump, or audit field leaves a partial analysis.
  it("moves OPEN to ANALYSIS with complete original decisions and exact audit snapshots", async () => {
    const result = await createRecurrencesWorkflowRepository(database).analyzeRecurrence(
      ids.recurrence.toUpperCase(),
      technicalAnalysis({ causeId: ids.activeCause.toUpperCase() }),
      reviewer,
      now,
      30,
    );

    expect(result.kind).toBe("UPDATED");
    if (result.kind !== "UPDATED") throw new Error("analysis was rejected");
    expect(result.recurrence).toMatchObject({
      id: ids.recurrence,
      status: "ANALYSIS",
      version: 2,
      causa: { id: ids.activeCause },
      impact: "HIGH",
      responsibility: "TECHNICAL_WORK",
      analysis: "La terminación original dejó el conector sin asegurar.",
      ageOverrideReason: "El cliente mantuvo el enlace fuera de servicio durante la remodelación.",
    });
    expect(result.recurrence.estimatedCost.toFixed(2)).toBe("125.50");
    expect(result.recurrence).not.toHaveProperty("originalOrderId");
    expect(result.recurrence).not.toHaveProperty("causeId");
    expect(result.recurrence.tecnicos.map(({ tecnico, participation, affectsQuality, justification }) => ({
      technicianId: tecnico.id, participation, affectsQuality, justification,
    })).sort((left, right) => left.technicianId.localeCompare(right.technicianId))).toEqual([
      { technicianId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "El cierre técnico omitió la prueba de tracción." },
      { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
      { technicianId: ids.correctionParticipant, participation: "CORRECTION_PARTICIPANT", affectsQuality: false, justification: null },
    ]);
    expect(await database.auditoria.findFirstOrThrow({ where: { entityId: ids.recurrence, action: "RECURRENCE_ANALYZED" }, select: {
      userId: true, beforeData: true, afterData: true, reason: true, occurredAt: true, requestId: true,
    } })).toEqual({
      userId: ids.reviewerUser,
      beforeData: {
        status: "OPEN", version: 1, causeId: null, impact: "MEDIUM", responsibility: "UNDETERMINED",
        analysis: null, ageOverrideReason: null, estimatedCost: "0.00", reviewedById: null, reviewedAt: null,
        qualityDecisions: [
          { technicianId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: false, justification: null },
          { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
        ],
      },
      afterData: {
        status: "ANALYSIS", version: 2, causeId: ids.activeCause, impact: "HIGH", responsibility: "TECHNICAL_WORK",
        analysis: "La terminación original dejó el conector sin asegurar.",
        ageOverrideReason: "El cliente mantuvo el enlace fuera de servicio durante la remodelación.", estimatedCost: "125.50",
        reviewedById: ids.reviewerUser, reviewedAt: now.toISOString(),
        qualityDecisions: [
          { technicianId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "El cierre técnico omitió la prueba de tracción." },
          { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
        ],
      },
      reason: "Estimación de conectores y nueva visita técnica.",
      occurredAt: now,
      requestId: reviewer.requestId,
    });
  });

  // Mutation caught: treating ANALYSIS review as a transition-only command prevents corrections without moving backward.
  it("revises ANALYSIS in state and clears prior quality flags for nontechnical responsibility", async () => {
    await setAnalysisState(4);
    const result = await createRecurrencesWorkflowRepository(database).analyzeRecurrence(
      ids.recurrence,
      technicalAnalysis({
        version: 4,
        impact: "LOW",
        responsibility: "EQUIPMENT",
        analysis: "The transceiver failed independently of the prior labor.",
        qualityDecisions: [
          { technicianId: ids.originalResponsible, affectsQuality: false },
          { technicianId: ids.originalParticipant, affectsQuality: false },
        ],
        estimatedCost: "80.00",
        costReason: "Revised replacement-only estimate.",
      }),
      reviewer,
      now,
      30,
    );
    expect(result.kind).toBe("UPDATED");
    if (result.kind !== "UPDATED") throw new Error("analysis revision was rejected");
    expect(result.recurrence).toMatchObject({ status: "ANALYSIS", version: 5, responsibility: "EQUIPMENT" });
    expect(result.recurrence.tecnicos.filter(({ participation }) => participation !== "CORRECTION_PARTICIPANT").map(({ affectsQuality, justification }) => ({ affectsQuality, justification })))
      .toEqual([{ affectsQuality: false, justification: null }, { affectsQuality: false, justification: null }]);
  });

  // Mutation caught: boundary comparison using >= requires an override at exactly the warning threshold.
  it("accepts exactly warningDays without an age override reason", async () => {
    await database.ordenTrabajo.update({ where: { id: ids.originalOrder }, data: { endedAt: new Date("2026-07-21T15:30:00.000Z") } });
    const input = technicalAnalysis();
    delete input.ageOverrideReason;
    const result = await createRecurrencesWorkflowRepository(database).analyzeRecurrence(ids.recurrence, input, reviewer, now, 30);
    expect(result.kind).toBe("UPDATED");
  });

  it.each([
    ["inactive cause", () => technicalAnalysis({ causeId: ids.inactiveCause }), "RECURRENCE_CAUSE_NOT_FOUND"],
    ["undetermined responsibility", () => ({ ...technicalAnalysis(), responsibility: "UNDETERMINED" as never }), "RECURRENCE_QUALITY_INVALID"],
    ["missing original decision", () => technicalAnalysis({ qualityDecisions: [{ technicianId: ids.originalResponsible, affectsQuality: true, justification: "Only one decision." }] }), "RECURRENCE_QUALITY_INVALID"],
    ["correction technician decision", () => technicalAnalysis({ qualityDecisions: [
      { technicianId: ids.originalResponsible, affectsQuality: true, justification: "Responsible decision." },
      { technicianId: ids.correctionParticipant, affectsQuality: false },
    ] }), "RECURRENCE_QUALITY_INVALID"],
    ["technical work without quality impact", () => technicalAnalysis({ qualityDecisions: [
      { technicianId: ids.originalResponsible, affectsQuality: false },
      { technicianId: ids.originalParticipant, affectsQuality: false },
    ] }), "RECURRENCE_QUALITY_INVALID"],
    ["nontechnical quality impact", () => technicalAnalysis({ responsibility: "CLIENT", qualityDecisions: [
      { technicianId: ids.originalResponsible, affectsQuality: true, justification: "Would be invalid for client responsibility." },
      { technicianId: ids.originalParticipant, affectsQuality: false },
    ] }), "RECURRENCE_QUALITY_INVALID"],
    ["age warning without reason", () => {
      const input = technicalAnalysis(); delete input.ageOverrideReason; return input;
    }, "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["cost without reason", () => {
      const input = technicalAnalysis(); delete input.costReason; return input;
    }, "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
  ])("rejects %s without changing recurrence, snapshots, or audit", async (_label, makeInput, expectedKind) => {
    const result = await createRecurrencesWorkflowRepository(database).analyzeRecurrence(ids.recurrence, makeInput(), reviewer, now, 30);
    expect(result).toEqual({ kind: expectedKind });
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { status: true, version: true } })).toEqual({ status: "OPEN", version: 1 });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });

  // Mutation caught: trusting service-only permission checks lets a direct repository caller classify a case.
  it("returns the hidden not-found boundary to an actor without review permission", async () => {
    const result = await createRecurrencesWorkflowRepository(database).analyzeRecurrence(ids.recurrence, technicalAnalysis(), visibleTechnician, now, 30);
    expect(result).toEqual({ kind: "RECURRENCE_NOT_FOUND" });
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { status: true, version: true } })).toEqual({ status: "OPEN", version: 1 });
  });

  // Mutation caught: checking only id or version before the lock allows stale/concurrent reviewers to both persist.
  it("permits one concurrent reviewer and returns VERSION_CONFLICT to the stale reviewer", async () => {
    const secondClient = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    try {
      const [first, second] = await Promise.all([
        createRecurrencesWorkflowRepository(database).analyzeRecurrence(ids.recurrence, technicalAnalysis({ analysis: "First concurrent analysis wins if locked first." }), reviewer, now, 30),
        createRecurrencesWorkflowRepository(secondClient).analyzeRecurrence(ids.recurrence, technicalAnalysis({ analysis: "Second concurrent analysis wins if locked first." }), reviewer, now, 30),
      ]);
      expect([first.kind, second.kind].sort()).toEqual(["UPDATED", "VERSION_CONFLICT"]);
      expect(await database.auditoria.count({ where: { entityId: ids.recurrence, action: "RECURRENCE_ANALYZED" } })).toBe(1);
    } finally {
      await secondClient.$disconnect();
    }
  });

  // Mutation caught: committing domain and quality writes before audit leaves partial analysis on audit failure.
  it("rolls back analysis, decisions, and version when audit insertion fails", async () => {
    await database.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION recurrence_workflow_audit_test_failure()
      RETURNS trigger AS $$ BEGIN
        IF NEW.action = 'RECURRENCE_ANALYZED' THEN RAISE EXCEPTION 'forced RECURRENCE_ANALYZED audit failure'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS recurrence_workflow_audit_test_failure ON auditoria;
      CREATE TRIGGER recurrence_workflow_audit_test_failure BEFORE INSERT ON auditoria
      FOR EACH ROW EXECUTE FUNCTION recurrence_workflow_audit_test_failure();
    `);
    try {
      await expect(createRecurrencesWorkflowRepository(database).analyzeRecurrence(ids.recurrence, technicalAnalysis(), reviewer, now, 30))
        .rejects.toThrow("forced RECURRENCE_ANALYZED audit failure");
    } finally {
      await database.$executeRawUnsafe("DROP TRIGGER IF EXISTS recurrence_workflow_audit_test_failure ON auditoria; DROP FUNCTION IF EXISTS recurrence_workflow_audit_test_failure();");
    }
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { status: true, version: true, causeId: true } }))
      .toEqual({ status: "OPEN", version: 1, causeId: null });
    expect(await database.reincidenciaTecnico.count({ where: { reincidenciaId: ids.recurrence, affectsQuality: true } })).toBe(0);
  });
});

describe("recurrence correction workflow persistence", () => {
  beforeEach(() => setAnalysisState());

  // Mutation caught: using one generic action or resetting CORRECTION back to ANALYSIS loses correction history.
  it("starts correction, then updates it in state with exact actions and cost reasons", async () => {
    const repository = createRecurrencesWorkflowRepository(database);
    const started = await repository.correctRecurrence(ids.recurrence, {
      version: 1,
      correctiveAction: "Replace and secure the damaged transceiver.",
      preventiveAction: "Add a pull-test checklist to every closure.",
      observations: "Replacement approved by supervision.",
      estimatedCost: "175.00",
      costReason: "Approved replacement and travel estimate.",
    }, reviewer, now);
    expect(started.kind).toBe("UPDATED");
    if (started.kind !== "UPDATED") throw new Error("correction start was rejected");
    expect(started.recurrence).toMatchObject({ status: "CORRECTION", version: 2, correctiveAction: "Replace and secure the damaged transceiver." });

    const later = new Date("2026-08-20T16:30:00.000Z");
    const updated = await repository.correctRecurrence(ids.recurrence, {
      version: 2,
      correctiveAction: "Replace, secure, and certify the damaged transceiver.",
      preventiveAction: null,
      observations: null,
      estimatedCost: "200.00",
      costReason: "Final certified component estimate.",
    }, reviewer, later);
    expect(updated.kind).toBe("UPDATED");
    if (updated.kind !== "UPDATED") throw new Error("correction update was rejected");
    expect(updated.recurrence).toMatchObject({ status: "CORRECTION", version: 3, preventiveAction: null, observations: null });
    expect(await database.auditoria.findMany({ where: { entityId: ids.recurrence }, orderBy: { occurredAt: "asc" }, select: { action: true, reason: true, beforeData: true, afterData: true } }))
      .toEqual([
        {
          action: "RECURRENCE_CORRECTION_STARTED",
          reason: "Approved replacement and travel estimate.",
          beforeData: { status: "ANALYSIS", version: 1, correctiveAction: null, preventiveAction: null, observations: null, estimatedCost: "100.00" },
          afterData: { status: "CORRECTION", version: 2, correctiveAction: "Replace and secure the damaged transceiver.", preventiveAction: "Add a pull-test checklist to every closure.", observations: "Replacement approved by supervision.", estimatedCost: "175.00" },
        },
        {
          action: "RECURRENCE_CORRECTION_UPDATED",
          reason: "Final certified component estimate.",
          beforeData: { status: "CORRECTION", version: 2, correctiveAction: "Replace and secure the damaged transceiver.", preventiveAction: "Add a pull-test checklist to every closure.", observations: "Replacement approved by supervision.", estimatedCost: "175.00" },
          afterData: { status: "CORRECTION", version: 3, correctiveAction: "Replace, secure, and certify the damaged transceiver.", preventiveAction: null, observations: null, estimatedCost: "200.00" },
        },
      ]);
  });

  it.each([
    ["empty corrective action", { version: 1, correctiveAction: "   " }, "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["cost change without reason", { version: 1, correctiveAction: "Replace the failed part.", estimatedCost: "101.00" }, "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["reason without cost", { version: 1, correctiveAction: "Replace the failed part.", costReason: "Orphan reason." }, "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["stale version", { version: 8, correctiveAction: "Replace the failed part." }, "VERSION_CONFLICT"],
  ])("rejects %s without a partial correction or audit", async (_label, input, expectedKind) => {
    const result = await createRecurrencesWorkflowRepository(database).correctRecurrence(ids.recurrence, input, reviewer, now);
    expect(result).toEqual({ kind: expectedKind });
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { status: true, version: true, correctiveAction: true } }))
      .toEqual({ status: "ANALYSIS", version: 1, correctiveAction: null });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });
});

describe("recurrence visit workflow persistence", () => {
  // Mutation caught: replacing technician history or using count+1 loses old rows or collides after gaps.
  it("adds max visit plus one and only missing correction participants", async () => {
    await database.reincidenciaOrden.update({ where: { reincidenciaId_ordenId: { reincidenciaId: ids.recurrence, ordenId: ids.firstVisitOrder } }, data: { visitNumber: 4 } });
    const result = await createRecurrencesWorkflowRepository(database).addVisit(ids.recurrence, {
      version: 1, orderId: ids.secondVisitOrder.toUpperCase(), observation: "Second corrective crew visit.",
    }, reviewer, now);
    expect(result.kind).toBe("UPDATED");
    if (result.kind !== "UPDATED") throw new Error("visit was rejected");
    expect(result.recurrence).toMatchObject({ status: "OPEN", version: 2 });
    expect(result.recurrence.ordenes.map(({ visitNumber, orden, observation }) => ({ visitNumber, orderId: orden.id, observation })))
      .toEqual([
        { visitNumber: 4, orderId: ids.firstVisitOrder, observation: null },
        { visitNumber: 5, orderId: ids.secondVisitOrder, observation: "Second corrective crew visit." },
      ]);
    expect(await database.reincidenciaTecnico.findMany({ where: { reincidenciaId: ids.recurrence }, orderBy: [{ tecnicoId: "asc" }, { participation: "asc" }], select: { tecnicoId: true, participation: true } }))
      .toEqual([
        { tecnicoId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE" },
        { tecnicoId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT" },
        { tecnicoId: ids.correctionParticipant, participation: "CORRECTION_PARTICIPANT" },
        { tecnicoId: ids.addedParticipant, participation: "CORRECTION_PARTICIPANT" },
      ]);
    expect(await database.auditoria.findFirstOrThrow({ where: { entityId: ids.recurrence, action: "RECURRENCE_VISIT_ADDED" }, select: { beforeData: true, afterData: true, reason: true } }))
      .toEqual({
        beforeData: { status: "OPEN", version: 1, visitCount: 1 },
        afterData: { status: "OPEN", version: 2, visitCount: 2, visit: { orderId: ids.secondVisitOrder, visitNumber: 5, observation: "Second corrective crew visit." }, addedTechnicianIds: [ids.addedParticipant] },
        reason: null,
      });
  });

  it.each([
    ["foreign branch", ids.foreignBranchOrder, "RECURRENCE_ORDER_MISMATCH"],
    ["cancelled order", ids.cancelledOrder, "RECURRENCE_ORDER_MISMATCH"],
    ["duplicate order", ids.firstVisitOrder, "RECURRENCE_VISIT_DUPLICATE"],
  ])("rejects a %s visit without version, snapshot, visit, or audit writes", async (_label, orderId, expectedKind) => {
    const result = await createRecurrencesWorkflowRepository(database).addVisit(ids.recurrence, { version: 1, orderId }, reviewer, now);
    expect(result).toEqual({ kind: expectedKind });
    expect(await database.reincidenciaOrden.count({ where: { reincidenciaId: ids.recurrence } })).toBe(1);
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { version: true } })).toEqual({ version: 1 });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });

  // Mutation caught: failing to retry after the preliminary relationship set changes can reuse visit 2 or omit a lock.
  it("retries when a visit relation changes between the preliminary read and recurrence lock", async () => {
    const secondClient = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const preliminaryRead = deferred();
    const relationCommitted = deferred();
    let reads = 0;
    const repository = createRecurrencesWorkflowRepository(database, { hooks: {
      afterVisitRelationsRead: async () => {
        reads += 1;
        if (reads !== 1) return;
        preliminaryRead.resolve();
        await relationCommitted.promise;
      },
    } });
    try {
      const pending = repository.addVisit(ids.recurrence, { version: 1, orderId: ids.secondVisitOrder }, reviewer, now);
      await preliminaryRead.promise;
      await secondClient.reincidenciaOrden.create({ data: { reincidenciaId: ids.recurrence, ordenId: ids.concurrentVisitOrder, visitNumber: 2 } });
      relationCommitted.resolve();
      const result = await pending;
      expect(result.kind).toBe("UPDATED");
      expect(reads).toBeGreaterThan(1);
      expect(await database.reincidenciaOrden.findMany({ where: { reincidenciaId: ids.recurrence }, orderBy: { visitNumber: "asc" }, select: { ordenId: true, visitNumber: true } }))
        .toEqual([
          { ordenId: ids.firstVisitOrder, visitNumber: 1 },
          { ordenId: ids.concurrentVisitOrder, visitNumber: 2 },
          { ordenId: ids.secondVisitOrder, visitNumber: 3 },
        ]);
    } finally {
      relationCommitted.resolve();
      await secondClient.$disconnect();
    }
  });
});

describe("append-only recurrence notes", () => {
  // Mutation caught: updating recurrence for a note changes optimistic version or overwrites prior note history.
  it("lets management and a visible technician append notes without changing recurrence version or updatedAt", async () => {
    const before = await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { version: true, updatedAt: true } });
    const repository = createRecurrencesWorkflowRepository(database);
    const first = await repository.addNote(ids.recurrence, { content: "Supervisor note remains immutable." }, reviewer, now);
    const later = new Date("2026-08-20T17:30:00.000Z");
    const second = await repository.addNote(ids.recurrence, { content: "Visible technician follow-up." }, visibleTechnician, later);
    expect([first.kind, second.kind]).toEqual(["UPDATED", "UPDATED"]);
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { version: true, updatedAt: true } })).toEqual(before);
    expect(await database.reincidenciaNota.findMany({ where: { reincidenciaId: ids.recurrence }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { authorId: true, content: true, createdAt: true } }))
      .toEqual([
        { authorId: ids.reviewerUser, content: "Supervisor note remains immutable.", createdAt: now },
        { authorId: ids.visibleUser, content: "Visible technician follow-up.", createdAt: later },
      ]);
    expect(await database.auditoria.findMany({ where: { entityId: ids.recurrence, action: "RECURRENCE_NOTE_ADDED" }, orderBy: { occurredAt: "asc" }, select: { userId: true, beforeData: true, afterData: true, reason: true } }))
      .toEqual([
        { userId: ids.reviewerUser, beforeData: { status: "OPEN", version: 1, noteCount: 0 }, afterData: { status: "OPEN", version: 1, noteCount: 1, note: { id: expect.any(String), authorId: ids.reviewerUser, content: "Supervisor note remains immutable.", createdAt: now.toISOString() } }, reason: null },
        { userId: ids.visibleUser, beforeData: { status: "OPEN", version: 1, noteCount: 1 }, afterData: { status: "OPEN", version: 1, noteCount: 2, note: { id: expect.any(String), authorId: ids.visibleUser, content: "Visible technician follow-up.", createdAt: later.toISOString() } }, reason: null },
      ]);
  });

  // Mutation caught: accepting any linked user leaks existence and permits foreign note writes.
  it("returns the same hidden boundary for an outsider and an absent recurrence", async () => {
    const repository = createRecurrencesWorkflowRepository(database);
    expect(await repository.addNote(ids.recurrence, { content: "Foreign note." }, outsider, now)).toEqual({ kind: "RECURRENCE_NOT_FOUND" });
    expect(await repository.addNote(ids.recurrence, { content: "Reporter without technician context." }, {
      ...visibleTechnician,
      technicianId: null,
    }, now)).toEqual({ kind: "RECURRENCE_NOT_FOUND" });
    expect(await repository.addNote("85000000-0000-4000-8000-000000000099", { content: "Absent note." }, outsider, now)).toEqual({ kind: "RECURRENCE_NOT_FOUND" });
    expect(await database.reincidenciaNota.count({ where: { reincidenciaId: ids.recurrence } })).toBe(0);
  });

  it.each(["CLOSED", "DISMISSED"] as const)("rejects visits and notes for terminal %s cases", async (status) => {
    await database.reincidencia.update({ where: { id: ids.recurrence }, data: status === "CLOSED"
      ? { status, causeId: ids.activeCause, responsibility: "EQUIPMENT", analysis: "Closed analysis.", correctiveAction: "Closed correction.", closedAt: now, closedById: ids.reviewerUser }
      : { status, dismissedAt: now, dismissedById: ids.reviewerUser, dismissalReason: "Dismissed fixture reason." } });
    const repository = createRecurrencesWorkflowRepository(database);
    expect(await repository.addVisit(ids.recurrence, { version: 1, orderId: ids.secondVisitOrder }, reviewer, now)).toEqual({ kind: "INVALID_RECURRENCE_TRANSITION" });
    expect(await repository.addNote(ids.recurrence, { content: "Terminal note." }, reviewer, now)).toEqual({ kind: "INVALID_RECURRENCE_TRANSITION" });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });

  // Mutation caught: note/audit in separate transactions leaves an unaudited append when auditing fails.
  it("rolls back the appended note when its audit fails", async () => {
    await database.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION recurrence_note_audit_test_failure()
      RETURNS trigger AS $$ BEGIN
        IF NEW.action = 'RECURRENCE_NOTE_ADDED' THEN RAISE EXCEPTION 'forced RECURRENCE_NOTE_ADDED audit failure'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS recurrence_note_audit_test_failure ON auditoria;
      CREATE TRIGGER recurrence_note_audit_test_failure BEFORE INSERT ON auditoria
      FOR EACH ROW EXECUTE FUNCTION recurrence_note_audit_test_failure();
    `);
    try {
      await expect(createRecurrencesWorkflowRepository(database).addNote(ids.recurrence, { content: "Must roll back." }, reviewer, now))
        .rejects.toThrow("forced RECURRENCE_NOTE_ADDED audit failure");
    } finally {
      await database.$executeRawUnsafe("DROP TRIGGER IF EXISTS recurrence_note_audit_test_failure ON auditoria; DROP FUNCTION IF EXISTS recurrence_note_audit_test_failure();");
    }
    expect(await database.reincidenciaNota.count({ where: { reincidenciaId: ids.recurrence } })).toBe(0);
  });
});
