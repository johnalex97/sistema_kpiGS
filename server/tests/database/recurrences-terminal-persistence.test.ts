import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import { createDatabaseClient } from "../../src/config/database.js";
import { runRecurrenceSerializableTransaction } from "../../src/recurrences/recurrences.repository.helpers.js";
import { createRecurrencesWorkflowRepository } from "../../src/recurrences/recurrences.workflow.repository.js";
import type {
  AdjustRecurrenceInput,
  RecurrenceActorContext,
} from "../../src/recurrences/recurrences.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const now = new Date("2026-08-21T16:00:00.000Z");
const ids = {
  reviewerUser: "86000000-0000-4000-8000-000000000001",
  reporterUser: "86000000-0000-4000-8000-000000000002",
  originalResponsible: "86000000-0000-4000-8000-000000000011",
  originalParticipant: "86000000-0000-4000-8000-000000000012",
  correctionParticipant: "86000000-0000-4000-8000-000000000013",
  client: "86000000-0000-4000-8000-000000000021",
  branch: "86000000-0000-4000-8000-000000000022",
  serviceType: "86000000-0000-4000-8000-000000000023",
  activityType: "86000000-0000-4000-8000-000000000024",
  originalOrder: "86000000-0000-4000-8000-000000000031",
  firstCorrectionOrder: "86000000-0000-4000-8000-000000000032",
  secondCorrectionOrder: "86000000-0000-4000-8000-000000000033",
  activeCause: "86000000-0000-4000-8000-000000000041",
  alternateCause: "86000000-0000-4000-8000-000000000042",
  inactiveCause: "86000000-0000-4000-8000-000000000043",
  recurrence: "86000000-0000-4000-8000-000000000051",
  firstVisit: "86000000-0000-4000-8000-000000000061",
  secondVisit: "86000000-0000-4000-8000-000000000062",
  firstActivity: "86000000-0000-4000-8000-000000000071",
  secondActivity: "86000000-0000-4000-8000-000000000072",
  thirdActivity: "86000000-0000-4000-8000-000000000073",
  pendingActivity: "86000000-0000-4000-8000-000000000074",
  note: "86000000-0000-4000-8000-000000000081",
  evidence: "86000000-0000-4000-8000-000000000091",
} as const;

const actor: RecurrenceActorContext = {
  userId: ids.reviewerUser,
  technicianId: null,
  permissions: ["RECURRENCES_REVIEW"],
  requestId: "86000000-0000-4000-8000-000000000099",
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function deferredValue<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 1_500);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function waitForDatabaseLock(client: typeof database, backendPid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await client.$queryRaw<Array<{ waitEventType: string | null }>>`
      SELECT "wait_event_type" AS "waitEventType"
      FROM "pg_stat_activity"
      WHERE "pid" = ${backendPid}
    `;
    if (rows[0]?.waitEventType === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Backend ${backendPid} never waited on a database lock`);
}

async function waitForTaggedArchiveLock(client: typeof database): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await client.$queryRaw<Array<{ waiting: number }>>`
      SELECT COUNT(*)::int AS "waiting"
      FROM "pg_stat_activity"
      WHERE "query" LIKE '%recurrence archive race%'
        AND "wait_event_type" = 'Lock'
    `;
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Archive transaction never waited on the recurrence lock");
}

async function archiveRecurrenceEvidence(
  client: ReturnType<typeof createDatabaseClient>,
  hooks: { afterRecurrenceLocked?: () => Promise<void> } = {},
): Promise<"ARCHIVED" | "INVALID_RECURRENCE_TRANSITION"> {
  return runRecurrenceSerializableTransaction(client, async (transaction) => {
    const recurrenceRows = await transaction.$queryRaw<Array<{ status: string }>>`
      SELECT UPPER("status"::text) AS "status"
      FROM "reincidencia"
      WHERE "id" = ${ids.recurrence}::uuid
      /* recurrence archive race */
      FOR UPDATE
    `;
    await hooks.afterRecurrenceLocked?.();
    if (recurrenceRows[0]?.status === "CLOSED") return "INVALID_RECURRENCE_TRANSITION";
    await transaction.$queryRaw`
      SELECT "id"
      FROM "evidencia"
      WHERE "id" = ${ids.evidence}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    await transaction.evidencia.updateMany({
      where: { id: ids.evidence, deletedAt: null },
      data: { deletedAt: now, deletedById: ids.reviewerUser, deletionReason: "Concurrent archive won.", version: { increment: 1 } },
    });
    return "ARCHIVED";
  });
}

async function cleanupFixture(): Promise<void> {
  await database.auditoria.deleteMany({ where: { entityId: { in: [ids.recurrence, ids.evidence] } } });
  await database.evidencia.deleteMany({ where: { reincidenciaId: ids.recurrence } });
  await database.reincidenciaNota.deleteMany({ where: { reincidenciaId: ids.recurrence } });
  await database.reincidenciaTecnico.deleteMany({ where: { reincidenciaId: ids.recurrence } });
  await database.reincidenciaOrden.deleteMany({ where: { reincidenciaId: ids.recurrence } });
  await database.reincidencia.deleteMany({ where: { id: ids.recurrence } });
  const activityIds = [ids.firstActivity, ids.secondActivity, ids.thirdActivity, ids.pendingActivity];
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  const orderIds = [ids.originalOrder, ids.firstCorrectionOrder, ids.secondCorrectionOrder];
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: orderIds } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: orderIds } } });
  await database.causaReincidencia.deleteMany({ where: { id: { in: [ids.activeCause, ids.alternateCause, ids.inactiveCause] } } });
  await database.tipoActividad.deleteMany({ where: { id: ids.activityType } });
  await database.tecnico.deleteMany({ where: { id: { in: [ids.originalResponsible, ids.originalParticipant, ids.correctionParticipant] } } });
  await database.tipoServicio.deleteMany({ where: { id: ids.serviceType } });
  await database.sucursalCliente.deleteMany({ where: { id: ids.branch } });
  await database.cliente.deleteMany({ where: { id: ids.client } });
  await database.usuario.deleteMany({ where: { id: { in: [ids.reviewerUser, ids.reporterUser] } } });
}

