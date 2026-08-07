import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient } from "../../src/config/database.js";
import { createActivitiesMutationRepository } from "../../src/activities/activities.mutation.repository.js";
import { createActivitiesOperationRepository } from "../../src/activities/activities.operation.repository.js";
import type { ActivityActorContext, CreateActivityInput } from "../../src/activities/activities.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const startedAt = new Date("2026-08-06T12:00:00.000Z");

interface Fixture {
  clientId: string;
  branchId: string;
  typeId: string;
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
    clientId: randomUUID(), branchId: randomUUID(), typeId: randomUUID(), technicianId: randomUUID(), otherTechnicianId: randomUUID(), userId: user.id,
    actor: { userId: user.id, technicianId: null, permissions: ["ACTIVITIES_MANAGE"], requestId: randomUUID() },
  };
  await database.cliente.create({ data: { id: fixture.clientId, code: `AO-${suffix}`, tradeName: "Cliente operación" } });
  await database.sucursalCliente.create({ data: { id: fixture.branchId, clienteId: fixture.clientId, code: "MAIN", name: "Principal", address: "Centro" } });
  await database.tipoActividad.create({ data: { id: fixture.typeId, code: `AOP-${suffix}`, name: "Operación" } });
  await database.tecnico.create({ data: { id: fixture.technicianId, code: `AOT-${suffix}`, fullName: "Técnico operación" } });
  await database.tecnico.create({ data: { id: fixture.otherTechnicianId, code: `AOU-${suffix}`, fullName: "Segundo técnico" } });
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

async function removeFixture(fixture: Fixture): Promise<void> {
  const activityIds = (await database.actividad.findMany({ where: { sucursalId: fixture.branchId }, select: { id: true } })).map(({ id }) => id);
  await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } });
  await database.pausaActividad.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  await database.tecnico.delete({ where: { id: fixture.technicianId } });
  await database.tecnico.delete({ where: { id: fixture.otherTechnicianId } });
  await database.tipoActividad.delete({ where: { id: fixture.typeId } });
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
});
