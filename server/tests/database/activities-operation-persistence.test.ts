import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient } from "../../src/config/database.js";
import { createActivitiesMutationRepository } from "../../src/activities/activities.mutation.repository.js";
import { createActivitiesOperationRepository } from "../../src/activities/activities.operation.repository.js";
import { adjustActivitySchema } from "../../src/activities/activities.schemas.js";
import type { ActivityActorContext, CreateActivityInput } from "../../src/activities/activities.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const startedAt = new Date("2026-08-06T12:00:00.000Z");

interface Fixture {
  clientId: string;
  branchId: string;
  typeId: string;
  adjustmentTypeId: string;
  serviceTypeId: string;
  orderId: string;
  technicianId: string;
  otherTechnicianId: string;
  userId: string;
  actor: ActivityActorContext;
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.usuario.findUniqueOrThrow({
    where: { email: "admin.demo@geeksolution.example.test" }, select: { id: true },
  });
  const fixture = {
    clientId: randomUUID(), branchId: randomUUID(), typeId: randomUUID(), adjustmentTypeId: randomUUID(), serviceTypeId: randomUUID(), orderId: randomUUID(), technicianId: randomUUID(), otherTechnicianId: randomUUID(), userId: user.id,
    actor: { userId: user.id, technicianId: null, permissions: ["ACTIVITIES_MANAGE"], requestId: randomUUID() },
  };
  await database.cliente.create({ data: { id: fixture.clientId, code: `AO-${suffix}`, tradeName: "Cliente operación" } });
  await database.sucursalCliente.create({ data: { id: fixture.branchId, clienteId: fixture.clientId, code: "MAIN", name: "Principal", address: "Centro" } });
  await database.tipoActividad.create({ data: { id: fixture.typeId, code: `AOP-${suffix}`, name: "Operación" } });
  await database.tipoActividad.create({ data: { id: fixture.adjustmentTypeId, code: `AOA-${suffix}`, name: "Ajuste" } });
  await database.tecnico.create({ data: { id: fixture.technicianId, code: `AOT-${suffix}`, fullName: "Técnico operación" } });
  await database.tecnico.create({ data: { id: fixture.otherTechnicianId, code: `AOU-${suffix}`, fullName: "Segundo técnico" } });
  await database.tipoServicio.create({ data: { id: fixture.serviceTypeId, code: `AOS-${suffix}`, name: "Servicio de ajuste" } });
  await database.ordenTrabajo.create({ data: { id: fixture.orderId, orderNumber: `AO-${suffix}`, sucursalId: fixture.branchId, tipoServicioId: fixture.serviceTypeId, reportedProblem: "Ajuste histórico" } });
  await database.ordenTecnico.create({ data: { ordenId: fixture.orderId, tecnicoId: fixture.technicianId, role: "PRIMARY", assignedAt: new Date("2026-08-06T07:00:00.000Z"), unassignedAt: new Date("2026-08-06T08:00:00.000Z") } });
  return fixture;
}

function input(fixture: Fixture): CreateActivityInput {
  return {
    branchId: fixture.branchId,
    activityTypeId: fixture.typeId,
    description: "Iniciar cronómetro",
    team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
  };
}

async function createPendingActivity(fixture: Fixture): Promise<string> {
  const created = await createActivitiesMutationRepository(database).createActivity(input(fixture), fixture.actor, startedAt);
  if (created.kind !== "CREATED") throw new Error(`Expected pending activity, got ${created.kind}`);
  return created.activity.id;
}

interface AdvisoryLockRow {
  classid: bigint;
  objid: bigint;
  objsubid: bigint;
}

async function waitForBackendPid(readPid: () => number | undefined): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const pid = readPid();
    if (pid !== undefined) return pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The adjustment transaction did not expose its backend PID");
}

async function advisoryLockHeldBy(pid: number): Promise<AdvisoryLockRow> {
  const locks = await database.$queryRaw<AdvisoryLockRow[]>`
    SELECT classid, objid, objsubid
    FROM pg_locks
    WHERE locktype = 'advisory' AND pid = ${pid} AND granted = true
  `;
  if (locks.length !== 1) throw new Error("Expected exactly one advisory lock held by blocker");
  return locks[0]!;
}