async function createFixture(): Promise<void> {
  await cleanupFixture();
  await database.usuario.createMany({ data: [
    { id: ids.reviewerUser, email: "terminal-reviewer@example.test", displayName: "Terminal reviewer", status: "ACTIVE" },
    { id: ids.reporterUser, email: "terminal-reporter@example.test", displayName: "Terminal reporter", status: "ACTIVE" },
  ] });
  await database.tecnico.createMany({ data: [
    { id: ids.originalResponsible, code: "TR-01", fullName: "Original responsible" },
    { id: ids.originalParticipant, code: "TR-02", fullName: "Original participant" },
    { id: ids.correctionParticipant, code: "TR-03", fullName: "Correction participant" },
  ] });
  await database.cliente.create({ data: { id: ids.client, code: "TR-CLIENT", tradeName: "Terminal client" } });
  await database.sucursalCliente.create({ data: { id: ids.branch, clienteId: ids.client, code: "TR-BRANCH", name: "Terminal branch", address: "Terminal street" } });
  await database.tipoServicio.create({ data: { id: ids.serviceType, code: "TR-SERVICE", name: "Terminal service" } });
  await database.tipoActividad.create({ data: { id: ids.activityType, code: "TR-ACTIVITY", name: "Terminal activity" } });
  await database.ordenTrabajo.createMany({ data: [
    { id: ids.originalOrder, orderNumber: "OT-TR-0001", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: new Date("2026-08-01T10:00:00.000Z"), reportedProblem: "Original failure" },
    { id: ids.firstCorrectionOrder, orderNumber: "OT-TR-0002", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: new Date("2026-08-20T10:00:00.000Z"), reportedProblem: "First correction" },
    { id: ids.secondCorrectionOrder, orderNumber: "OT-TR-0003", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: new Date("2026-08-20T11:00:00.000Z"), reportedProblem: "Second correction" },
  ] });
  await database.causaReincidencia.createMany({ data: [
    { id: ids.activeCause, code: "TR-ACTIVE", name: "Active terminal cause" },
    { id: ids.alternateCause, code: "TR-ALT", name: "Alternate terminal cause" },
    { id: ids.inactiveCause, code: "TR-INACTIVE", name: "Inactive terminal cause", isActive: false },
  ] });
  await database.reincidencia.create({ data: {
    id: ids.recurrence,
    recurrenceNumber: "RI-2039-8601",
    originalOrderId: ids.originalOrder,
    causeId: ids.activeCause,
    reportedById: ids.reporterUser,
    reviewedById: ids.reviewerUser,
    reviewedAt: new Date("2026-08-20T12:00:00.000Z"),
    status: "CORRECTION",
    impact: "HIGH",
    responsibility: "TECHNICAL_WORK",
    detectedProblem: "Terminal workflow regression",
    detectedAt: new Date("2026-08-20T11:30:00.000Z"),
    analysis: "The original termination was not secured.",
    correctiveAction: "Replace and certify the termination.",
    preventiveAction: "Add a mandatory pull-test checklist.",
    observations: "Correction reviewed by supervision.",
    estimatedCost: "150.00",
    version: 3,
  } });
  await database.reincidenciaOrden.createMany({ data: [
    { id: ids.firstVisit, reincidenciaId: ids.recurrence, ordenId: ids.firstCorrectionOrder, visitNumber: 1, observation: "First correction visit" },
    { id: ids.secondVisit, reincidenciaId: ids.recurrence, ordenId: ids.secondCorrectionOrder, visitNumber: 2, observation: "Second correction visit" },
  ] });
  await database.reincidenciaTecnico.createMany({ data: [
    { reincidenciaId: ids.recurrence, tecnicoId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "The responsible technician omitted the pull test." },
    { reincidenciaId: ids.recurrence, tecnicoId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false },
    { reincidenciaId: ids.recurrence, tecnicoId: ids.correctionParticipant, participation: "CORRECTION_PARTICIPANT" },
  ] });
  await database.reincidenciaNota.create({ data: { id: ids.note, reincidenciaId: ids.recurrence, authorId: ids.reviewerUser, content: "Immutable terminal note." } });
  await database.actividad.createMany({ data: [
    { id: ids.firstActivity, sucursalId: ids.branch, ordenId: ids.firstCorrectionOrder, tipoActividadId: ids.activityType, status: "COMPLETED", description: "First completed activity", startedAt: new Date("2026-08-20T08:00:00.000Z"), endedAt: new Date("2026-08-20T08:30:00.000Z"), productiveMinutes: 30 },
    { id: ids.secondActivity, sucursalId: ids.branch, ordenId: ids.firstCorrectionOrder, tipoActividadId: ids.activityType, status: "COMPLETED", description: "Second completed activity", startedAt: new Date("2026-08-20T08:30:00.000Z"), endedAt: new Date("2026-08-20T08:50:00.000Z"), productiveMinutes: 20 },
    { id: ids.thirdActivity, sucursalId: ids.branch, ordenId: ids.secondCorrectionOrder, tipoActividadId: ids.activityType, status: "COMPLETED", description: "Third completed activity", startedAt: new Date("2026-08-20T09:00:00.000Z"), endedAt: new Date("2026-08-20T09:45:00.000Z"), productiveMinutes: 45 },
    { id: ids.pendingActivity, sucursalId: ids.branch, ordenId: ids.secondCorrectionOrder, tipoActividadId: ids.activityType, status: "PENDING", description: "Pending activity is not counted" },
  ] });
  await database.actividadTecnico.createMany({ data: [
    { actividadId: ids.firstActivity, tecnicoId: ids.originalResponsible, role: "RESPONSIBLE", participationPercentage: "50.00" },
    { actividadId: ids.firstActivity, tecnicoId: ids.correctionParticipant, role: "PARTICIPANT", participationPercentage: "50.00" },
    { actividadId: ids.secondActivity, tecnicoId: ids.correctionParticipant, role: "RESPONSIBLE", participationPercentage: "100.00" },
    { actividadId: ids.thirdActivity, tecnicoId: ids.correctionParticipant, role: "RESPONSIBLE", participationPercentage: "100.00" },
  ] });
  await database.evidencia.create({ data: {
    id: ids.evidence,
    originalName: "terminal-proof.pdf",
    storedName: "terminal-proof.pdf",
    mimeType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 10n,
    storageKey: "evidences/terminal/terminal-proof.pdf",
    checksumSha256: "a".repeat(64),
    uploadedById: ids.reviewerUser,
    reincidenciaId: ids.recurrence,
  } });
}

