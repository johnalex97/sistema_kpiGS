import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createDatabaseClient } from "../../src/config/database.js";
import {
  lockOrdersInOrder,
  lockRecurrence,
  runRecurrenceSerializableTransaction,
} from "../../src/recurrences/recurrences.repository.helpers.js";
import {
  createRecurrencesReportRepository,
} from "../../src/recurrences/recurrences.report.repository.js";
import type {
  RecurrenceActorContext,
  ReportRecurrenceInput,
} from "../../src/recurrences/recurrences.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const now = new Date("2026-08-20T15:30:00.000Z");
const ids = {
  reporterUser: "84000000-0000-4000-8000-000000000001",
  reviewerUser: "84000000-0000-4000-8000-000000000002",
  reporterTechnician: "84000000-0000-4000-8000-000000000011",
  principalTechnician: "84000000-0000-4000-8000-000000000012",
  originalParticipant: "84000000-0000-4000-8000-000000000013",
  correctionParticipant: "84000000-0000-4000-8000-000000000014",
  client: "84000000-0000-4000-8000-000000000021",
  branch: "84000000-0000-4000-8000-000000000022",
  otherBranch: "84000000-0000-4000-8000-000000000023",
  serviceType: "84000000-0000-4000-8000-000000000024",
  originalOrder: "84000000-0000-4000-8000-00000000003a",
  correctionOrder: "84000000-0000-4000-8000-00000000003b",
  secondOriginalOrder: "84000000-0000-4000-8000-00000000003c",
  secondCorrectionOrder: "84000000-0000-4000-8000-00000000003d",
} as const;

const actor: RecurrenceActorContext = {
  userId: ids.reporterUser,
  technicianId: ids.reporterTechnician,
  permissions: [],
  requestId: "84000000-0000-4000-8000-000000000099",
};

let originalNumbers: Array<{ id: string; recurrenceNumber: string }> = [];
let originalSequences: Array<{ year: number; lastNumber: number }> = [];
let ambientSequenceBeforeSuite: number | null = null;

function input(
  originalOrderId: string = ids.originalOrder,
  correctionOrderId: string = ids.correctionOrder,
  detectedProblem: string = "El enlace volvió a fallar después del cierre",
): ReportRecurrenceInput {
  return { originalOrderId, correctionOrderId, detectedProblem };
}

async function cleanupFixtureData(): Promise<void> {
  const recurrenceRows = await database.reincidencia.findMany({
    where: {
      originalOrderId: {
        in: [ids.originalOrder, ids.secondOriginalOrder],
      },
    },
    select: { id: true },
  });
  const recurrenceIds = recurrenceRows.map(({ id }) => id);
  await database.auditoria.deleteMany({ where: { entityId: { in: recurrenceIds } } });
  await database.reincidenciaTecnico.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidenciaOrden.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidencia.deleteMany({ where: { id: { in: recurrenceIds } } });
  const orderIds = [ids.originalOrder, ids.correctionOrder, ids.secondOriginalOrder, ids.secondCorrectionOrder];
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: orderIds } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: orderIds } } });
  await database.secuenciaReincidencia.deleteMany({ where: { year: { in: [2026, 2027] } } });
  await database.tecnico.deleteMany({
    where: {
      id: {
        in: [ids.reporterTechnician, ids.principalTechnician, ids.originalParticipant, ids.correctionParticipant],
      },
    },
  });
  await database.tipoServicio.deleteMany({ where: { id: ids.serviceType } });
  await database.sucursalCliente.deleteMany({ where: { id: { in: [ids.branch, ids.otherBranch] } } });
  await database.cliente.deleteMany({ where: { id: ids.client } });
  await database.usuario.deleteMany({ where: { id: { in: [ids.reporterUser, ids.reviewerUser] } } });
}