async function waitForExactAdvisoryWaiter(
  pid: number,
  expected: AdvisoryLockRow,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const locks = await database.$queryRaw<Array<AdvisoryLockRow & { granted: boolean }>>`
      SELECT classid, objid, objsubid, granted
      FROM pg_locks
      WHERE locktype = 'advisory' AND pid = ${pid} AND granted = false
    `;
    if (locks.some((lock) => (
      lock.classid === expected.classid
      && lock.objid === expected.objid
      && lock.objsubid === expected.objsubid
    ))) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Adjustment backend ${pid} did not wait on the expected technician lock`);
}

async function removeFixture(fixture: Fixture): Promise<void> {
  const activityIds = (await database.actividad.findMany({ where: { sucursalId: fixture.branchId }, select: { id: true } })).map(({ id }) => id);
  await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } });
  await database.pausaActividad.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  await database.ordenTecnico.deleteMany({ where: { ordenId: fixture.orderId } });
  await database.ordenTrabajo.delete({ where: { id: fixture.orderId } });
  await database.tipoServicio.delete({ where: { id: fixture.serviceTypeId } });
  await database.tecnico.delete({ where: { id: fixture.technicianId } });
  await database.tecnico.delete({ where: { id: fixture.otherTechnicianId } });
  await database.tipoActividad.delete({ where: { id: fixture.typeId } });
  await database.tipoActividad.delete({ where: { id: fixture.adjustmentTypeId } });
  await database.sucursalCliente.delete({ where: { id: fixture.branchId } });
  await database.cliente.delete({ where: { id: fixture.clientId } });
}

describe("activities timer operation repository", () => {
  let fixture: Fixture;

  beforeAll(async () => { fixture = await createFixture(); });
  afterEach(async () => {
    const activityIds = (await database.actividad.findMany({ where: { sucursalId: fixture.branchId }, select: { id: true } })).map(({ id }) => id);
    await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } });
    await database.pausaActividad.deleteMany({ where: { actividadId: { in: activityIds } } });
    await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
    await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  });
  afterAll(async () => { await removeFixture(fixture); await disconnectTestDatabase(); });

  it("starts a pending activity with the injected server time on the whole team and one audit/version increment", async () => {
    const created = await createActivitiesMutationRepository(database).createActivity({
      ...input(fixture),
      team: [
        { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "50.00" },
        { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
      ],
    }, fixture.actor, startedAt);
    if (created.kind !== "CREATED") throw new Error("Expected pending team activity");
    const id = created.activity.id;
    const result = await createActivitiesOperationRepository(database).startActivity(id, { version: 1 }, fixture.actor, startedAt);

    expect(result).toMatchObject({ kind: "UPDATED", activity: { id, status: "IN_PROGRESS", startedAt, version: 2 } });
    if (result.kind !== "UPDATED") return;
    expect(result.activity.tecnicos.map(({ tecnico, startedAt: memberStartedAt, endedAt }) => ({
      technicianId: tecnico.id, startedAt: memberStartedAt, endedAt,
    }))).toEqual([
      { technicianId: fixture.technicianId, startedAt, endedAt: null },
      { technicianId: fixture.otherTechnicianId, startedAt, endedAt: null },
    ]);
    await expect(database.auditoria.count({ where: { entity: "Actividad", entityId: id, action: "ACTIVITY_STARTED" } })).resolves.toBe(1);
  });

  it("rejects a persisted team whose exact credit total is invalid without changing it or auditing", async () => {
    const invalid = await database.actividad.create({
      data: {
        sucursalId: fixture.branchId,
        tipoActividadId: fixture.typeId,
        status: "PENDING",
        description: "Equipo con crédito inválido",
        tecnicos: {
          create: [{
            tecnicoId: fixture.technicianId,
            role: "RESPONSIBLE",
            participationPercentage: "99.99",
          }],
        },
      },
      select: { id: true },
    });
    const snapshot = () => database.actividad.findUniqueOrThrow({
      where: { id: invalid.id },
      select: {
        status: true, version: true, startedAt: true, updatedAt: true,
        tecnicos: {
          orderBy: { tecnicoId: "asc" },
          select: {
            tecnicoId: true, role: true, participationPercentage: true,
            startedAt: true, endedAt: true,
          },
        },
      },
    });
    const before = await snapshot();

    await expect(createActivitiesOperationRepository(database).startActivity(invalid.id, { version: 1 }, fixture.actor, startedAt)).resolves.toEqual({ kind: "INVALID_PARTICIPATION_TOTAL" });
    await expect(snapshot()).resolves.toEqual(before);
    await expect(database.auditoria.count({ where: { entity: "Actividad", entityId: invalid.id } })).resolves.toBe(0);
  });

  it("opens one shared pause and resumes by closing that same pause", async () => {
    const id = await createPendingActivity(fixture);
    const repository = createActivitiesOperationRepository(database);
    await repository.startActivity(id, { version: 1 }, fixture.actor, startedAt);
    const pausedAt = new Date("2026-08-06T12:05:00.000Z");
    const paused = await repository.pauseActivity(id, { version: 2, reason: "Esperando aprobación" }, fixture.actor, pausedAt);

    expect(paused).toMatchObject({ kind: "UPDATED", activity: { status: "PAUSED", version: 3, pausas: [{ startedAt: pausedAt, endedAt: null, reason: "Esperando aprobación" }] } });
    await expect(database.pausaActividad.findFirstOrThrow({ where: { actividadId: id }, select: { userId: true, reason: true } })).resolves.toEqual({ userId: fixture.userId, reason: "Esperando aprobación" });
    await expect(repository.pauseActivity(id, { version: 3, reason: "Duplicada" }, fixture.actor, pausedAt)).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });
    const resumedAt = new Date("2026-08-06T12:10:00.000Z");
    const resumed = await repository.resumeActivity(id, { version: 3 }, fixture.actor, resumedAt);
    expect(resumed).toMatchObject({ kind: "UPDATED", activity: { status: "IN_PROGRESS", version: 4, pausas: [{ startedAt: pausedAt, endedAt: resumedAt }] } });
    await expect(database.auditoria.findMany({ where: { entity: "Actividad", entityId: id }, orderBy: { occurredAt: "asc" }, select: { action: true, reason: true } })).resolves.toEqual([
      { action: "ACTIVITY_CREATED", reason: null },
      { action: "ACTIVITY_STARTED", reason: null },
      { action: "ACTIVITY_PAUSED", reason: "Esperando aprobación" },
      { action: "ACTIVITY_RESUMED", reason: null },
    ]);
  });

  it("rejects stale, invalid-state, invalid-team, and non-responsible timer commands without writing", async () => {
    const id = await createPendingActivity(fixture);
    const repository = createActivitiesOperationRepository(database);
    await expect(repository.startActivity(id, { version: 7 }, fixture.actor, startedAt)).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    await repository.startActivity(id, { version: 1 }, fixture.actor, startedAt);
    await expect(repository.startActivity(id, { version: 2 }, fixture.actor, startedAt)).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });
    await expect(repository.pauseActivity(id, { version: 1, reason: "Versión anterior" }, fixture.actor, startedAt)).resolves.toEqual({ kind: "VERSION_CONFLICT" });

    const group = await createActivitiesMutationRepository(database).createActivity({
      ...input(fixture),
      description: "Actividad grupal",
      team: [
        { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "50.00" },
        { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
      ],
    }, fixture.actor, startedAt);
    if (group.kind !== "CREATED") throw new Error("Expected group activity");
    const participant = { ...fixture.actor, technicianId: fixture.otherTechnicianId, permissions: ["ACTIVITIES_OPERATE_OWN"] };
    await expect(repository.startActivity(group.activity.id, { version: 1 }, participant, startedAt)).resolves.toEqual({ kind: "FORBIDDEN" });

    const invalid = await database.actividad.create({
      data: { sucursalId: fixture.branchId, tipoActividadId: fixture.typeId, status: "PENDING", description: "Sin equipo" }, select: { id: true },
    });
    await expect(repository.startActivity(invalid.id, { version: 1 }, fixture.actor, startedAt)).resolves.toEqual({ kind: "INVALID_PARTICIPATION_TOTAL" });
    await expect(database.auditoria.count({ where: { entity: "Actividad", entityId: { in: [group.activity.id, invalid.id] } } })).resolves.toBe(1);
  });

  it("lets a paused technician start another activity and blocks the old activity from resuming", async () => {
    const repository = createActivitiesOperationRepository(database);
    const firstId = await createPendingActivity(fixture);
    const secondId = await createPendingActivity(fixture);
    await repository.startActivity(firstId, { version: 1 }, fixture.actor, startedAt);
    await repository.pauseActivity(firstId, { version: 2, reason: "Esperando material" }, fixture.actor, new Date("2026-08-06T12:05:00.000Z"));
    await expect(repository.startActivity(secondId, { version: 1 }, fixture.actor, new Date("2026-08-06T12:06:00.000Z"))).resolves.toMatchObject({ kind: "UPDATED", activity: { status: "IN_PROGRESS" } });
    await expect(repository.resumeActivity(firstId, { version: 3 }, fixture.actor, new Date("2026-08-06T12:07:00.000Z"))).resolves.toEqual({ kind: "ACTIVE_TIMER_EXISTS" });
    await expect(database.pausaActividad.findMany({ where: { actividadId: firstId }, select: { endedAt: true } })).resolves.toEqual([{ endedAt: null }]);
  });

  it("rolls back the activity transition and pause row when its audit write fails", async () => {
    const id = await createPendingActivity(fixture);
    await createActivitiesOperationRepository(database).startActivity(id, { version: 1 }, fixture.actor, startedAt);
    const transaction = database.$transaction.bind(database);
    const failingDatabase = {
      ...database,
      $transaction: (callback: (transactionClient: typeof database) => Promise<unknown>) => transaction(async (transactionClient) => {
        vi.spyOn(transactionClient.auditoria, "create").mockRejectedValueOnce(new Error("audit failed"));
        return callback(transactionClient as typeof database);
      }),
    };
    const repository = createActivitiesOperationRepository(failingDatabase as unknown as typeof database);
    await expect(repository.pauseActivity(id, { version: 2, reason: "No debe persistir" }, fixture.actor, startedAt)).rejects.toThrow("audit failed");
    await expect(database.actividad.findUniqueOrThrow({ where: { id }, select: { status: true, version: true, startedAt: true } })).resolves.toEqual({ status: "IN_PROGRESS", version: 2, startedAt });
    await expect(database.pausaActividad.count({ where: { actividadId: id } })).resolves.toBe(0);
    await expect(database.auditoria.count({ where: { entity: "Actividad", entityId: id } })).resolves.toBe(2);
  });

  it("allows exactly one forced concurrent start for one technician", async () => {
    const firstId = await createPendingActivity(fixture);
    const secondId = await createPendingActivity(fixture);
    const secondDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const blockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    let starts: Promise<unknown[]> | undefined;
    let release: () => void = () => undefined;
    let markLocked: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { markLocked = resolve; });
    const blocker = blockerDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fixture.technicianId}))`;
      markLocked();
      await hold;
    });
    try {
      await locked;
      starts = Promise.all([
        createActivitiesOperationRepository(database).startActivity(firstId, { version: 1 }, fixture.actor, startedAt),
        createActivitiesOperationRepository(secondDatabase).startActivity(secondId, { version: 1 }, fixture.actor, startedAt),
      ]);
      const deadline = Date.now() + 2_000;
      let waiters = 0;
      while (Date.now() < deadline) {
        const locks = await database.$queryRaw<Array<{ waiting: bigint }>>`SELECT COUNT(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND granted = false`;
        waiters = Number(locks[0]?.waiting ?? 0);
        if (waiters >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiters).toBeGreaterThanOrEqual(2);
      release();
      await blocker;
      if (!starts) throw new Error("Concurrent starts were not scheduled");
      const results = await starts;
      expect(results.map((result) => (result as { kind: string }).kind).sort()).toEqual(["ACTIVE_TIMER_EXISTS", "UPDATED"]);
      await expect(database.actividad.count({ where: { id: { in: [firstId, secondId] }, status: "IN_PROGRESS" } })).resolves.toBe(1);
      await expect(database.auditoria.count({ where: { entity: "Actividad", entityId: { in: [firstId, secondId] }, action: "ACTIVITY_STARTED" } })).resolves.toBe(1);
      await expect(database.pausaActividad.count({ where: { actividadId: { in: [firstId, secondId] } } })).resolves.toBe(0);
    } finally {
      release();
      await Promise.allSettled([blocker, ...(starts === undefined ? [] : [starts])]);
      await secondDatabase.$disconnect();
      await blockerDatabase.$disconnect();
    }
  });

  it("completes a running team with raw-millisecond pause accounting, final timestamps, and an allowlisted audit", async () => {
    const created = await createActivitiesMutationRepository(database).createActivity({
      ...input(fixture),
      team: [
        { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "50.00" },
        { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
      ],
    }, fixture.actor, startedAt);
    if (created.kind !== "CREATED") throw new Error("Expected pending team activity");
    const repository = createActivitiesOperationRepository(database);
    const pausedAt = new Date("2026-08-06T12:00:30.000Z");
    const resumedAt = new Date("2026-08-06T12:01:31.000Z");
    const completedAt = new Date("2026-08-06T12:02:30.000Z");

    await repository.startActivity(created.activity.id, { version: 1 }, fixture.actor, startedAt);
    await repository.pauseActivity(created.activity.id, { version: 2, reason: "Esperando validaciÃ³n" }, fixture.actor, pausedAt);
    await repository.resumeActivity(created.activity.id, { version: 3 }, fixture.actor, resumedAt);
    const result = await repository.completeActivity(created.activity.id, {
      version: 4,
      result: "Servicio resuelto",
      observations: "Validado con cliente",
    }, fixture.actor, completedAt);

    expect(result).toMatchObject({
      kind: "UPDATED",
      activity: {
        id: created.activity.id,
        status: "COMPLETED",
        result: "Servicio resuelto",
        observations: "Validado con cliente",
        endedAt: completedAt,
        pausedMinutes: 1,
        productiveMinutes: 1,
        version: 5,
      },
    });
    if (result.kind !== "UPDATED") return;
    expect(result.activity.tecnicos.map(({ tecnico, startedAt: memberStartedAt, endedAt }) => ({
      technicianId: tecnico.id, startedAt: memberStartedAt, endedAt,
    }))).toEqual([
      { technicianId: fixture.technicianId, startedAt, endedAt: completedAt },
      { technicianId: fixture.otherTechnicianId, startedAt, endedAt: completedAt },
    ]);
    await expect(database.auditoria.findFirstOrThrow({
      where: { entity: "Actividad", entityId: created.activity.id, action: "ACTIVITY_COMPLETED" },
      select: { reason: true, beforeData: true, afterData: true, occurredAt: true },
    })).resolves.toEqual(expect.objectContaining({
      reason: null,
      occurredAt: completedAt,
      beforeData: expect.objectContaining({ status: "IN_PROGRESS", version: 4 }),
      afterData: expect.objectContaining({ status: "COMPLETED", version: 5 }),
    }));
  });

  it("rejects completion with an open pause and preserves the running activity", async () => {
    const id = await createPendingActivity(fixture);
    const repository = createActivitiesOperationRepository(database);
    await repository.startActivity(id, { version: 1 }, fixture.actor, startedAt);
    await repository.pauseActivity(id, { version: 2, reason: "Esperando repuesto" }, fixture.actor, new Date("2026-08-06T12:01:00.000Z"));
    const before = await database.actividad.findUniqueOrThrow({
      where: { id },
      select: { status: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true },
    });

    await expect(repository.completeActivity(id, { version: 3, result: "No debe completar" }, fixture.actor, new Date("2026-08-06T12:02:00.000Z"))).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });
    await expect(database.actividad.findUniqueOrThrow({
      where: { id },
      select: { status: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true },
    })).resolves.toEqual(before);
  });

  it("enforces contextual cancellation, closes an open pause, and keeps cancelled work out of productive minutes", async () => {
    const repository = createActivitiesOperationRepository(database);
    const ownActor = { ...fixture.actor, technicianId: fixture.technicianId, permissions: ["ACTIVITIES_CREATE_OWN"] };
    const pendingId = await createPendingActivity(fixture);
    await expect(repository.cancelActivity(pendingId, { version: 1, reason: "Cliente cancelÃ³" }, ownActor, new Date("2026-08-06T12:01:00.000Z"))).resolves.toMatchObject({
      kind: "UPDATED", activity: { status: "CANCELLED", productiveMinutes: null, version: 2 },
    });

    const runningId = await createPendingActivity(fixture);
    await repository.startActivity(runningId, { version: 1 }, fixture.actor, startedAt);
    await expect(repository.cancelActivity(runningId, { version: 2, reason: "TÃ©cnico no puede" }, ownActor, new Date("2026-08-06T12:01:00.000Z"))).resolves.toEqual({ kind: "FORBIDDEN" });
    await repository.pauseActivity(runningId, { version: 2, reason: "En espera" }, fixture.actor, new Date("2026-08-06T12:01:00.000Z"));
    const cancelledAt = new Date("2026-08-06T12:02:30.000Z");
    const cancelled = await repository.cancelActivity(runningId, { version: 3, reason: "Orden retirada" }, fixture.actor, cancelledAt);

    expect(cancelled).toMatchObject({ kind: "UPDATED", activity: {
      status: "CANCELLED", startedAt, endedAt: null, pausedMinutes: 0, productiveMinutes: null, version: 4,
      pausas: [{ endedAt: cancelledAt, reason: "En espera" }],
    } });
    await expect(database.auditoria.findFirstOrThrow({
      where: { entity: "Actividad", entityId: runningId, action: "ACTIVITY_CANCELLED" },
      select: { reason: true, occurredAt: true },
    })).resolves.toEqual({ reason: "Orden retirada", occurredAt: cancelledAt });
    await expect(repository.cancelActivity(runningId, { version: 4, reason: "Reintento" }, fixture.actor, cancelledAt)).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });

    const completedId = await createPendingActivity(fixture);
    await repository.startActivity(completedId, { version: 1 }, fixture.actor, startedAt);
    await expect(repository.completeActivity(completedId, { version: 2, result: "Cerrada" }, ownActor, new Date("2026-08-06T12:00:59.999Z"))).resolves.toMatchObject({
      kind: "UPDATED", activity: { pausedMinutes: 0, productiveMinutes: 0 },
    });
    await expect(repository.cancelActivity(completedId, { version: 3, reason: "No reabrir" }, ownActor, cancelledAt)).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });
  });

  it("rolls back completion timestamps, minutes, team, pauses, version, and audit when its audit write fails", async () => {
    const id = await createPendingActivity(fixture);
    const repository = createActivitiesOperationRepository(database);
    await repository.startActivity(id, { version: 1 }, fixture.actor, startedAt);
    await repository.pauseActivity(id, { version: 2, reason: "Pausa cerrada" }, fixture.actor, new Date("2026-08-06T12:01:00.000Z"));
    await repository.resumeActivity(id, { version: 3 }, fixture.actor, new Date("2026-08-06T12:02:00.000Z"));
    const before = () => database.actividad.findUniqueOrThrow({
      where: { id },
      select: {
        status: true, startedAt: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true, updatedAt: true,
        tecnicos: { orderBy: { tecnicoId: "asc" }, select: { startedAt: true, endedAt: true } },
        pausas: { orderBy: { id: "asc" }, select: { startedAt: true, endedAt: true, reason: true } },
      },
    });
    const snapshot = await before();
    const transaction = database.$transaction.bind(database);
    const failingDatabase = {
      ...database,
      $transaction: (callback: (transactionClient: typeof database) => Promise<unknown>) => transaction(async (transactionClient) => {
        vi.spyOn(transactionClient.auditoria, "create").mockRejectedValueOnce(new Error("audit failed"));
        return callback(transactionClient as typeof database);
      }),
    };

    await expect(createActivitiesOperationRepository(failingDatabase as unknown as typeof database).completeActivity(id, { version: 4, result: "No debe persistir" }, fixture.actor, new Date("2026-08-06T12:03:00.000Z"))).rejects.toThrow("audit failed");
    await expect(before()).resolves.toEqual(snapshot);
    await expect(database.auditoria.count({ where: { entity: "Actividad", entityId: id } })).resolves.toBe(4);
  });

  it("rolls back cancellation state, open-pause closure, timestamps, version, and audit when its audit write fails", async () => {
    const id = await createPendingActivity(fixture);
    const repository = createActivitiesOperationRepository(database);
    await repository.startActivity(id, { version: 1 }, fixture.actor, startedAt);
    const pausedAt = new Date("2026-08-06T12:01:00.000Z");
    await repository.pauseActivity(id, { version: 2, reason: "No cerrar todavÃ­a" }, fixture.actor, pausedAt);
    const before = () => database.actividad.findUniqueOrThrow({
      where: { id },
      select: {
        status: true, startedAt: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true, updatedAt: true,
        tecnicos: { orderBy: { tecnicoId: "asc" }, select: { startedAt: true, endedAt: true } },
        pausas: { orderBy: { id: "asc" }, select: { startedAt: true, endedAt: true, reason: true } },
      },
    });
    const snapshot = await before();
    const transaction = database.$transaction.bind(database);
    const failingDatabase = {
      ...database,
      $transaction: (callback: (transactionClient: typeof database) => Promise<unknown>) => transaction(async (transactionClient) => {
        vi.spyOn(transactionClient.auditoria, "create").mockRejectedValueOnce(new Error("audit failed"));
        return callback(transactionClient as typeof database);
      }),
    };

    await expect(createActivitiesOperationRepository(failingDatabase as unknown as typeof database).cancelActivity(id, { version: 3, reason: "No debe persistir" }, fixture.actor, new Date("2026-08-06T12:03:00.000Z"))).rejects.toThrow("audit failed");
    await expect(before()).resolves.toEqual(snapshot);
    await expect(database.auditoria.count({ where: { entity: "Actividad", entityId: id } })).resolves.toBe(3);
  });

  it("adjusts every allowlisted completed field, preserves omitted values, synchronizes the replacement team, and writes immutable allowlisted snapshots", async () => {
    const originalStart = new Date("2026-08-06T08:00:00.000Z");
    const originalEnd = new Date("2026-08-06T08:05:00.000Z");
    const created = await createActivitiesMutationRepository(database).createManualActivity({
      ...input(fixture), description: "Descripción original", observations: "Observación original",
      startedAt: originalStart, endedAt: originalEnd, result: "Resultado original", justification: "Registro inicial",
    }, fixture.actor, startedAt);
    if (created.kind !== "CREATED") throw new Error("Expected completed manual activity");

    const adjustedStart = new Date("2026-08-06T08:01:00.000Z");
    const adjustedEnd = new Date("2026-08-06T08:11:00.000Z");
    const result = await createActivitiesOperationRepository(database).adjustCompletedActivity(created.activity.id, {
      version: 1, reason: "Corregir cierre validado", activityTypeId: fixture.adjustmentTypeId,
      description: "Descripción corregida", observations: null, result: "Resultado corregido", startedAt: adjustedStart, endedAt: adjustedEnd,
      team: [
        { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "60.00" },
        { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "40.00" },
      ],
    }, fixture.actor, new Date("2026-08-06T12:00:00.000Z"));

    expect(result).toMatchObject({
      kind: "UPDATED",
      activity: { status: "COMPLETED", description: "Descripción corregida", observations: null, result: "Resultado corregido", startedAt: adjustedStart, endedAt: adjustedEnd, pausedMinutes: 0, productiveMinutes: 10, version: 2 },
    });
    if (result.kind !== "UPDATED") return;
    expect(result.activity.tecnicos.map(({ tecnico, role, participationPercentage, startedAt: memberStartedAt, endedAt }) => ({
      technicianId: tecnico.id, role, participationPercentage: participationPercentage.toFixed(2), startedAt: memberStartedAt, endedAt,
    }))).toEqual([
      { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "60.00", startedAt: adjustedStart, endedAt: adjustedEnd },
      { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "40.00", startedAt: adjustedStart, endedAt: adjustedEnd },
    ]);
    await expect(database.auditoria.findFirstOrThrow({
      where: { entity: "Actividad", entityId: created.activity.id, action: "ACTIVITY_ADJUSTED" },
      select: { reason: true, beforeData: true, afterData: true },
    })).resolves.toEqual({
      reason: "Corregir cierre validado",
      beforeData: null,
      afterData: {
        reason: "Corregir cierre validado",
        changedFields: ["activityTypeId", "description", "observations", "result", "startedAt", "endedAt", "team"],
        previousVersion: 1,
        version: 2,
        before: {
        activityTypeId: fixture.typeId, description: "Descripción original", observations: "Observación original", result: "Resultado original",
        startedAt: originalStart.toISOString(), endedAt: originalEnd.toISOString(), pausedMinutes: 0, productiveMinutes: 5,
        team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
        },
        after: {
        activityTypeId: fixture.adjustmentTypeId, description: "Descripción corregida", observations: null, result: "Resultado corregido",
        startedAt: adjustedStart.toISOString(), endedAt: adjustedEnd.toISOString(), pausedMinutes: 0, productiveMinutes: 10,
        team: [
          { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "60.00" },
          { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "40.00" },
        ],
        },
      },
    });
  });

  it("merges one temporal endpoint, recalculates persisted pauses, and rejects a range that leaves a pause outside", async () => {
    const id = await createPendingActivity(fixture);
    const repository = createActivitiesOperationRepository(database);
    await repository.startActivity(id, { version: 1 }, fixture.actor, startedAt);
    await repository.pauseActivity(id, { version: 2, reason: "Pausa registrada" }, fixture.actor, new Date("2026-08-06T12:02:00.000Z"));
    await repository.resumeActivity(id, { version: 3 }, fixture.actor, new Date("2026-08-06T12:04:00.000Z"));
    await repository.completeActivity(id, { version: 4, result: "Trabajo cerrado" }, fixture.actor, new Date("2026-08-06T12:10:00.000Z"));

    const adjustmentEnd = new Date("2026-08-06T12:11:00.000Z");
    const adjustmentNow = new Date("2026-08-06T12:12:00.000Z");
    const completeSnapshot = () => database.actividad.findUniqueOrThrow({
      where: { id },
      select: {
        tipoActividadId: true, description: true, observations: true, result: true,
        startedAt: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true, updatedAt: true,
        tecnicos: {
          orderBy: { tecnicoId: "asc" },
          select: { tecnicoId: true, role: true, participationPercentage: true, startedAt: true, endedAt: true },
        },
      },
    });
    const beforeEndpointAdjustment = await completeSnapshot();
    await expect(repository.adjustCompletedActivity(id, {
      version: 5, reason: "Extender el cierre", endedAt: adjustmentEnd,
    }, fixture.actor, adjustmentNow)).resolves.toMatchObject({ kind: "UPDATED", activity: { version: 6 } });
    await expect(completeSnapshot()).resolves.toEqual({
      ...beforeEndpointAdjustment,
      endedAt: adjustmentEnd,
      pausedMinutes: 2,
      productiveMinutes: 9,
      version: 6,
      updatedAt: adjustmentNow,
      tecnicos: beforeEndpointAdjustment.tecnicos.map((member) => ({ ...member, endedAt: adjustmentEnd })),
    });
    const snapshot = await database.actividad.findUniqueOrThrow({ where: { id }, select: { startedAt: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true } });
    await expect(repository.adjustCompletedActivity(id, {
      version: 6, reason: "No puede expulsar la pausa", startedAt: new Date("2026-08-06T12:03:00.000Z"),
    }, fixture.actor, new Date("2026-08-06T12:12:00.000Z"))).resolves.toEqual({ kind: "INVALID_TEMPORAL_RANGE" });
    await expect(database.actividad.findUniqueOrThrow({ where: { id }, select: { startedAt: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true } })).resolves.toEqual(snapshot);
  });

  it("rejects overlap, stale or non-completed adjustments and rolls back an adjustment when audit fails", async () => {
    expect(adjustActivitySchema.safeParse({ version: 1, reason: "Motivo", description: "Cambio", injected: true }).success).toBe(false);
    const repository = createActivitiesOperationRepository(database);
    const blocker = await createActivitiesMutationRepository(database).createManualActivity({
      ...input(fixture), startedAt: new Date("2026-08-06T07:00:00.000Z"), endedAt: new Date("2026-08-06T07:10:00.000Z"), result: "Bloquea", justification: "Registro inicial",
    }, fixture.actor, startedAt);
    const target = await createActivitiesMutationRepository(database).createManualActivity({
      ...input(fixture), startedAt: new Date("2026-08-06T08:00:00.000Z"), endedAt: new Date("2026-08-06T08:10:00.000Z"), result: "Objetivo", justification: "Registro inicial",
    }, fixture.actor, startedAt);
    if (blocker.kind !== "CREATED" || target.kind !== "CREATED") throw new Error("Expected completed manual activities");
    await expect(repository.adjustCompletedActivity(target.activity.id, {
      version: 1, reason: "Total inválido", team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "99.99" }],
    }, fixture.actor, startedAt)).resolves.toEqual({ kind: "INVALID_PARTICIPATION_TOTAL" });
    await expect(repository.adjustCompletedActivity(target.activity.id, {
      version: 1, reason: "Cruza otro trabajo", startedAt: new Date("2026-08-06T07:05:00.000Z"),
    }, fixture.actor, startedAt)).resolves.toEqual({ kind: "TIME_OVERLAP" });
    await expect(repository.adjustCompletedActivity(target.activity.id, {
      version: 7, reason: "Versión obsoleta", description: "No cambia",
    }, fixture.actor, startedAt)).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    const pendingId = await createPendingActivity(fixture);
    await expect(repository.adjustCompletedActivity(pendingId, {
      version: 1, reason: "No está cerrada", description: "No cambia",
    }, fixture.actor, startedAt)).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });

    const rollbackSnapshot = () => database.actividad.findUniqueOrThrow({
      where: { id: target.activity.id },
      select: {
        tipoActividadId: true, description: true, observations: true, result: true,
        startedAt: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, version: true, updatedAt: true,
        tecnicos: { orderBy: { tecnicoId: "asc" }, select: { tecnicoId: true, role: true, participationPercentage: true, startedAt: true, endedAt: true } },
      },
    });
    const snapshot = await rollbackSnapshot();
    const transaction = database.$transaction.bind(database);
    const failingDatabase = {
      ...database,
      $transaction: (callback: (transactionClient: typeof database) => Promise<unknown>) => transaction(async (transactionClient) => {
        vi.spyOn(transactionClient.auditoria, "create").mockRejectedValueOnce(new Error("audit failed"));
        return callback(transactionClient as typeof database);
      }),
    };
    await expect(createActivitiesOperationRepository(failingDatabase as unknown as typeof database).adjustCompletedActivity(target.activity.id, {
      version: 1, reason: "No debe persistir", activityTypeId: fixture.adjustmentTypeId, description: "Cambio revertido",
      result: "Resultado revertido", startedAt: new Date("2026-08-06T08:01:00.000Z"), endedAt: new Date("2026-08-06T08:11:00.000Z"),
      team: [
        { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "60.00" },
        { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "40.00" },
      ],
    }, fixture.actor, startedAt)).rejects.toThrow("audit failed");
    await expect(rollbackSnapshot()).resolves.toEqual(snapshot);
  });

  it("rejects future ranges and team order assignments that did not cover the corrected completed interval", async () => {
    const repository = createActivitiesOperationRepository(database);
    const ordered = await createActivitiesMutationRepository(database).createManualActivity({
      orderId: fixture.orderId, activityTypeId: fixture.typeId, description: "Trabajo de orden", result: "Terminado", justification: "Registro inicial",
      startedAt: new Date("2026-08-06T07:10:00.000Z"), endedAt: new Date("2026-08-06T07:20:00.000Z"),
      team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }, fixture.actor, startedAt);
    if (ordered.kind !== "CREATED") throw new Error("Expected ordered completed activity");
    await expect(repository.adjustCompletedActivity(ordered.activity.id, {
      version: 1, reason: "No estaba asignado al final", endedAt: new Date("2026-08-06T08:01:00.000Z"),
    }, fixture.actor, new Date("2026-08-06T12:00:00.000Z"))).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" });
    await expect(repository.adjustCompletedActivity(ordered.activity.id, {
      version: 1, reason: "No puede ser futuro", endedAt: new Date("2026-08-06T12:01:00.000Z"),
    }, fixture.actor, new Date("2026-08-06T12:00:00.000Z"))).resolves.toEqual({ kind: "INVALID_TEMPORAL_RANGE" });
  });

  it("allows an adjustment that preserves a legitimate sub-minute timer interval", async () => {
    const id = await createPendingActivity(fixture);
    const repository = createActivitiesOperationRepository(database);
    await repository.startActivity(id, { version: 1 }, fixture.actor, startedAt);
    await repository.completeActivity(id, { version: 2, result: "Cierre breve" }, fixture.actor, new Date("2026-08-06T12:00:59.999Z"));
    await expect(repository.adjustCompletedActivity(id, {
      version: 3, reason: "Corregir descripción", description: "Cierre breve corregido",
    }, fixture.actor, new Date("2026-08-06T12:01:00.000Z"))).resolves.toMatchObject({
      kind: "UPDATED", activity: { description: "Cierre breve corregido", productiveMinutes: 0, version: 4 },
    });
  });

  it("waits on the removed prior technician lock during a real A-to-B replacement", async () => {
    const target = await createActivitiesMutationRepository(database).createManualActivity({
      ...input(fixture), startedAt: new Date("2026-08-06T08:00:00.000Z"), endedAt: new Date("2026-08-06T08:10:00.000Z"), result: "Objetivo", justification: "Registro inicial",
    }, fixture.actor, startedAt);
    if (target.kind !== "CREATED") throw new Error("Expected completed manual activity");
    const operationDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const blockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    let operationPid: number | undefined;
    let blockerPid: number | undefined;
    let release: () => void = () => undefined;
    let markLocked: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { markLocked = resolve; });
    const transaction = operationDatabase.$transaction.bind(operationDatabase);
    const observedDatabase = {
      ...operationDatabase,
      $transaction: (callback: (transactionClient: typeof operationDatabase) => Promise<unknown>) => transaction(async (transactionClient) => {
        const backend = await transactionClient.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        operationPid = backend[0]!.pid;
        return callback(transactionClient as typeof operationDatabase);
      }),
    };
    const blocker = blockerDatabase.$transaction(async (transactionClient) => {
      const backend = await transactionClient.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      blockerPid = backend[0]!.pid;
      await transactionClient.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fixture.technicianId}))`;
      markLocked();
      await hold;
    });
    try {
      await locked;
      const adjustment = createActivitiesOperationRepository(observedDatabase as unknown as typeof database).adjustCompletedActivity(target.activity.id, {
        version: 1, reason: "Reemplazar responsable", team: [{ technicianId: fixture.otherTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
      }, fixture.actor, startedAt);
      await waitForExactAdvisoryWaiter(await waitForBackendPid(() => operationPid), await advisoryLockHeldBy(blockerPid!));
      release();
      await blocker;
      await expect(adjustment).resolves.toMatchObject({ kind: "UPDATED", activity: { version: 2 } });
    } finally {
      release();
      await Promise.allSettled([blocker]);
      await operationDatabase.$disconnect();
      await blockerDatabase.$disconnect();
    }
  });

  it("waits on the added final technician lock during a real A-to-A-plus-B replacement", async () => {
    const target = await createActivitiesMutationRepository(database).createManualActivity({
      ...input(fixture), startedAt: new Date("2026-08-06T09:00:00.000Z"), endedAt: new Date("2026-08-06T09:10:00.000Z"), result: "Objetivo", justification: "Registro inicial",
    }, fixture.actor, startedAt);
    if (target.kind !== "CREATED") throw new Error("Expected completed manual activity");
    const operationDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const blockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    let operationPid: number | undefined;
    let blockerPid: number | undefined;
    let release: () => void = () => undefined;
    let markLocked: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { markLocked = resolve; });
    const transaction = operationDatabase.$transaction.bind(operationDatabase);
    const observedDatabase = {
      ...operationDatabase,
      $transaction: (callback: (transactionClient: typeof operationDatabase) => Promise<unknown>) => transaction(async (transactionClient) => {
        const backend = await transactionClient.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        operationPid = backend[0]!.pid;
        return callback(transactionClient as typeof operationDatabase);
      }),
    };
    const blocker = blockerDatabase.$transaction(async (transactionClient) => {
      const backend = await transactionClient.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      blockerPid = backend[0]!.pid;
      await transactionClient.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fixture.otherTechnicianId}))`;
      markLocked();
      await hold;
    });
    try {
      await locked;
      const adjustment = createActivitiesOperationRepository(observedDatabase as unknown as typeof database).adjustCompletedActivity(target.activity.id, {
        version: 1, reason: "Agregar participante",
        team: [
          { technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "50.00" },
          { technicianId: fixture.otherTechnicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
        ],
      }, fixture.actor, startedAt);
      await waitForExactAdvisoryWaiter(await waitForBackendPid(() => operationPid), await advisoryLockHeldBy(blockerPid!));
      release();
      await blocker;
      await expect(adjustment).resolves.toMatchObject({ kind: "UPDATED", activity: { version: 2 } });
    } finally {
      release();
      await Promise.allSettled([blocker]);
      await operationDatabase.$disconnect();
      await blockerDatabase.$disconnect();
    }
  });
});