async function setDismissible(status: "OPEN" | "ANALYSIS" = "OPEN"): Promise<void> {
  await database.reincidencia.update({ where: { id: ids.recurrence }, data: { status, version: 3 } });
}

async function closeFixture(): Promise<void> {
  const result = await createRecurrencesWorkflowRepository(database).closeRecurrence(ids.recurrence, { version: 3 }, actor, now);
  if (result.kind !== "UPDATED") throw new Error(`fixture close failed: ${result.kind}`);
}

beforeEach(createFixture);
afterEach(cleanupFixture);
afterAll(disconnectTestDatabase);

describe("recurrence dismissal persistence", () => {
  // Mutation caught: a partial dismissal leaves a quality fact active or deletes immutable related history.
  it.each(["OPEN", "ANALYSIS"] as const)("DISMISS %s sets the exact triplet, clears every quality flag, and preserves linked history", async (status) => {
    await setDismissible(status);
    const beforeCounts = {
      orders: await database.reincidenciaOrden.count({ where: { reincidenciaId: ids.recurrence } }),
      technicians: await database.reincidenciaTecnico.count({ where: { reincidenciaId: ids.recurrence } }),
      notes: await database.reincidenciaNota.count({ where: { reincidenciaId: ids.recurrence } }),
      evidences: await database.evidencia.count({ where: { reincidenciaId: ids.recurrence } }),
    };

    const result = await createRecurrencesWorkflowRepository(database).dismissRecurrence(
      ids.recurrence,
      { version: 3, reason: "  Confirmed duplicate incident.  " },
      actor,
      now,
    );

    expect(result).toMatchObject({ kind: "UPDATED", recurrence: {
      status: "DISMISSED", version: 4, dismissalReason: "Confirmed duplicate incident.", dismissedAt: now,
    } });
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { dismissedById: true } }))
      .toEqual({ dismissedById: ids.reviewerUser });
    expect(await database.reincidenciaTecnico.findMany({ where: { reincidenciaId: ids.recurrence }, select: { affectsQuality: true, justification: true } }))
      .toEqual([
        { affectsQuality: false, justification: null },
        { affectsQuality: false, justification: null },
        { affectsQuality: false, justification: null },
      ]);
    expect({
      orders: await database.reincidenciaOrden.count({ where: { reincidenciaId: ids.recurrence } }),
      technicians: await database.reincidenciaTecnico.count({ where: { reincidenciaId: ids.recurrence } }),
      notes: await database.reincidenciaNota.count({ where: { reincidenciaId: ids.recurrence } }),
      evidences: await database.evidencia.count({ where: { reincidenciaId: ids.recurrence } }),
    }).toEqual(beforeCounts);
    const audit = await database.auditoria.findFirstOrThrow({ where: { entityId: ids.recurrence, action: "RECURRENCE_DISMISSED" }, select: { userId: true, entity: true, beforeData: true, afterData: true, reason: true, occurredAt: true, requestId: true } });
    expect(audit).toMatchObject({ userId: ids.reviewerUser, entity: "Reincidencia", reason: "Confirmed duplicate incident.", occurredAt: now, requestId: actor.requestId });
    expect(audit.beforeData).toEqual({
      status, version: 3, dismissalReason: null, dismissedById: null, dismissedAt: null,
      qualityDecisions: [
        { technicianId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "The responsible technician omitted the pull test." },
        { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
        { technicianId: ids.correctionParticipant, participation: "CORRECTION_PARTICIPANT", affectsQuality: false, justification: null },
      ],
    });
    expect(audit.afterData).toEqual({
      status: "DISMISSED", version: 4, dismissalReason: "Confirmed duplicate incident.", dismissedById: ids.reviewerUser, dismissedAt: now.toISOString(),
      qualityDecisions: [
        { technicianId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: false, justification: null },
        { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
        { technicianId: ids.correctionParticipant, participation: "CORRECTION_PARTICIPANT", affectsQuality: false, justification: null },
      ],
    });
  });

  // Mutation caught: DISMISS accepts CORRECTION, an empty reason, or writes an audit after a stale rejection.
  it("DISMISS rejects invalid state, reason, and stale version without an audit", async () => {
    const repository = createRecurrencesWorkflowRepository(database);
    expect(await repository.dismissRecurrence(ids.recurrence, { version: 3, reason: "Valid dismissal reason." }, actor, now)).toEqual({ kind: "INVALID_RECURRENCE_TRANSITION" });
    await setDismissible();
    expect(await repository.dismissRecurrence(ids.recurrence, { version: 3, reason: "   " }, actor, now)).toEqual({ kind: "RECURRENCE_DOCUMENTATION_INCOMPLETE" });
    expect(await repository.dismissRecurrence(ids.recurrence, { version: 2, reason: "Valid dismissal reason." }, actor, now)).toEqual({ kind: "VERSION_CONFLICT" });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });

  // Mutation caught: losing DISMISS requests can overwrite the winner or append a second audit.
  it("DISMISS concurrent version attempts have exactly one winner", async () => {
    await setDismissible("ANALYSIS");
    const repository = createRecurrencesWorkflowRepository(database);
    const results = await Promise.all([
      repository.dismissRecurrence(ids.recurrence, { version: 3, reason: "First concurrent reason." }, actor, now),
      repository.dismissRecurrence(ids.recurrence, { version: 3, reason: "Second concurrent reason." }, actor, now),
    ]);
    expect(results.map(({ kind }) => kind).sort()).toEqual(["UPDATED", "VERSION_CONFLICT"]);
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence, action: "RECURRENCE_DISMISSED" } })).toBe(1);
  });

  // Mutation caught: a failed RECURRENCE_DISMISSED audit leaves the terminal row or cleared quality flags committed.
  it("DISMISS rolls the state and quality decisions back when audit insertion fails", async () => {
    await setDismissible();
    await database.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION recurrence_dismiss_audit_test_failure()
      RETURNS trigger AS $$ BEGIN
        IF NEW.action = 'RECURRENCE_DISMISSED' THEN RAISE EXCEPTION 'forced RECURRENCE_DISMISSED audit failure'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS recurrence_dismiss_audit_test_failure ON auditoria;
      CREATE TRIGGER recurrence_dismiss_audit_test_failure BEFORE INSERT ON auditoria
      FOR EACH ROW EXECUTE FUNCTION recurrence_dismiss_audit_test_failure();
    `);
    try {
      await expect(createRecurrencesWorkflowRepository(database).dismissRecurrence(ids.recurrence, { version: 3, reason: "Rollback dismissal reason." }, actor, now))
        .rejects.toThrow("forced RECURRENCE_DISMISSED audit failure");
    } finally {
      await database.$executeRawUnsafe("DROP TRIGGER IF EXISTS recurrence_dismiss_audit_test_failure ON auditoria; DROP FUNCTION IF EXISTS recurrence_dismiss_audit_test_failure();");
    }
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { status: true, version: true, dismissedAt: true } }))
      .toEqual({ status: "OPEN", version: 3, dismissedAt: null });
    expect(await database.reincidenciaTecnico.findFirstOrThrow({ where: { reincidenciaId: ids.recurrence, tecnicoId: ids.originalResponsible }, select: { affectsQuality: true } }))
      .toEqual({ affectsQuality: true });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });
});

describe("recurrence closure persistence", () => {
  // Mutation caught: CLOSE multiplies one activity by its two team members or omits visit-level derived minutes.
  it("CLOSE derives 95 unique productive minutes and 50/45 per visit, then records exact terminal facts", async () => {
    const result = await createRecurrencesWorkflowRepository(database).closeRecurrence(ids.recurrence, { version: 3 }, actor, now);
    expect(result).toMatchObject({ kind: "UPDATED", recurrence: { status: "CLOSED", version: 4, additionalMinutes: 95, closedAt: now } });
    expect(await database.reincidenciaOrden.findMany({ where: { reincidenciaId: ids.recurrence }, orderBy: { visitNumber: "asc" }, select: { additionalMinutes: true } }))
      .toEqual([{ additionalMinutes: 50 }, { additionalMinutes: 45 }]);
    const audit = await database.auditoria.findFirstOrThrow({ where: { entityId: ids.recurrence, action: "RECURRENCE_CLOSED" }, select: { beforeData: true, afterData: true, reason: true } });
    expect(audit).toEqual({
      beforeData: { status: "CORRECTION", version: 3, additionalMinutes: 0, closedById: null, closedAt: null, visitMinutes: [{ orderId: ids.firstCorrectionOrder, additionalMinutes: 0 }, { orderId: ids.secondCorrectionOrder, additionalMinutes: 0 }] },
      afterData: { status: "CLOSED", version: 4, additionalMinutes: 95, closedById: ids.reviewerUser, closedAt: now.toISOString(), visitMinutes: [{ orderId: ids.firstCorrectionOrder, additionalMinutes: 50 }, { orderId: ids.secondCorrectionOrder, additionalMinutes: 45 }] },
      reason: null,
    });
  });

  // Mutation caught: CLOSE skips one of its terminal revalidations.
  it.each([
    ["inactive cause", async () => database.reincidencia.update({ where: { id: ids.recurrence }, data: { causeId: ids.inactiveCause } }), "RECURRENCE_CAUSE_NOT_FOUND"],
    ["undetermined responsibility", async () => database.reincidencia.update({ where: { id: ids.recurrence }, data: { responsibility: "UNDETERMINED" } }), "RECURRENCE_QUALITY_INVALID"],
    ["missing analysis", async () => database.reincidencia.update({ where: { id: ids.recurrence }, data: { analysis: " " } }), "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["missing corrective action", async () => database.reincidencia.update({ where: { id: ids.recurrence }, data: { correctiveAction: null } }), "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["missing required preventive action", async () => database.reincidencia.update({ where: { id: ids.recurrence }, data: { preventiveAction: "" } }), "RECURRENCE_DOCUMENTATION_INCOMPLETE"],
    ["invalid quality decisions", async () => database.reincidenciaTecnico.updateMany({ where: { reincidenciaId: ids.recurrence, participation: { not: "CORRECTION_PARTICIPANT" } }, data: { affectsQuality: false, justification: null } }), "RECURRENCE_QUALITY_INVALID"],
    ["zero active evidence", async () => database.evidencia.update({ where: { id: ids.evidence }, data: { deletedAt: now, deletedById: ids.reviewerUser, deletionReason: "Archived before closure." } }), "RECURRENCE_EVIDENCE_REQUIRED"],
    ["unfinished correction order", async () => database.ordenTrabajo.update({ where: { id: ids.secondCorrectionOrder }, data: { status: "IN_PROGRESS", endedAt: null } }), "RECURRENCE_ORDER_MISMATCH"],
  ] as const)("CLOSE rejects %s", async (_label, arrange, expected) => {
    await arrange();
    expect(await createRecurrencesWorkflowRepository(database).closeRecurrence(ids.recurrence, { version: 3 }, actor, now)).toEqual({ kind: expected });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });

  // Mutation caught: CLOSE omits/reorders its recurrence lock and can pass a stale evidence count while archive owns recurrence.
  it("CLOSE really waits when archive owns recurrence, then rejects the archived evidence", async () => {
    const archiveHasRecurrence = deferred();
    const releaseArchive = deferred();
    const closeBackendPid = deferredValue<number>();
    const connectionString = process.env.DATABASE_TEST_URL;
    if (connectionString === undefined) throw new Error("DATABASE_TEST_URL is required");
    const secondClient = createDatabaseClient(connectionString);
    const repository = createRecurrencesWorkflowRepository(database, { hooks: {
      afterCloseOrdersLocked: async ({ backendPid }) => {
        closeBackendPid.resolve(backendPid);
      },
    } });
    const pendingArchive = archiveRecurrenceEvidence(secondClient, { afterRecurrenceLocked: async () => {
      archiveHasRecurrence.resolve();
      await releaseArchive.promise;
    } });
    let pendingClose: ReturnType<ReturnType<typeof createRecurrencesWorkflowRepository>["closeRecurrence"]> | undefined;
    try {
      await within(archiveHasRecurrence.promise, "archive recurrence lock");
      pendingClose = repository.closeRecurrence(ids.recurrence, { version: 3 }, actor, now);
      const backendPid = await within(closeBackendPid.promise, "close transaction order lock");
      await waitForDatabaseLock(secondClient, backendPid);
      releaseArchive.resolve();
      await expect(pendingArchive).resolves.toBe("ARCHIVED");
      await expect(pendingClose).resolves.toEqual({ kind: "RECURRENCE_EVIDENCE_REQUIRED" });
      await expect(database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { status: true } })).resolves.toEqual({ status: "CORRECTION" });
    } finally {
      releaseArchive.resolve();
      await pendingArchive.catch(() => undefined);
      await pendingClose?.catch(() => undefined);
      await secondClient.$disconnect();
    }
  });

  // Mutation caught: CLOSE does not hold recurrence through evidence validation, allowing archive to invalidate a stale close.
  it("CLOSE owning recurrence makes archive wait, closes with active evidence, and leaves that evidence active", async () => {
    const closeHasRecurrence = deferred();
    const releaseClose = deferred();
    const connectionString = process.env.DATABASE_TEST_URL;
    if (connectionString === undefined) throw new Error("DATABASE_TEST_URL is required");
    const secondClient = createDatabaseClient(connectionString);
    const repository = createRecurrencesWorkflowRepository(database, { hooks: {
      afterCloseRecurrenceLocked: async () => {
        closeHasRecurrence.resolve();
        await releaseClose.promise;
      },
    } });
    const pendingClose = repository.closeRecurrence(ids.recurrence, { version: 3 }, actor, now);
    let pendingArchive: Promise<"ARCHIVED" | "INVALID_RECURRENCE_TRANSITION"> | undefined;
    try {
      await within(closeHasRecurrence.promise, "close recurrence lock");
      pendingArchive = archiveRecurrenceEvidence(secondClient);
      await waitForTaggedArchiveLock(database);
      releaseClose.resolve();
      await expect(pendingClose).resolves.toMatchObject({ kind: "UPDATED", recurrence: { status: "CLOSED", evidencias: [{ id: ids.evidence }] } });
      await expect(pendingArchive).resolves.toBe("INVALID_RECURRENCE_TRANSITION");
      await expect(database.evidencia.findUniqueOrThrow({ where: { id: ids.evidence }, select: { deletedAt: true, version: true } }))
        .resolves.toEqual({ deletedAt: null, version: 1 });
    } finally {
      releaseClose.resolve();
      await pendingClose.catch(() => undefined);
      await pendingArchive?.catch(() => undefined);
      await secondClient.$disconnect();
    }
  });

  // Mutation caught: two CLOSE requests with the same optimistic version both commit terminal audits.
  it("CLOSE concurrent version attempts have exactly one winner", async () => {
    const repository = createRecurrencesWorkflowRepository(database);
    const results = await Promise.all([
      repository.closeRecurrence(ids.recurrence, { version: 3 }, actor, now),
      repository.closeRecurrence(ids.recurrence, { version: 3 }, actor, now),
    ]);
    expect(results.map(({ kind }) => kind).sort()).toEqual(["UPDATED", "VERSION_CONFLICT"]);
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence, action: "RECURRENCE_CLOSED" } })).toBe(1);
  });

  // Mutation caught: stale CLOSE mutates minutes or leaves an audit, and an audit failure leaves a closed row.
  it("CLOSE rejects stale version and rolls the update/minutes back when audit insertion fails", async () => {
    const repository = createRecurrencesWorkflowRepository(database);
    expect(await repository.closeRecurrence(ids.recurrence, { version: 2 }, actor, now)).toEqual({ kind: "VERSION_CONFLICT" });
    await database.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION recurrence_close_audit_test_failure()
      RETURNS trigger AS $$ BEGIN
        IF NEW.action = 'RECURRENCE_CLOSED' THEN RAISE EXCEPTION 'forced RECURRENCE_CLOSED audit failure'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS recurrence_close_audit_test_failure ON auditoria;
      CREATE TRIGGER recurrence_close_audit_test_failure BEFORE INSERT ON auditoria
      FOR EACH ROW EXECUTE FUNCTION recurrence_close_audit_test_failure();
    `);
    try {
      await expect(repository.closeRecurrence(ids.recurrence, { version: 3 }, actor, now)).rejects.toThrow("forced RECURRENCE_CLOSED audit failure");
    } finally {
      await database.$executeRawUnsafe("DROP TRIGGER IF EXISTS recurrence_close_audit_test_failure ON auditoria; DROP FUNCTION IF EXISTS recurrence_close_audit_test_failure();");
    }
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { status: true, version: true, additionalMinutes: true } }))
      .toEqual({ status: "CORRECTION", version: 3, additionalMinutes: 0 });
    expect(await database.reincidenciaOrden.findMany({ where: { reincidenciaId: ids.recurrence }, orderBy: { visitNumber: "asc" }, select: { additionalMinutes: true } }))
      .toEqual([{ additionalMinutes: 0 }, { additionalMinutes: 0 }]);
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence } })).toBe(0);
  });
});