async function createFixture(): Promise<void> {
  await cleanupFixtureData();
  await database.usuario.createMany({
    data: [
      { id: ids.reporterUser, email: "recurrence-report@example.test", displayName: "Report technician", status: "ACTIVE" },
      { id: ids.reviewerUser, email: "recurrence-review@example.test", displayName: "Quality reviewer", status: "ACTIVE" },
    ],
  });
  await database.tecnico.createMany({
    data: [
      { id: ids.reporterTechnician, userId: ids.reporterUser, code: "RPT-01", fullName: "Reporting technician" },
      { id: ids.principalTechnician, code: "RPT-02", fullName: "Original principal" },
      { id: ids.originalParticipant, code: "RPT-03", fullName: "Original participant" },
      { id: ids.correctionParticipant, code: "RPT-04", fullName: "Correction participant" },
    ],
  });
  await database.cliente.create({
    data: { id: ids.client, code: "RPT-CLIENT", tradeName: "Recurrence report client" },
  });
  await database.sucursalCliente.createMany({
    data: [
      { id: ids.branch, clienteId: ids.client, code: "RPT-BRANCH", name: "Report branch", address: "Main street" },
      { id: ids.otherBranch, clienteId: ids.client, code: "RPT-OTHER", name: "Other branch", address: "Other street" },
    ],
  });
  await database.tipoServicio.create({
    data: { id: ids.serviceType, code: "RPT-SERVICE", name: "Report service" },
  });
  await database.ordenTrabajo.createMany({
    data: [
      { id: ids.originalOrder, orderNumber: "OT-RPT-0001", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: new Date("2026-08-10T12:00:00.000Z"), reportedProblem: "Original problem" },
      { id: ids.correctionOrder, orderNumber: "OT-RPT-0002", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "IN_PROGRESS", reportedProblem: "Repeated problem" },
      { id: ids.secondOriginalOrder, orderNumber: "OT-RPT-0003", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: new Date("2026-08-11T12:00:00.000Z"), reportedProblem: "Second original" },
      { id: ids.secondCorrectionOrder, orderNumber: "OT-RPT-0004", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "ASSIGNED", reportedProblem: "Second correction" },
    ],
  });
  await database.ordenTecnico.createMany({
    data: [
      { ordenId: ids.originalOrder, tecnicoId: ids.principalTechnician, role: "PRIMARY", assignedAt: new Date("2026-08-01T08:00:00.000Z"), unassignedAt: new Date("2026-08-12T08:00:00.000Z") },
      { ordenId: ids.originalOrder, tecnicoId: ids.principalTechnician, role: "SUPPORT", assignedAt: new Date("2026-07-01T08:00:00.000Z"), unassignedAt: new Date("2026-07-02T08:00:00.000Z") },
      { ordenId: ids.originalOrder, tecnicoId: ids.originalParticipant, role: "SUPPORT", assignedAt: new Date("2026-08-02T08:00:00.000Z"), unassignedAt: new Date("2026-08-03T08:00:00.000Z") },
      { ordenId: ids.originalOrder, tecnicoId: ids.originalParticipant, role: "SUPPORT", assignedAt: new Date("2026-08-04T08:00:00.000Z"), unassignedAt: new Date("2026-08-05T08:00:00.000Z") },
      { ordenId: ids.correctionOrder, tecnicoId: ids.reporterTechnician, role: "SUPPORT", assignedAt: new Date("2026-08-13T08:00:00.000Z"), unassignedAt: new Date("2026-08-14T08:00:00.000Z") },
      { ordenId: ids.correctionOrder, tecnicoId: ids.correctionParticipant, role: "PRIMARY", assignedAt: new Date("2026-08-13T08:00:00.000Z") },
      { ordenId: ids.correctionOrder, tecnicoId: ids.originalParticipant, role: "SUPPORT", assignedAt: new Date("2026-09-01T08:00:00.000Z") },
      { ordenId: ids.secondOriginalOrder, tecnicoId: ids.principalTechnician, role: "PRIMARY", assignedAt: new Date("2026-08-01T08:00:00.000Z") },
      { ordenId: ids.secondCorrectionOrder, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: new Date("2026-08-13T08:00:00.000Z") },
    ],
  });
}