describe("closed recurrence adjustment persistence", () => {
  function adjustment(overrides: Partial<AdjustRecurrenceInput> = {}): AdjustRecurrenceInput {
    return {
      version: 4,
      reason: "Correct final classification after review.",
      causeId: ids.alternateCause,
      impact: "MEDIUM",
      responsibility: "EQUIPMENT",
      analysis: "A connector batch defect caused the recurrence.",
      correctiveAction: "Replace the affected connector batch.",
      preventiveAction: null,
      observations: "Administrative correction approved.",
      qualityDecisions: [
        { technicianId: ids.originalResponsible, affectsQuality: false },
        { technicianId: ids.originalParticipant, affectsQuality: false },
      ],
      estimatedCost: "200.00",
      costReason: "Corrected final invoice estimate.",
      ...overrides,
    };
  }

  // Mutation caught: ADJUST reopens the case, changes immutable history, or accepts caller-owned derived minutes.
  it("ADJUST updates only allowlisted closed facts, preserves immutable relations/closedAt, and audits exact snapshots", async () => {
    await closeFixture();
    const immutableBefore = await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: {
      recurrenceNumber: true,
      originalOrderId: true,
      reportedById: true,
      closedAt: true,
      ordenes: { orderBy: [{ visitNumber: "asc" }, { id: "asc" }], select: { id: true, ordenId: true, visitNumber: true, observation: true } },
      tecnicos: { orderBy: [{ tecnicoId: "asc" }, { participation: "asc" }], select: { id: true, tecnicoId: true, participation: true } },
      notas: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, authorId: true, content: true, createdAt: true } },
      evidencias: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, storageKey: true, deletedAt: true, version: true } },
    } });
    await database.actividad.update({ where: { id: ids.firstActivity }, data: { productiveMinutes: 35 } });
    await database.actividad.update({ where: { id: ids.thirdActivity }, data: { productiveMinutes: 40 } });
    const input = {
      ...adjustment(),
      recurrenceNumber: "RI-ILLEGAL",
      originalOrderId: ids.secondCorrectionOrder,
      reportedById: ids.reviewerUser,
      closedAt: new Date("2030-01-01T00:00:00.000Z"),
      additionalMinutes: 9999,
    } as unknown as AdjustRecurrenceInput;

    const result = await createRecurrencesWorkflowRepository(database).adjustClosedRecurrence(ids.recurrence, input, actor, now);
    expect(result).toMatchObject({ kind: "UPDATED", recurrence: {
      status: "CLOSED", version: 5, causa: { id: ids.alternateCause }, impact: "MEDIUM", responsibility: "EQUIPMENT",
      analysis: "A connector batch defect caused the recurrence.", correctiveAction: "Replace the affected connector batch.", preventiveAction: null,
      observations: "Administrative correction approved.", additionalMinutes: 95, estimatedCost: new Prisma.Decimal("200.00"), closedAt: immutableBefore.closedAt,
    } });
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: {
      recurrenceNumber: true,
      originalOrderId: true,
      reportedById: true,
      closedAt: true,
      ordenes: { orderBy: [{ visitNumber: "asc" }, { id: "asc" }], select: { id: true, ordenId: true, visitNumber: true, observation: true } },
      tecnicos: { orderBy: [{ tecnicoId: "asc" }, { participation: "asc" }], select: { id: true, tecnicoId: true, participation: true } },
      notas: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, authorId: true, content: true, createdAt: true } },
      evidencias: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, storageKey: true, deletedAt: true, version: true } },
    } })).toEqual(immutableBefore);
    const audit = await database.auditoria.findFirstOrThrow({ where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" }, select: { beforeData: true, afterData: true, reason: true } });
    expect(audit.reason).toBe("Correct final classification after review.");
    expect(audit.beforeData).toEqual({
      status: "CLOSED", version: 4, causeId: ids.activeCause, impact: "HIGH", responsibility: "TECHNICAL_WORK",
      analysis: "The original termination was not secured.", correctiveAction: "Replace and certify the termination.", preventiveAction: "Add a mandatory pull-test checklist.",
      observations: "Correction reviewed by supervision.", estimatedCost: "150.00", additionalMinutes: 95,
      visitMinutes: [
        { visitId: ids.firstVisit, orderId: ids.firstCorrectionOrder, visitNumber: 1, additionalMinutes: 50 },
        { visitId: ids.secondVisit, orderId: ids.secondCorrectionOrder, visitNumber: 2, additionalMinutes: 45 },
      ],
      qualityDecisions: [
        { technicianId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "The responsible technician omitted the pull test." },
        { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
      ],
    });
    expect(audit.afterData).toEqual({
      status: "CLOSED", version: 5, causeId: ids.alternateCause, impact: "MEDIUM", responsibility: "EQUIPMENT",
      analysis: "A connector batch defect caused the recurrence.", correctiveAction: "Replace the affected connector batch.", preventiveAction: null,
      observations: "Administrative correction approved.", estimatedCost: "200.00", additionalMinutes: 95,
      visitMinutes: [
        { visitId: ids.firstVisit, orderId: ids.firstCorrectionOrder, visitNumber: 1, additionalMinutes: 55 },
        { visitId: ids.secondVisit, orderId: ids.secondCorrectionOrder, visitNumber: 2, additionalMinutes: 40 },
      ],
      costReason: "Corrected final invoice estimate.",
      qualityDecisions: [
        { technicianId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: false, justification: null },
        { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
      ],
    });
  });

  // Mutation caught: ADJUST fabricates cost metadata when no estimated-cost change was requested.
  it("ADJUST keeps costReason absent from exact audit snapshots when cost does not change", async () => {
    await closeFixture();
    const result = await createRecurrencesWorkflowRepository(database).adjustClosedRecurrence(ids.recurrence, {
      version: 4,
      reason: "Clarify the final administrative observation.",
      observations: "Observation clarified without a cost change.",
    }, actor, now);
    expect(result).toMatchObject({ kind: "UPDATED", recurrence: { status: "CLOSED", version: 5, estimatedCost: new Prisma.Decimal("150.00") } });
    const audit = await database.auditoria.findFirstOrThrow({
      where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" },
      select: { beforeData: true, afterData: true, reason: true },
    });
    expect(audit.reason).toBe("Clarify the final administrative observation.");
    expect(audit.beforeData).not.toHaveProperty("costReason");
    expect(audit.afterData).not.toHaveProperty("costReason");
  });

  // Mutation caught: ADJUST treats a canonically equal submitted decimal as a real cost change.
  it("ADJUST omits costReason when the submitted estimated cost equals the persisted decimal", async () => {
    await closeFixture();
    const result = await createRecurrencesWorkflowRepository(database).adjustClosedRecurrence(ids.recurrence, {
      version: 4,
      reason: "Confirm the unchanged final estimate.",
      estimatedCost: "150.0",
      costReason: "Submitted estimate is canonically unchanged.",
    }, actor, now);
    expect(result).toMatchObject({ kind: "UPDATED", recurrence: { status: "CLOSED", version: 5, estimatedCost: new Prisma.Decimal("150.00") } });
    const audit = await database.auditoria.findFirstOrThrow({
      where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" },
      select: { beforeData: true, afterData: true, reason: true },
    });
    expect(audit.reason).toBe("Confirm the unchanged final estimate.");
    expect(audit.beforeData).not.toHaveProperty("costReason");
    expect(audit.afterData).not.toHaveProperty("costReason");
  });

  // Mutation caught: ADJUST validates costReason but drops it instead of preserving it separately from the general reason.
  it("ADJUST audits costReason separately while retaining the general adjustment reason", async () => {
    await closeFixture();
    const result = await createRecurrencesWorkflowRepository(database).adjustClosedRecurrence(ids.recurrence, adjustment(), actor, now);
    expect(result).toMatchObject({ kind: "UPDATED", recurrence: { estimatedCost: new Prisma.Decimal("200.00") } });
    const audit = await database.auditoria.findFirstOrThrow({
      where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" },
      select: { afterData: true, reason: true },
    });
    expect(audit.reason).toBe("Correct final classification after review.");
    expect(audit.afterData).toHaveProperty("costReason", "Corrected final invoice estimate.");
  });

  // Mutation caught: ADJUST accepts invalid quality/cost/reason or a non-closed case.
  it("ADJUST revalidates closed state, reason, quality, documentation, and paired cost", async () => {
    const repository = createRecurrencesWorkflowRepository(database);
    expect(await repository.adjustClosedRecurrence(ids.recurrence, adjustment({ version: 3 }), actor, now)).toEqual({ kind: "INVALID_RECURRENCE_TRANSITION" });
    await closeFixture();
    expect(await repository.adjustClosedRecurrence(ids.recurrence, adjustment({ reason: " " }), actor, now)).toEqual({ kind: "RECURRENCE_DOCUMENTATION_INCOMPLETE" });
    expect(await repository.adjustClosedRecurrence(ids.recurrence, adjustment({ analysis: "" }), actor, now)).toEqual({ kind: "RECURRENCE_DOCUMENTATION_INCOMPLETE" });
    expect(await repository.adjustClosedRecurrence(ids.recurrence, adjustment({ responsibility: "TECHNICAL_WORK", preventiveAction: "Keep the preventive checklist.", qualityDecisions: [
      { technicianId: ids.originalResponsible, affectsQuality: false },
      { technicianId: ids.originalParticipant, affectsQuality: false },
    ] }), actor, now)).toEqual({ kind: "RECURRENCE_QUALITY_INVALID" });
    const withoutCostReason = adjustment();
    delete withoutCostReason.costReason;
    expect(await repository.adjustClosedRecurrence(ids.recurrence, withoutCostReason, actor, now)).toEqual({ kind: "RECURRENCE_DOCUMENTATION_INCOMPLETE" });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" } })).toBe(0);
  });

  // Mutation caught: concurrent ADJUST requests both commit, or audit failure leaves adjusted data without a trail.
  it("ADJUST has one concurrent winner and rolls back a forced audit failure", async () => {
    await closeFixture();
    const repository = createRecurrencesWorkflowRepository(database);
    const concurrent = await Promise.all([
      repository.adjustClosedRecurrence(ids.recurrence, adjustment({ reason: "First concurrent adjustment." }), actor, now),
      repository.adjustClosedRecurrence(ids.recurrence, adjustment({ reason: "Second concurrent adjustment." }), actor, now),
    ]);
    expect(concurrent.map(({ kind }) => kind).sort()).toEqual(["UPDATED", "VERSION_CONFLICT"]);
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" } })).toBe(1);

    await database.auditoria.deleteMany({ where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" } });
    await database.reincidencia.update({ where: { id: ids.recurrence }, data: { version: 4, causeId: ids.activeCause, impact: "HIGH", responsibility: "TECHNICAL_WORK", analysis: "The original termination was not secured.", correctiveAction: "Replace and certify the termination.", preventiveAction: "Add a mandatory pull-test checklist.", observations: "Correction reviewed by supervision.", estimatedCost: "150.00" } });
    await database.reincidenciaTecnico.update({ where: { reincidenciaId_tecnicoId_participation: { reincidenciaId: ids.recurrence, tecnicoId: ids.originalResponsible, participation: "ORIGINAL_RESPONSIBLE" } }, data: { affectsQuality: true, justification: "The responsible technician omitted the pull test." } });
    await database.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION recurrence_adjust_audit_test_failure()
      RETURNS trigger AS $$ BEGIN
        IF NEW.action = 'RECURRENCE_ADJUSTED' THEN RAISE EXCEPTION 'forced RECURRENCE_ADJUSTED audit failure'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS recurrence_adjust_audit_test_failure ON auditoria;
      CREATE TRIGGER recurrence_adjust_audit_test_failure BEFORE INSERT ON auditoria
      FOR EACH ROW EXECUTE FUNCTION recurrence_adjust_audit_test_failure();
    `);
    try {
      await expect(repository.adjustClosedRecurrence(ids.recurrence, adjustment(), actor, now)).rejects.toThrow("forced RECURRENCE_ADJUSTED audit failure");
    } finally {
      await database.$executeRawUnsafe("DROP TRIGGER IF EXISTS recurrence_adjust_audit_test_failure ON auditoria; DROP FUNCTION IF EXISTS recurrence_adjust_audit_test_failure();");
    }
    expect(await database.reincidencia.findUniqueOrThrow({ where: { id: ids.recurrence }, select: { version: true, causeId: true, estimatedCost: true } }))
      .toEqual({ version: 4, causeId: ids.activeCause, estimatedCost: new Prisma.Decimal("150.00") });
    expect(await database.auditoria.count({ where: { entityId: ids.recurrence, action: "RECURRENCE_ADJUSTED" } })).toBe(0);
  });
});