function twoPartyBarrier(): () => Promise<void> {
  let arrivals = 0;
  let release: () => void = () => undefined;
  const open = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrivals += 1;
    if (arrivals === 2) release();
    await open;
  };
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForAdvisoryWaiter(
  originalOrderId: string,
  correctionOrderId: string,
): Promise<void> {
  const pairKey = [originalOrderId.toLowerCase(), correctionOrderId.toLowerCase()]
    .sort((left, right) => left.localeCompare(right))
    .join(":");
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const rows = await database.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::integer AS "count"
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted = false
        AND classid = 1382541665::integer::oid
        AND objid = (hashtext(${pairKey})::bigint & 4294967295)::oid
        AND objsubid = 2
    `;
    if ((rows[0]?.count ?? 0) > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("second recurrence transaction never waited on the advisory pair lock");
}

function databaseWithTransactionStartBarrier(
  source: PrismaClient,
  barrier: () => Promise<void>,
): PrismaClient {
  return {
    reincidencia: source.reincidencia,
    $transaction: (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>, options: unknown) =>
      source.$transaction(async (transaction) => {
        await barrier();
        return operation(transaction);
      }, options as { isolationLevel: Prisma.TransactionIsolationLevel }),
  } as unknown as PrismaClient;
}

function knownRequestError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("transaction failed", {
    code,
    clientVersion: "7.9.1",
    ...(meta !== undefined && { meta }),
  });
}

function rawTransactionError(sqlState: string) {
  return knownRequestError("P2010", {
    driverAdapterError: { cause: { originalCode: sqlState, code: sqlState } },
  });
}

describe("recurrence atomic report persistence", () => {
  beforeAll(async () => {
    ambientSequenceBeforeSuite = (
      await database.secuenciaReincidencia.findUnique({ where: { year: 2026 } })
    )?.lastNumber ?? null;
    if (ambientSequenceBeforeSuite === null) {
      await database.secuenciaReincidencia.create({
        data: { year: 2026, lastNumber: 73 },
      });
    }
    originalNumbers = await database.reincidencia.findMany({
      where: {
        OR: [
          { recurrenceNumber: { startsWith: "RI-2026-" } },
          { recurrenceNumber: { startsWith: "RI-2027-" } },
        ],
      },
      select: { id: true, recurrenceNumber: true },
      orderBy: { recurrenceNumber: "asc" },
    });
    originalSequences = await database.secuenciaReincidencia.findMany({
      where: { year: { in: [2026, 2027] } },
      select: { year: true, lastNumber: true },
      orderBy: { year: "asc" },
    });
    for (const [index, original] of originalNumbers.entries()) {
      await database.reincidencia.update({
        where: { id: original.id },
        data: { recurrenceNumber: `RI-2999-${String(9000 + index).padStart(4, "0")}` },
      });
    }
  });
  beforeEach(createFixture);
  afterEach(cleanupFixtureData);
  afterAll(async () => {
    await cleanupFixtureData();
    for (const original of originalNumbers) {
      await database.reincidencia.update({
        where: { id: original.id },
        data: { recurrenceNumber: original.recurrenceNumber },
      });
    }
    for (const sequence of originalSequences) {
      await database.secuenciaReincidencia.create({ data: sequence });
    }
    expect(await database.secuenciaReincidencia.findMany({
      where: { year: { in: [2026, 2027] } },
      select: { year: true, lastNumber: true },
      orderBy: { year: "asc" },
    })).toEqual(originalSequences);
    expect(await database.reincidencia.findMany({
      where: { id: { in: originalNumbers.map(({ id }) => id) } },
      select: { id: true, recurrenceNumber: true },
      orderBy: { recurrenceNumber: "asc" },
    })).toEqual(originalNumbers);
    if (ambientSequenceBeforeSuite !== null) {
      await database.secuenciaReincidencia.upsert({
        where: { year: 2026 },
        create: { year: 2026, lastNumber: ambientSequenceBeforeSuite },
        update: { lastNumber: ambientSequenceBeforeSuite },
      });
    } else {
      await database.secuenciaReincidencia.deleteMany({ where: { year: 2026 } });
    }
    expect(await database.secuenciaReincidencia.findMany({
      where: { year: { in: [2026, 2027] } },
      select: { year: true, lastNumber: true },
      orderBy: { year: "asc" },
    })).toEqual(originalSequences.filter(({ year }) =>
      year !== 2026 || ambientSequenceBeforeSuite !== null));
    await disconnectTestDatabase();
  });

  // Mutation caught: deleting the sequence before capture loses the global seed state permanently.
  it("captures the original annual sequence before the first fixture cleanup", () => {
    expect(originalSequences).toContainEqual({
      year: 2026,
      lastNumber: ambientSequenceBeforeSuite ?? 73,
    });
  });

  // Mutation caught: hashing/comparing uppercase UUID text against lowercase PostgreSQL rows rejects a valid pair.
  it("canonicalizes uppercase order UUIDs before pair locking, lookup, and row comparison", async () => {
    const result = await createRecurrencesReportRepository(database).reportRecurrence(
      input(ids.originalOrder.toUpperCase(), ids.correctionOrder.toUpperCase()),
      actor,
      now,
    );
    expect(result.kind).toBe("CREATED");
    if (result.kind !== "CREATED") throw new Error("uppercase UUID report was rejected");
    expect(result.recurrence.ordenOriginal.id).toBe(ids.originalOrder);
    expect(result.recurrence.ordenes[0]?.orden.id).toBe(ids.correctionOrder);
  });

  // Mutation caught: a case-sensitive same-order check treats one UUID spelling as two orders.
  it("rejects one order supplied with equivalent lowercase and uppercase UUID spellings", async () => {
    const result = await createRecurrencesReportRepository(database).reportRecurrence(
      input(ids.originalOrder, ids.originalOrder.toUpperCase()),
      { ...actor, userId: ids.reviewerUser, technicianId: null, permissions: ["RECURRENCES_REVIEW"] },
      now,
    );
    expect(result).toEqual({ kind: "RECURRENCE_ORDER_MISMATCH" });
    expect(await database.secuenciaReincidencia.findUnique({ where: { year: 2026 } })).toBeNull();
  });

  // Mutation caught: allocating no annual sequence or skipping any snapshot/audit write leaves an incomplete report.
  it("creates number, OPEN case, first visit, deduplicated snapshots, and exact public audit atomically", async () => {
    const result = await createRecurrencesReportRepository(database).reportRecurrence(input(), actor, now);
    expect(result.kind).toBe("CREATED");
    if (result.kind !== "CREATED") throw new Error("recurrence report was rejected");
    expect(result.recurrence.recurrenceNumber).toBe("RI-2026-0001");
    expect(result.recurrence.status).toBe("OPEN");
    expect(result.recurrence).toMatchObject({
      impact: "MEDIUM",
      responsibility: "UNDETERMINED",
      detectedProblem: "El enlace volvió a fallar después del cierre",
      detectedAt: now,
      additionalMinutes: 0,
      version: 1,
      analysis: null,
      correctiveAction: null,
      preventiveAction: null,
      observations: null,
      ageOverrideReason: null,
      dismissalReason: null,
      dismissedAt: null,
      closedAt: null,
      causa: null,
      _count: { ordenes: 1, notas: 0 },
      notas: [],
      evidencias: [],
    });
    expect(result.recurrence.ordenes).toEqual([
      expect.objectContaining({ visitNumber: 1, orden: { id: ids.correctionOrder, orderNumber: "OT-RPT-0002" } }),
    ]);
    expect(result.recurrence.tecnicos).toEqual([
      expect.objectContaining({ participation: "CORRECTION_PARTICIPANT", tecnico: expect.objectContaining({ id: ids.reporterTechnician }) }),
      expect.objectContaining({ participation: "ORIGINAL_RESPONSIBLE", tecnico: expect.objectContaining({ id: ids.principalTechnician }) }),
      expect.objectContaining({ participation: "ORIGINAL_PARTICIPANT", tecnico: expect.objectContaining({ id: ids.originalParticipant }) }),
      expect.objectContaining({ participation: "CORRECTION_PARTICIPANT", tecnico: expect.objectContaining({ id: ids.correctionParticipant }) }),
    ]);
    expect(result.recurrence.tecnicos).toHaveLength(4);

    const audit = await database.auditoria.findFirstOrThrow({
      where: { entity: "Reincidencia", entityId: result.recurrence.id, action: "RECURRENCE_REPORTED" },
      select: { userId: true, requestId: true, beforeData: true, afterData: true, reason: true },
    });
    expect(audit).toEqual({
      userId: ids.reporterUser,
      requestId: actor.requestId,
      beforeData: null,
      reason: null,
      afterData: {
        recurrenceNumber: "RI-2026-0001",
        status: "OPEN",
        originalOrderId: ids.originalOrder,
        correctionOrderId: ids.correctionOrder,
        detectedProblem: "El enlace volvió a fallar después del cierre",
        detectedAt: now.toISOString(),
        visitNumber: 1,
        team: [
          { technicianId: ids.reporterTechnician, participation: "CORRECTION_PARTICIPANT" },
          { technicianId: ids.principalTechnician, participation: "ORIGINAL_RESPONSIBLE" },
          { technicianId: ids.originalParticipant, participation: "ORIGINAL_PARTICIPANT" },
          { technicianId: ids.correctionParticipant, participation: "CORRECTION_PARTICIPANT" },
        ],
      },
    });
  });

  // Mutation caught: returning physical raw enum labels breaks downstream state-machine comparisons.
  it("locks recurrence and order rows with Prisma enum names and deterministic UUID order", async () => {
    const recurrence = await database.reincidencia.create({
      data: {
        recurrenceNumber: "RI-2040-0001",
        originalOrderId: ids.originalOrder,
        reportedById: ids.reporterUser,
        status: "ANALYSIS",
        detectedProblem: "Lock helper fixture",
      },
    });
    await database.$transaction(async (transaction) => {
      const orders = await lockOrdersInOrder(transaction, [
        ids.correctionOrder.toUpperCase(),
        ids.originalOrder.toUpperCase(),
        ids.correctionOrder,
      ]);
      expect(orders.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: ids.originalOrder, status: "COMPLETED" },
        { id: ids.correctionOrder, status: "IN_PROGRESS" },
      ]);
      await expect(lockRecurrence(transaction, recurrence.id.toUpperCase())).resolves.toEqual({
        id: recurrence.id,
        status: "ANALYSIS",
        version: 1,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });

  // Mutation caught: removing one eligibility branch accepts invalid order pairs or invents responsibility.
  it.each([
    ["the same order twice", async () => input(ids.originalOrder, ids.originalOrder)],
    ["an original that is not completed", async () => {
      await database.ordenTrabajo.update({ where: { id: ids.originalOrder }, data: { status: "IN_PROGRESS" } });
      return input();
    }],
    ["a cancelled correction", async () => {
      await database.ordenTrabajo.update({ where: { id: ids.correctionOrder }, data: { status: "CANCELLED" } });
      return input();
    }],
    ["a soft-deleted correction", async () => {
      await database.ordenTrabajo.update({ where: { id: ids.correctionOrder }, data: { deletedAt: now } });
      return input();
    }],
    ["orders from different exact branches", async () => {
      await database.ordenTrabajo.update({ where: { id: ids.correctionOrder }, data: { sucursalId: ids.otherBranch } });
      return input();
    }],
    ["an original without a PRIMARY interval covering endedAt", async () => {
      await database.ordenTecnico.updateMany({
        where: { ordenId: ids.originalOrder, role: "PRIMARY" },
        data: { unassignedAt: new Date("2026-08-09T12:00:00.000Z") },
      });
      return input();
    }],
  ])("rejects %s without consuming RI-2026-0001", async (_label, arrange) => {
    const result = await createRecurrencesReportRepository(database).reportRecurrence(await arrange(), actor, now);
    expect(result).toEqual({ kind: "RECURRENCE_ORDER_MISMATCH" });
    expect(await database.secuenciaReincidencia.findUnique({ where: { year: 2026 } })).toBeNull();
  });

  // Mutation caught: checking only current correction assignments rejects valid historical participation or leaks authorization details.
  it("requires correction participation unless RECURRENCES_REVIEW safely bypasses it", async () => {
    const unauthorized = await createRecurrencesReportRepository(database).reportRecurrence(
      input(),
      { ...actor, technicianId: ids.originalParticipant },
      now,
    );
    expect(unauthorized).toEqual({ kind: "RECURRENCE_ORDER_MISMATCH" });
    expect(await database.secuenciaReincidencia.findUnique({ where: { year: 2026 } })).toBeNull();

    const reviewed = await createRecurrencesReportRepository(database).reportRecurrence(
      input(),
      { ...actor, userId: ids.reviewerUser, technicianId: null, permissions: ["RECURRENCES_REVIEW"] },
      now,
    );
    expect(reviewed.kind).toBe("CREATED");
    if (reviewed.kind === "CREATED") expect(reviewed.recurrence.recurrenceNumber).toBe("RI-2026-0001");
  });

  // Mutation caught: looking for the duplicate before the deterministic pair lock permits two live cases.
  it("blocks an existing OPEN, ANALYSIS, or CORRECTION pair but permits terminal history", async () => {
    for (const status of ["CLOSED", "DISMISSED"] as const) {
      const recurrence = await database.reincidencia.create({
        data: {
          recurrenceNumber: `RI-2030-${status === "CLOSED" ? "0001" : "0002"}`,
          originalOrderId: ids.originalOrder,
          reportedById: ids.reporterUser,
          status,
          detectedProblem: `${status} history`,
          detectedAt: new Date("2030-01-01T00:00:00.000Z"),
          ...(status === "CLOSED" ? { closedAt: new Date("2030-01-02T00:00:00.000Z"), closedById: ids.reviewerUser } : { dismissedAt: new Date("2030-01-02T00:00:00.000Z"), dismissedById: ids.reviewerUser, dismissalReason: "Not a recurrence" }),
        },
      });
      await database.reincidenciaOrden.create({ data: { reincidenciaId: recurrence.id, ordenId: ids.correctionOrder, visitNumber: 1 } });
    }
    const first = await createRecurrencesReportRepository(database).reportRecurrence(input(), actor, now);
    expect(first.kind).toBe("CREATED");
    const duplicate = await createRecurrencesReportRepository(database).reportRecurrence(input(), actor, now);
    expect(duplicate).toEqual({ kind: "RECURRENCE_DUPLICATE" });
    expect((await database.secuenciaReincidencia.findUniqueOrThrow({ where: { year: 2026 } })).lastNumber).toBe(1);
  });

  // Mutation caught: allowing audit failure to escape the transaction leaves partial case, visit, team, or sequence state.
  it("rolls back every report write and the annual allocation when audit creation fails", async () => {
    await database.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION recurrence_report_audit_test_failure()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'RECURRENCE_REPORTED' THEN
          RAISE EXCEPTION 'forced RECURRENCE_REPORTED audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS recurrence_report_audit_test_failure ON auditoria;
      CREATE TRIGGER recurrence_report_audit_test_failure
      BEFORE INSERT ON auditoria
      FOR EACH ROW EXECUTE FUNCTION recurrence_report_audit_test_failure();
    `);
    try {
      await expect(createRecurrencesReportRepository(database).reportRecurrence(input(), actor, now))
        .rejects.toThrow("forced RECURRENCE_REPORTED audit failure");
    } finally {
      await database.$executeRawUnsafe("DROP TRIGGER IF EXISTS recurrence_report_audit_test_failure ON auditoria; DROP FUNCTION IF EXISTS recurrence_report_audit_test_failure();");
    }
    const recurrences = await database.reincidencia.findMany({ where: { originalOrderId: ids.originalOrder }, select: { id: true } });
    expect(recurrences).toEqual([]);
    expect(await database.reincidenciaOrden.count({ where: { ordenId: ids.correctionOrder } })).toBe(0);
    expect(await database.reincidenciaTecnico.count({
      where: { reincidencia: { originalOrderId: ids.originalOrder } },
    })).toBe(0);
    expect(await database.secuenciaReincidencia.findUnique({ where: { year: 2026 } })).toBeNull();
  });

  // Mutation caught: hydrating after commit can reject the response after all report writes became durable.
  it("rolls back case, sequence, visit, snapshots, and audit when hydration fails after auditing", async () => {
    const repository = createRecurrencesReportRepository(database, {
      hooks: {
        beforeHydration: async () => {
          throw new Error("forced recurrence hydration failure");
        },
      },
    });
    await expect(repository.reportRecurrence(input(), actor, now))
      .rejects.toThrow("forced recurrence hydration failure");
    expect(await database.reincidencia.count({ where: { originalOrderId: ids.originalOrder } })).toBe(0);
    expect(await database.reincidenciaOrden.count({ where: { ordenId: ids.correctionOrder } })).toBe(0);
    expect(await database.reincidenciaTecnico.count({
      where: { reincidencia: { originalOrderId: ids.originalOrder } },
    })).toBe(0);
    expect(await database.auditoria.count({
      where: { entity: "Reincidencia", action: "RECURRENCE_REPORTED" },
    })).toBe(0);
    expect(await database.secuenciaReincidencia.findUnique({ where: { year: 2026 } })).toBeNull();
  });

  // Mutation caught: a non-atomic annual counter can duplicate or skip numbers under concurrent reports.
  it("forces concurrent different pairs to receive consecutive unique annual numbers", async () => {
    const barrier = twoPartyBarrier();
    const secondClient = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    try {
      const firstRepository = createRecurrencesReportRepository(databaseWithTransactionStartBarrier(database, barrier));
      const secondRepository = createRecurrencesReportRepository(databaseWithTransactionStartBarrier(secondClient, barrier));
      const results = await Promise.all([
        firstRepository.reportRecurrence(input(), actor, now),
        secondRepository.reportRecurrence(input(ids.secondOriginalOrder, ids.secondCorrectionOrder, "Second concurrent recurrence"), actor, now),
      ]);
      expect(results.map((result) => result.kind)).toEqual(["CREATED", "CREATED"]);
      expect(results.flatMap((result) => result.kind === "CREATED" ? [result.recurrence.recurrenceNumber] : []).sort())
        .toEqual(["RI-2026-0001", "RI-2026-0002"]);
    } finally {
      await secondClient.$disconnect();
    }
  });

  // Mutation caught: removing the pair advisory or moving lookup before it lets the second transaction cross lookup.
  it("keeps a different-year same-pair transaction before lookup until the advisory owner commits", async () => {
    const secondClient = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const firstSequence = deferred();
    const secondSequence = deferred();
    const firstPairLock = deferred();
    const secondBeforePairLock = deferred();
    const releaseFirst = deferred();
    let secondCrossedPairLock = false;
    let secondCrossedLookup = false;
    let firstReport: ReturnType<ReturnType<typeof createRecurrencesReportRepository>["reportRecurrence"]> | undefined;
    let secondReport: ReturnType<ReturnType<typeof createRecurrencesReportRepository>["reportRecurrence"]> | undefined;
    try {
      const firstRepository = createRecurrencesReportRepository(database, {
        hooks: {
          afterSequenceAllocated: async () => {
            firstSequence.resolve();
            await secondSequence.promise;
          },
          afterPairLock: async () => {
            firstPairLock.resolve();
            await releaseFirst.promise;
          },
        },
      });
      const secondRepository = createRecurrencesReportRepository(secondClient, {
        hooks: {
          afterSequenceAllocated: async () => {
            secondSequence.resolve();
            await firstSequence.promise;
            await firstPairLock.promise;
          },
          beforePairLock: async () => { secondBeforePairLock.resolve(); },
          afterPairLock: async () => { secondCrossedPairLock = true; },
          beforeDuplicateLookup: async () => { secondCrossedLookup = true; },
        },
      });
      firstReport = firstRepository.reportRecurrence(
        input(ids.originalOrder, ids.correctionOrder, "First advisory owner"),
        actor,
        now,
      );
      secondReport = secondRepository.reportRecurrence(
        input(ids.originalOrder, ids.correctionOrder, "Second advisory waiter"),
        actor,
        new Date("2027-08-20T15:30:00.000Z"),
      );
      await secondBeforePairLock.promise;
      await waitForAdvisoryWaiter(ids.originalOrder, ids.correctionOrder);
      expect(secondCrossedPairLock).toBe(false);
      expect(secondCrossedLookup).toBe(false);
      releaseFirst.resolve();
      const results = await Promise.all([firstReport, secondReport]);
      expect(results.map(({ kind }) => kind).sort()).toEqual(["CREATED", "RECURRENCE_DUPLICATE"]);
      expect(await database.reincidencia.count({ where: { originalOrderId: ids.originalOrder, status: { in: ["OPEN", "ANALYSIS", "CORRECTION"] } } })).toBe(1);
      expect((await database.secuenciaReincidencia.findUniqueOrThrow({ where: { year: 2026 } })).lastNumber).toBe(1);
      expect(await database.secuenciaReincidencia.findUnique({ where: { year: 2027 } })).toBeNull();
    } finally {
      releaseFirst.resolve();
      await Promise.allSettled([
        ...(firstReport === undefined ? [] : [firstReport]),
        ...(secondReport === undefined ? [] : [secondReport]),
      ]);
      await secondClient.$disconnect();
    }
  });
});

describe("recurrence serializable retry allowlist", () => {
  const operation = async () => "unused";

  it.each([
    ["P2034", knownRequestError("P2034")],
    ["P2010/40001", rawTransactionError("40001")],
    ["P2010/40P01", rawTransactionError("40P01")],
  ])("retries %s at most three attempts", async (_label, retryable) => {
    const transaction = vi.fn().mockRejectedValue(retryable);
    const fakeDatabase = { $transaction: transaction } as unknown as PrismaClient;
    await expect(runRecurrenceSerializableTransaction(fakeDatabase, operation)).rejects.toBe(retryable);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["plain errors", new Error("40001")],
    ["another Prisma code", knownRequestError("P2002")],
    ["P2010 with another driver SQLSTATE", rawTransactionError("23505")],
    ["P2010 with a lookalike message", knownRequestError("P2010", { message: "deadlock 40P01" })],
  ])("does not retry %s", async (_label, error) => {
    const transaction = vi.fn().mockRejectedValue(error);
    const fakeDatabase = { $transaction: transaction } as unknown as PrismaClient;
    await expect(runRecurrenceSerializableTransaction(fakeDatabase, operation)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
