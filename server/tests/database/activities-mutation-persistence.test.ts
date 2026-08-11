import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient } from "../../src/config/database.js";
import { createActivitiesMutationRepository } from "../../src/activities/activities.mutation.repository.js";
import type { ActivityMutationResult } from "../../src/activities/activities.repository.types.js";
import type { ActivityActorContext, CreateActivityInput, ManualActivityInput } from "../../src/activities/activities.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const now = new Date("2026-08-06T12:00:00.000Z");
const updateBarrierNamespace = 1_132_024_001;
const updateBarrierKey = 4;

async function waitForActivityUpdateWaiters(expected: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await database.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT COUNT(*) AS "waiting"
      FROM pg_locks
      WHERE granted = false
        AND (
          (locktype = 'advisory'
            AND classid::bigint = ${updateBarrierNamespace}
            AND objid::bigint = ${updateBarrierKey})
          OR locktype = 'transactionid'
        )
    `;
    if (Number(rows[0]?.waiting ?? 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${expected} activity-update lock waiters`);
}

interface AdvisoryLockRecord {
  pid: number;
  granted: boolean;
}

async function waitForTechnicianLockWaiters(
  technicianId: string,
  expected: number,
): Promise<AdvisoryLockRecord[]> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await database.$queryRaw<AdvisoryLockRecord[]>`
      SELECT pid, granted
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND classid::bigint = CASE WHEN hashtext(${technicianId}) < 0 THEN 4294967295 ELSE 0 END
        AND objid::bigint = (hashtext(${technicianId})::bigint & 4294967295)
        AND objsubid = 1
      ORDER BY pid
    `;
    if (rows.filter(({ granted }) => !granted).length >= expected) return rows;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${expected} exact technician-lock waiters`);
}

async function waitForTechnicianLockState(
  technicianId: string,
  writerPid: number,
  granted: boolean,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await database.$queryRaw<AdvisoryLockRecord[]>`
      SELECT pid, granted
      FROM pg_locks
      WHERE pid = ${writerPid}
        AND locktype = 'advisory'
        AND classid::bigint = CASE WHEN hashtext(${technicianId}) < 0 THEN 4294967295 ELSE 0 END
        AND objid::bigint = (hashtext(${technicianId})::bigint & 4294967295)
        AND objsubid = 1
    `;
    if (rows.some((lock) => lock.granted === granted)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected writer ${writerPid} to ${granted ? "hold" : "wait for"} the exact technician lock`);
}

interface Fixture {
  clientId: string;
  branchId: string;
  inactiveBranchId: string;
  deletedBranchId: string;
  serviceTypeId: string;
  activityTypeId: string;
  alternateActivityTypeId: string;
  inactiveTypeId: string;
  deletedTypeId: string;
  orderId: string;
  cancelledOrderId: string;
  leaderId: string;
  technicianId: string;
  inactiveTechnicianId: string;
  foreignTechnicianId: string;
  actor: ActivityActorContext;
}

function activityInput(fixture: Fixture, overrides: Partial<CreateActivityInput> = {}): CreateActivityInput {
  return {
    branchId: fixture.branchId,
    activityTypeId: fixture.activityTypeId,
    description: "Preparar equipo de red",
    team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    ...overrides,
  };
}

function orderInput(fixture: Fixture, overrides: Partial<CreateActivityInput> = {}): CreateActivityInput {
  return {
    orderId: fixture.orderId,
    activityTypeId: fixture.activityTypeId,
    description: "Preparar equipo de red",
    ...overrides,
  };
}

function manualInput(fixture: Fixture, overrides: Partial<ManualActivityInput> = {}): ManualActivityInput {
  const input: ManualActivityInput = {
    ...activityInput(fixture),
    startedAt: new Date("2026-08-06T10:00:00.000Z"),
    endedAt: new Date("2026-08-06T11:00:00.000Z"),
    result: "Trabajo terminado",
    justification: "Registro posterior por caida de conectividad",
    ...overrides,
  };
  if (input.orderId !== undefined) delete input.branchId;
  return input;
}

async function createHistoricalActivity(
  fixture: Fixture,
  options: {
    startedAt: Date;
    endedAt: Date;
    team?: ManualActivityInput["team"];
    status?: "COMPLETED" | "IN_PROGRESS" | "PAUSED";
    pauses?: Array<{ startedAt: Date; endedAt: Date | null }>;
  },
): Promise<string> {
  const activity = await database.actividad.create({
    data: {
      sucursalId: fixture.branchId,
      tipoActividadId: fixture.activityTypeId,
      status: options.status ?? "COMPLETED",
      description: "Actividad historica",
      result: "Completada",
      startedAt: options.startedAt,
      ...(options.status !== "IN_PROGRESS" && options.status !== "PAUSED" && { endedAt: options.endedAt }),
      productiveMinutes: 1,
      tecnicos: {
        create: (options.team ?? [{
          technicianId: fixture.leaderId,
          role: "RESPONSIBLE",
          participationPercentage: "100.00",
        }]).map((member) => ({
          tecnicoId: member.technicianId,
          role: member.role,
          participationPercentage: member.participationPercentage,
          startedAt: options.startedAt,
          ...(options.status !== "IN_PROGRESS" && options.status !== "PAUSED" && { endedAt: options.endedAt }),
        })),
      },
      ...(options.pauses !== undefined && {
        pausas: { create: options.pauses.map((pause) => ({ ...pause, reason: "Pausa historica" })) },
      }),
    },
    select: { id: true },
  });
  return activity.id;
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    clientId: randomUUID(), branchId: randomUUID(), inactiveBranchId: randomUUID(), deletedBranchId: randomUUID(),
    serviceTypeId: randomUUID(), activityTypeId: randomUUID(), alternateActivityTypeId: randomUUID(), inactiveTypeId: randomUUID(), deletedTypeId: randomUUID(),
    orderId: randomUUID(), cancelledOrderId: randomUUID(),
    leaderId: "00000000-0000-4000-8000-000000000001",
    technicianId: "00000000-0000-4000-8000-000000000002",
    inactiveTechnicianId: randomUUID(), foreignTechnicianId: randomUUID(),
  };
  const user = await database.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" }, select: { id: true } });
  await database.cliente.create({ data: { id: ids.clientId, code: `AM-${suffix}`, tradeName: `Cliente ${suffix}` } });
  await database.sucursalCliente.createMany({ data: [
    { id: ids.branchId, clienteId: ids.clientId, code: "MAIN", name: "Principal", address: "Centro" },
    { id: ids.inactiveBranchId, clienteId: ids.clientId, code: "INACTIVE", name: "Inactiva", address: "Centro", isActive: false },
    { id: ids.deletedBranchId, clienteId: ids.clientId, code: "DELETED", name: "Eliminada", address: "Centro", deletedAt: now },
  ] });
  await database.tipoServicio.create({ data: { id: ids.serviceTypeId, code: `AMS-${suffix}`, name: "Servicio" } });
  await database.tipoActividad.createMany({ data: [
    { id: ids.activityTypeId, code: `AMA-${suffix}`, name: "Trabajo" },
    { id: ids.alternateActivityTypeId, code: `AM2-${suffix}`, name: "Alterna" },
    { id: ids.inactiveTypeId, code: `AMI-${suffix}`, name: "Inactivo", isActive: false },
    { id: ids.deletedTypeId, code: `AMD-${suffix}`, name: "Eliminado", deletedAt: now },
  ] });
  await database.tecnico.createMany({ data: [
    { id: ids.leaderId, code: `AML-${suffix}`, fullName: "Lider" },
    { id: ids.technicianId, code: `AMT-${suffix}`, fullName: "Tecnico" },
    { id: ids.inactiveTechnicianId, code: `AMX-${suffix}`, fullName: "Inactivo", status: "INACTIVE" },
    { id: ids.foreignTechnicianId, code: `AMF-${suffix}`, fullName: "Ajeno" },
  ] });
  await database.ordenTrabajo.createMany({ data: [
    { id: ids.orderId, orderNumber: `AM-${suffix}-1`, sucursalId: ids.branchId, tipoServicioId: ids.serviceTypeId, reportedProblem: "Equipo" },
    { id: ids.cancelledOrderId, orderNumber: `AM-${suffix}-2`, sucursalId: ids.branchId, tipoServicioId: ids.serviceTypeId, reportedProblem: "Equipo", status: "CANCELLED" },
  ] });
  await database.ordenTecnico.createMany({ data: [
    { ordenId: ids.orderId, tecnicoId: ids.leaderId, role: "PRIMARY", assignedAt: new Date("2026-08-01T00:00:00.000Z") },
    { ordenId: ids.orderId, tecnicoId: ids.technicianId, role: "SUPPORT", assignedAt: new Date("2026-08-01T00:00:00.000Z") },
  ] });
  return { ...ids, actor: { userId: user.id, technicianId: null, permissions: ["ACTIVITIES_MANAGE"], requestId: randomUUID() } };
}

async function removeFixture(fixture: Fixture, activityIds: string[]): Promise<void> {
  await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } });
  await database.pausaActividad.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: [fixture.orderId, fixture.cancelledOrderId] } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: [fixture.orderId, fixture.cancelledOrderId] } } });
  await database.tecnico.deleteMany({ where: { id: { in: [fixture.leaderId, fixture.technicianId, fixture.inactiveTechnicianId, fixture.foreignTechnicianId] } } });
  await database.tipoActividad.deleteMany({ where: { id: { in: [fixture.activityTypeId, fixture.alternateActivityTypeId, fixture.inactiveTypeId, fixture.deletedTypeId] } } });
  await database.tipoServicio.delete({ where: { id: fixture.serviceTypeId } });
  await database.sucursalCliente.deleteMany({ where: { id: { in: [fixture.branchId, fixture.inactiveBranchId, fixture.deletedBranchId] } } });
  await database.cliente.delete({ where: { id: fixture.clientId } });
}

afterAll(disconnectTestDatabase);

describe("activities pending mutation repository", () => {
  let fixture: Fixture;
  const activityIds: string[] = [];
  beforeAll(async () => { fixture = await createFixture(); });
  afterEach(async () => { await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } }); await database.pausaActividad.deleteMany({ where: { actividadId: { in: activityIds } } }); await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } }); await database.actividad.deleteMany({ where: { id: { in: activityIds } } }); activityIds.length = 0; vi.restoreAllMocks(); });
  afterAll(async () => { await removeFixture(fixture, activityIds); });

  it("creates leader individual and group activities with exact team credits", async () => {
    const repository = createActivitiesMutationRepository(database);
    const individual = await repository.createActivity(activityInput(fixture), fixture.actor, now);
    expect(individual.kind).toBe("CREATED");
    if (individual.kind !== "CREATED") return;
    activityIds.push(individual.activity.id);
    expect(individual.activity).toMatchObject({ status: "PENDING", version: 1, description: "Preparar equipo de red", tecnicos: [{ role: "RESPONSIBLE" }] });
    expect(individual.activity.tecnicos[0]?.participationPercentage.toFixed(2)).toBe("100.00");
    const group = await repository.createActivity(activityInput(fixture, { team: [
      { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "60.00" },
      { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "40.00" },
    ] }), fixture.actor, now);
    expect(group.kind).toBe("CREATED");
    if (group.kind !== "CREATED") return;
    activityIds.push(group.activity.id);
  });

  it("records a manual completed activity with productive minutes, team timestamps, and its justification audit", async () => {
    const repository = createActivitiesMutationRepository(database);
    const result = await repository.createManualActivity(manualInput(fixture), fixture.actor, now);
    expect(result).toMatchObject({
      kind: "CREATED",
      activity: {
        status: "COMPLETED",
        startedAt: new Date("2026-08-06T10:00:00.000Z"),
        endedAt: new Date("2026-08-06T11:00:00.000Z"),
        pausedMinutes: 0,
        productiveMinutes: 60,
        version: 1,
      },
    });
    if (result.kind !== "CREATED") return;
    activityIds.push(result.activity.id);
    expect(result.activity.tecnicos).toMatchObject([{
      tecnico: { id: fixture.leaderId },
      startedAt: new Date("2026-08-06T10:00:00.000Z"),
      endedAt: new Date("2026-08-06T11:00:00.000Z"),
    }]);
    await expect(database.auditoria.findFirstOrThrow({
      where: { entity: "Actividad", entityId: result.activity.id },
      select: { action: true, reason: true },
    })).resolves.toEqual({
      action: "ACTIVITY_MANUAL_RECORDED",
      reason: "Registro posterior por caida de conectividad",
    });
  });

  it("rolls back every manual activity row when its audit write fails", async () => {
    const rollbackInput = manualInput(fixture, {
      description: "Carga manual que debe revertirse",
      startedAt: new Date("2026-08-05T06:00:00.000Z"),
      endedAt: new Date("2026-08-05T07:00:00.000Z"),
    });
    const rollbackActor = { ...fixture.actor, requestId: randomUUID() };
    const transaction = database.$transaction.bind(database);
    const failingDatabase = {
      ...database,
      $transaction: (callback: (tx: typeof database) => Promise<unknown>) => transaction(async (tx) => {
        vi.spyOn(tx.auditoria, "create").mockRejectedValueOnce(new Error("manual audit failed"));
        return callback(tx as typeof database);
      }),
    };
    try {
      await expect(createActivitiesMutationRepository(failingDatabase as unknown as typeof database)
        .createManualActivity(rollbackInput, rollbackActor, now)).rejects.toThrow("manual audit failed");
    } finally {
      const leaked = await database.actividad.findMany({
        where: { sucursalId: fixture.branchId, description: rollbackInput.description },
        select: { id: true },
      });
      activityIds.push(...leaked.map(({ id }) => id));
    }
    const createdIds = await database.actividad.findMany({
      where: { sucursalId: fixture.branchId, description: rollbackInput.description },
      select: { id: true },
    });
    expect(createdIds).toEqual([]);
    expect(await database.actividadTecnico.count({
      where: { actividad: { sucursalId: fixture.branchId, description: rollbackInput.description } },
    })).toBe(0);
    expect(await database.pausaActividad.count({
      where: { actividad: { sucursalId: fixture.branchId, description: rollbackInput.description } },
    })).toBe(0);
    expect(await database.auditoria.count({
      where: {
        entity: "Actividad",
        action: "ACTIVITY_MANUAL_RECORDED",
        requestId: rollbackActor.requestId,
      },
    })).toBe(0);
  });

  it("normalizes a technician manual entry to their own one-member team", async () => {
    const result = await createActivitiesMutationRepository(database).createManualActivity(
      manualInput(fixture, {
        team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
      }),
      { ...fixture.actor, technicianId: fixture.technicianId, permissions: ["ACTIVITIES_CREATE_OWN"] },
      now,
    );
    expect(result).toMatchObject({
      kind: "CREATED",
      activity: { tecnicos: [{ tecnico: { id: fixture.technicianId }, role: "RESPONSIBLE" }] },
    });
    if (result.kind === "CREATED") activityIds.push(result.activity.id);
  });

  it("accepts exact one-minute and twenty-four-hour manual ranges and rejects future, inverted, and overlong ranges", async () => {
    const repository = createActivitiesMutationRepository(database);
    const minute = await repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-05T12:00:00.000Z"), endedAt: new Date("2026-08-05T12:01:00.000Z"),
    }), fixture.actor, now);
    const day = await repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-05T12:00:00.000Z"), endedAt: now,
      team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }), fixture.actor, now);
    expect(minute).toMatchObject({ kind: "CREATED", activity: { productiveMinutes: 1 } });
    expect(day).toMatchObject({ kind: "CREATED", activity: { productiveMinutes: 1440 } });
    if (minute.kind === "CREATED") activityIds.push(minute.activity.id);
    if (day.kind === "CREATED") activityIds.push(day.activity.id);
    for (const input of [
      manualInput(fixture, { endedAt: new Date("2026-08-06T12:00:00.001Z") }),
      manualInput(fixture, { startedAt: new Date("2026-08-06T11:00:00.000Z"), endedAt: new Date("2026-08-06T10:00:00.000Z") }),
      manualInput(fixture, { startedAt: new Date("2026-08-05T11:59:59.999Z"), endedAt: now }),
    ]) {
      await expect(repository.createManualActivity(input, fixture.actor, now)).resolves.toEqual({ kind: "INVALID_TEMPORAL_RANGE" });
    }
  });

  it("rejects active timers and completed productive overlaps while allowing adjacency and a historical pause gap", async () => {
    const activeId = await createHistoricalActivity(fixture, {
      status: "IN_PROGRESS", startedAt: new Date("2026-08-06T09:00:00.000Z"), endedAt: now,
    });
    activityIds.push(activeId);
    const repository = createActivitiesMutationRepository(database);
    await expect(repository.createManualActivity(manualInput(fixture), fixture.actor, now)).resolves.toEqual({ kind: "ACTIVE_TIMER_EXISTS" });
    await database.actividad.update({ where: { id: activeId }, data: { status: "CANCELLED" } });

    const completedId = await createHistoricalActivity(fixture, {
      startedAt: new Date("2026-08-06T08:00:00.000Z"), endedAt: new Date("2026-08-06T10:00:00.000Z"),
    });
    activityIds.push(completedId);
    await expect(repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-06T09:00:00.000Z"), endedAt: new Date("2026-08-06T09:30:00.000Z"),
    }), fixture.actor, now)).resolves.toEqual({ kind: "TIME_OVERLAP" });
    const adjacent = await repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-06T10:00:00.000Z"), endedAt: new Date("2026-08-06T11:00:00.000Z"),
    }), fixture.actor, now);
    expect(adjacent.kind).toBe("CREATED");
    if (adjacent.kind === "CREATED") activityIds.push(adjacent.activity.id);

    const pausedId = await createHistoricalActivity(fixture, {
      startedAt: new Date("2026-08-05T08:00:00.000Z"), endedAt: new Date("2026-08-05T12:00:00.000Z"),
      team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
      pauses: [{ startedAt: new Date("2026-08-05T10:00:00.000Z"), endedAt: new Date("2026-08-05T11:00:00.000Z") }],
    });
    activityIds.push(pausedId);
    const pauseGap = await repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-05T10:00:00.000Z"), endedAt: new Date("2026-08-05T11:00:00.000Z"),
      team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }), fixture.actor, now);
    expect(pauseGap.kind).toBe("CREATED");
    if (pauseGap.kind === "CREATED") activityIds.push(pauseGap.activity.id);
  });

  it("rejects overlap with the productive prefix of a paused activity and allows its open pause", async () => {
    const pausedId = await createHistoricalActivity(fixture, {
      status: "PAUSED",
      startedAt: new Date("2026-08-06T08:00:00.000Z"),
      endedAt: now,
      pauses: [
        {
          startedAt: new Date("2026-08-06T09:00:00.000Z"),
          endedAt: new Date("2026-08-06T09:30:00.000Z"),
        },
        {
          startedAt: new Date("2026-08-06T10:00:00.000Z"),
          endedAt: null,
        },
      ],
    });
    activityIds.push(pausedId);
    const repository = createActivitiesMutationRepository(database);

    const overlap = await repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-06T09:45:00.000Z"),
      endedAt: new Date("2026-08-06T10:00:00.000Z"),
    }), fixture.actor, now);
    if (overlap.kind === "CREATED") activityIds.push(overlap.activity.id);
    expect(overlap).toEqual({ kind: "TIME_OVERLAP" });

    const pausedGap = await repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-06T10:00:00.000Z"),
      endedAt: new Date("2026-08-06T11:00:00.000Z"),
    }), fixture.actor, now);
    expect(pausedGap.kind).toBe("CREATED");
    if (pausedGap.kind === "CREATED") activityIds.push(pausedGap.activity.id);
  });

  it("detects a productive conflict for every member of a group and derives its order branch and active historical team", async () => {
    const conflictId = await createHistoricalActivity(fixture, {
      startedAt: new Date("2026-08-06T10:00:00.000Z"), endedAt: new Date("2026-08-06T11:00:00.000Z"),
      team: [{ technicianId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    });
    activityIds.push(conflictId);
    const repository = createActivitiesMutationRepository(database);
    await expect(repository.createManualActivity(manualInput(fixture, {
      startedAt: new Date("2026-08-06T10:15:00.000Z"), endedAt: new Date("2026-08-06T10:45:00.000Z"),
      team: [
        { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "50.00" },
        { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
      ],
    }), fixture.actor, now)).resolves.toEqual({ kind: "TIME_OVERLAP" });
    const ordered = await repository.createManualActivity(manualInput(fixture, {
      orderId: fixture.orderId,
      startedAt: new Date("2026-08-05T08:00:00.000Z"),
      endedAt: new Date("2026-08-05T09:00:00.000Z"),
      team: [
        { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "50.00" },
        { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
      ],
    }), fixture.actor, now);
    expect(ordered).toMatchObject({ kind: "CREATED", activity: { sucursal: { id: fixture.branchId }, orden: { id: fixture.orderId } } });
    if (ordered.kind === "CREATED") activityIds.push(ordered.activity.id);
    const leaderAssignment = await database.ordenTecnico.findFirstOrThrow({
      where: { ordenId: fixture.orderId, tecnicoId: fixture.leaderId, unassignedAt: null },
      select: { id: true, assignedAt: true },
    });
    await database.ordenTecnico.update({
      where: { id: leaderAssignment.id },
      data: { assignedAt: new Date("2026-08-05T07:00:00.000Z") },
    });
    await expect(repository.createManualActivity(manualInput(fixture, {
      orderId: fixture.orderId,
      startedAt: new Date("2026-08-05T05:00:00.000Z"),
      endedAt: new Date("2026-08-05T06:00:00.000Z"),
      team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }), fixture.actor, now)).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" });
    await database.ordenTecnico.update({
      where: { id: leaderAssignment.id },
      data: { assignedAt: leaderAssignment.assignedAt },
    });
  });

  it("validates manual work against the matching append-only assignment cycle", async () => {
    const repository = createActivitiesMutationRepository(database);
    const original = await database.ordenTecnico.findFirstOrThrow({
      where: { ordenId: fixture.orderId, tecnicoId: fixture.leaderId, unassignedAt: null },
      select: { id: true, assignedAt: true },
    });
    const reopenedId = randomUUID();
    await database.ordenTecnico.update({
      where: { id: original.id },
      data: {
        assignedAt: new Date("2026-08-05T07:00:00.000Z"),
        unassignedAt: new Date("2026-08-05T08:00:00.000Z"),
      },
    });
    await database.ordenTecnico.create({
      data: {
        id: reopenedId,
        ordenId: fixture.orderId,
        tecnicoId: fixture.leaderId,
        role: "PRIMARY",
        assignedAt: new Date("2026-08-05T09:00:00.000Z"),
      },
    });

    try {
      const historical = await repository.createManualActivity(manualInput(fixture, {
        orderId: fixture.orderId,
        startedAt: new Date("2026-08-05T07:15:00.000Z"),
        endedAt: new Date("2026-08-05T07:30:00.000Z"),
      }), fixture.actor, now);
      expect(historical.kind).toBe("CREATED");
      if (historical.kind === "CREATED") activityIds.push(historical.activity.id);

      await expect(repository.createManualActivity(manualInput(fixture, {
        orderId: fixture.orderId,
        startedAt: new Date("2026-08-05T08:15:00.000Z"),
        endedAt: new Date("2026-08-05T08:30:00.000Z"),
      }), fixture.actor, now)).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" });

      const current = await repository.createManualActivity(manualInput(fixture, {
        orderId: fixture.orderId,
        startedAt: new Date("2026-08-05T09:15:00.000Z"),
        endedAt: new Date("2026-08-05T09:30:00.000Z"),
      }), fixture.actor, now);
      expect(current.kind).toBe("CREATED");
      if (current.kind === "CREATED") activityIds.push(current.activity.id);
    } finally {
      await database.ordenTecnico.deleteMany({ where: { id: reopenedId } });
      await database.ordenTecnico.update({
        where: { id: original.id },
        data: { assignedAt: original.assignedAt, unassignedAt: null },
      });
    }
  });

  it("serializes overlapping manual writes behind sorted technician advisory locks", async () => {
    const lockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const secondDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    let releaseLock: () => void = () => undefined;
    let markLockAcquired: () => void = () => undefined;
    const lockAcquired = new Promise<void>((resolve) => { markLockAcquired = resolve; });
    const holdLock = new Promise<void>((resolve) => { releaseLock = resolve; });
    const lockTransaction = lockerDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fixture.leaderId}))`;
      markLockAcquired();
      await holdLock;
    });
    let first: Promise<ActivityMutationResult> | undefined;
    let second: Promise<ActivityMutationResult> | undefined;
    try {
      await lockAcquired;
      const input = manualInput(fixture, {
        startedAt: new Date("2026-08-05T07:00:00.000Z"),
        endedAt: new Date("2026-08-05T08:00:00.000Z"),
        team: [
          { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
          { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "50.00" },
        ],
      });
      first = createActivitiesMutationRepository(database).createManualActivity(input, fixture.actor, now);
      second = createActivitiesMutationRepository(secondDatabase).createManualActivity(input, fixture.actor, now);
      const lowerLocks = await waitForTechnicianLockWaiters(fixture.leaderId, 2);
      const writerPids = lowerLocks
        .filter(({ granted }) => !granted)
        .map(({ pid }) => pid);
      expect(writerPids).toHaveLength(2);
      expect(new Set(writerPids).size).toBe(2);
      expect(lowerLocks.filter(({ granted }) => !granted)).toEqual(
        writerPids.map((pid) => ({ pid, granted: false })),
      );
      const higherLocks = await Promise.all(writerPids.map((pid) => database.$queryRaw<AdvisoryLockRecord[]>`
        SELECT pid, granted
        FROM pg_locks
        WHERE pid = ${pid}
          AND locktype = 'advisory'
          AND classid::bigint = CASE WHEN hashtext(${fixture.technicianId}) < 0 THEN 4294967295 ELSE 0 END
          AND objid::bigint = (hashtext(${fixture.technicianId})::bigint & 4294967295)
          AND objsubid = 1
      `));
      expect(higherLocks.flat()).toEqual([]);
      releaseLock();
      await lockTransaction;
      const results = await Promise.all([first, second]);
      expect(results.map(({ kind }) => kind).sort()).toEqual(["CREATED", "TIME_OVERLAP"]);
      const created = results.find((result) => result.kind === "CREATED");
      if (created?.kind === "CREATED") activityIds.push(created.activity.id);
      expect(await database.actividad.count({
        where: {
          sucursalId: fixture.branchId,
          description: "Preparar equipo de red",
          startedAt: new Date("2026-08-05T07:00:00.000Z"),
          endedAt: new Date("2026-08-05T08:00:00.000Z"),
        },
      })).toBe(1);
    } finally {
      releaseLock();
      await Promise.allSettled([lockTransaction, ...(first === undefined ? [] : [first]), ...(second === undefined ? [] : [second])]);
      const persistedIds = await database.actividad.findMany({
        where: {
          sucursalId: fixture.branchId,
          description: "Preparar equipo de red",
          startedAt: new Date("2026-08-05T07:00:00.000Z"),
          endedAt: new Date("2026-08-05T08:00:00.000Z"),
        },
        select: { id: true },
      });
      activityIds.push(...persistedIds.map(({ id }) => id).filter((id) => !activityIds.includes(id)));
      await lockerDatabase.$disconnect();
      await secondDatabase.$disconnect();
    }
  });

  it("keeps the lower lock while waiting to acquire the higher team technician lock", async () => {
    const lowerBlockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const higherBlockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const writerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    let releaseLower: () => void = () => undefined;
    let releaseHigher: () => void = () => undefined;
    let markLowerAcquired: () => void = () => undefined;
    let markHigherAcquired: () => void = () => undefined;
    const lowerAcquired = new Promise<void>((resolve) => { markLowerAcquired = resolve; });
    const higherAcquired = new Promise<void>((resolve) => { markHigherAcquired = resolve; });
    const holdLower = new Promise<void>((resolve) => { releaseLower = resolve; });
    const holdHigher = new Promise<void>((resolve) => { releaseHigher = resolve; });
    const lowerTransaction = lowerBlockerDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fixture.leaderId}))`;
      markLowerAcquired();
      await holdLower;
    });
    const higherTransaction = higherBlockerDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fixture.technicianId}))`;
      markHigherAcquired();
      await holdHigher;
    });
    let write: Promise<ActivityMutationResult> | undefined;
    try {
      await Promise.all([lowerAcquired, higherAcquired]);
      write = createActivitiesMutationRepository(writerDatabase).createManualActivity(
        manualInput(fixture, {
          startedAt: new Date("2026-08-05T04:00:00.000Z"),
          endedAt: new Date("2026-08-05T05:00:00.000Z"),
          team: [
            { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
            { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "50.00" },
          ],
        }),
        fixture.actor,
        now,
      );
      const initialLocks = await waitForTechnicianLockWaiters(fixture.leaderId, 1);
      const writerPid = initialLocks.find(({ granted }) => !granted)?.pid;
      if (writerPid === undefined) throw new Error("Expected a writer waiting for the lower technician lock");
      releaseLower();
      await lowerTransaction;
      await waitForTechnicianLockState(fixture.leaderId, writerPid, true);
      await waitForTechnicianLockState(fixture.technicianId, writerPid, false);
      releaseHigher();
      await higherTransaction;
      const result = await write;
      expect(result.kind).toBe("CREATED");
      if (result.kind === "CREATED") activityIds.push(result.activity.id);
    } finally {
      releaseLower();
      releaseHigher();
      await Promise.allSettled([
        lowerTransaction,
        higherTransaction,
        ...(write === undefined ? [] : [write]),
      ]);
      const persistedIds = await database.actividad.findMany({
        where: {
          sucursalId: fixture.branchId,
          description: "Preparar equipo de red",
          startedAt: new Date("2026-08-05T04:00:00.000Z"),
          endedAt: new Date("2026-08-05T05:00:00.000Z"),
        },
        select: { id: true },
      });
      activityIds.push(...persistedIds.map(({ id }) => id).filter((id) => !activityIds.includes(id)));
      await lowerBlockerDatabase.$disconnect();
      await higherBlockerDatabase.$disconnect();
      await writerDatabase.$disconnect();
    }
  });

  it("normalizes an ACTIVITIES_CREATE_OWN technician to an implicit 100 percent self team", async () => {
    const repository = createActivitiesMutationRepository(database);
    const technicianActor = {
      ...fixture.actor,
      technicianId: fixture.technicianId,
      permissions: ["ACTIVITIES_CREATE_OWN"],
    };
    const own = await repository.createActivity(activityInput(fixture, { team: [{ technicianId: fixture.foreignTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }), technicianActor, now);
    expect(own.kind).toBe("CREATED");
    if (own.kind !== "CREATED") return;
    activityIds.push(own.activity.id);
    expect(own.activity.tecnicos).toMatchObject([{ tecnico: { id: fixture.technicianId }, role: "RESPONSIBLE" }]);
    expect(own.activity.tecnicos[0]?.participationPercentage.toFixed(2)).toBe("100.00");
  });

  it("preserves a group team for an ACTIVITIES_MANAGE actor linked to a technician and derives order defaults", async () => {
    const repository = createActivitiesMutationRepository(database);
    const linkedManager = { ...fixture.actor, technicianId: fixture.technicianId };
    const managedGroup = await repository.createActivity(activityInput(fixture, { team: [
      { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "60.00" },
      { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "40.00" },
    ] }), linkedManager, now);
    expect(managedGroup).toMatchObject({ kind: "CREATED" });
    if (managedGroup.kind !== "CREATED") return;
    activityIds.push(managedGroup.activity.id);
    expect(managedGroup.activity.tecnicos.map(({ tecnico, role, participationPercentage }) => ({
      technicianId: tecnico.id, role, participationPercentage: participationPercentage.toFixed(2),
    }))).toEqual([
      { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "60.00" },
      { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "40.00" },
    ]);
    const ordered = await repository.createActivity(orderInput(fixture), fixture.actor, now);
    expect(ordered.kind).toBe("CREATED");
    if (ordered.kind !== "CREATED") return;
    activityIds.push(ordered.activity.id);
    expect(ordered.activity).toMatchObject({ sucursal: { id: fixture.branchId }, orden: { id: fixture.orderId }, tecnicos: [{ tecnico: { id: fixture.leaderId }, role: "RESPONSIBLE" }] });
    expect(ordered.activity.tecnicos[0]?.participationPercentage.toFixed(2)).toBe("100.00");
    const explicitOrderTeam = await repository.createActivity(orderInput(fixture, { team: [
      { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "50.00" },
      { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
    ] }), fixture.actor, now);
    expect(explicitOrderTeam).toMatchObject({ kind: "CREATED", activity: { sucursal: { id: fixture.branchId }, orden: { id: fixture.orderId } } });
    if (explicitOrderTeam.kind === "CREATED") {
      activityIds.push(explicitOrderTeam.activity.id);
      expect(explicitOrderTeam.activity.tecnicos.map(({ participationPercentage }) => participationPercentage.toFixed(2))).toEqual(["50.00", "50.00"]);
    }
  });

  it("rejects inactive references and invalid or foreign order teams without persisting anything", async () => {
    const repository = createActivitiesMutationRepository(database);
    await expect(repository.createActivity(activityInput(fixture, { branchId: fixture.inactiveBranchId }), fixture.actor, now)).resolves.toEqual({ kind: "RESOURCE_INACTIVE" });
    await expect(repository.createActivity(activityInput(fixture, { branchId: fixture.deletedBranchId }), fixture.actor, now)).resolves.toEqual({ kind: "RESOURCE_INACTIVE" });
    await expect(repository.createActivity(activityInput(fixture, { activityTypeId: fixture.inactiveTypeId }), fixture.actor, now)).resolves.toEqual({ kind: "ACTIVITY_TYPE_NOT_FOUND" });
    await expect(repository.createActivity(activityInput(fixture, { activityTypeId: fixture.deletedTypeId }), fixture.actor, now)).resolves.toEqual({ kind: "ACTIVITY_TYPE_NOT_FOUND" });
    await expect(repository.createActivity(activityInput(fixture, { team: [{ technicianId: fixture.inactiveTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }), fixture.actor, now)).resolves.toEqual({ kind: "RESOURCE_INACTIVE" });
    await expect(repository.createActivity(orderInput(fixture, { team: [{ technicianId: fixture.foreignTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }), fixture.actor, now)).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" });
    const technicianAssignment = await database.ordenTecnico.findFirstOrThrow({
      where: { ordenId: fixture.orderId, tecnicoId: fixture.technicianId, unassignedAt: null },
      select: { id: true },
    });
    await database.ordenTecnico.update({
      where: { id: technicianAssignment.id },
      data: { unassignedAt: new Date("2030-01-01T00:00:00.000Z") },
    });
    await expect(repository.createActivity(orderInput(fixture, { team: [
      { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "50.00" },
      { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
    ] }), fixture.actor, now)).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" });
    await database.ordenTecnico.update({
      where: { id: technicianAssignment.id },
      data: { unassignedAt: null },
    });
    await expect(repository.createActivity(orderInput(fixture, { orderId: fixture.cancelledOrderId }), fixture.actor, now)).resolves.toEqual({ kind: "RESOURCE_INACTIVE" });
    for (const team of [
      [{ technicianId: fixture.leaderId, role: "RESPONSIBLE" as const, participationPercentage: "50.00" }, { technicianId: fixture.leaderId, role: "PARTICIPANT" as const, participationPercentage: "50.00" }],
      [{ technicianId: fixture.leaderId, role: "PARTICIPANT" as const, participationPercentage: "100.00" }],
      [{ technicianId: fixture.leaderId, role: "RESPONSIBLE" as const, participationPercentage: "50.00" }, { technicianId: fixture.technicianId, role: "RESPONSIBLE" as const, participationPercentage: "50.00" }],
      [{ technicianId: fixture.leaderId, role: "RESPONSIBLE" as const, participationPercentage: "99.99" }],
    ]) await expect(repository.createActivity(activityInput(fixture, { team }), fixture.actor, now)).resolves.toEqual({ kind: "INVALID_PARTICIPATION_TOTAL" });
    expect(await database.actividad.count({ where: { sucursalId: fixture.branchId, description: "Preparar equipo de red" } })).toBe(0);
  });

  it("edits and replaces only pending activities with one version increment and correct audit actions", async () => {
    const repository = createActivitiesMutationRepository(database);
    const created = await repository.createActivity(activityInput(fixture, { observations: "Observacion original" }), fixture.actor, now);
    if (created.kind !== "CREATED") throw new Error("fixture activity was not created");
    activityIds.push(created.activity.id);
    const updated = await repository.updateActivity(created.activity.id, { version: 1, activityTypeId: fixture.alternateActivityTypeId, description: "Descripcion corregida", observations: null }, fixture.actor, new Date("2026-08-06T12:01:00.000Z"));
    expect(updated).toMatchObject({ kind: "UPDATED", activity: { version: 2, description: "Descripcion corregida", observations: null, tipoActividad: { id: fixture.alternateActivityTypeId } } });
    const team = await repository.replaceActivityTeam(created.activity.id, { version: 2, team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "75.00" }, { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "25.00" }] }, fixture.actor, new Date("2026-08-06T12:02:00.000Z"));
    expect(team).toMatchObject({ kind: "UPDATED", activity: { version: 3 } });
    if (team.kind === "UPDATED") expect(team.activity.tecnicos.map(({ participationPercentage }) => participationPercentage.toFixed(2))).toEqual(["75.00", "25.00"]);
    const visibleTechnicianIds = await database.actividadVisibilidadTecnico.findMany({
      where: { actividadId: created.activity.id },
      orderBy: { tecnicoId: "asc" },
      select: { tecnicoId: true },
    });
    expect(visibleTechnicianIds.map(({ tecnicoId }) => tecnicoId)).toEqual(
      [fixture.leaderId, fixture.technicianId].sort(),
    );
    await expect(repository.updateActivity(created.activity.id, { version: 1, description: "Stale" }, fixture.actor, now)).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    await database.actividad.update({ where: { id: created.activity.id }, data: { status: "IN_PROGRESS" } });
    await expect(repository.replaceActivityTeam(created.activity.id, { version: 3, team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }, fixture.actor, now)).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });
    const audits = await database.auditoria.findMany({
      where: { entity: "Actividad", entityId: created.activity.id },
      orderBy: { occurredAt: "asc" },
      select: { action: true, entity: true, entityId: true, userId: true, occurredAt: true, requestId: true, ipAddress: true, userAgent: true, reason: true, beforeData: true, afterData: true },
    });
    const original = {
      branchId: fixture.branchId, orderId: null, activityTypeId: fixture.activityTypeId,
      status: "PENDING", description: "Preparar equipo de red", observations: "Observacion original", version: 1,
      team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    };
    const corrected = {
      branchId: fixture.branchId, orderId: null, activityTypeId: fixture.alternateActivityTypeId,
      status: "PENDING", description: "Descripcion corregida", observations: null, version: 2,
      team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    };
    const replaced = {
      ...corrected,
      version: 3,
      team: [
        { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "75.00" },
        { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "25.00" },
      ],
    };
    expect(audits).toEqual([
      { action: "ACTIVITY_CREATED", entity: "Actividad", entityId: created.activity.id, userId: fixture.actor.userId, occurredAt: now, requestId: fixture.actor.requestId, ipAddress: null, userAgent: null, reason: null, beforeData: null, afterData: original },
      { action: "ACTIVITY_UPDATED", entity: "Actividad", entityId: created.activity.id, userId: fixture.actor.userId, occurredAt: new Date("2026-08-06T12:01:00.000Z"), requestId: fixture.actor.requestId, ipAddress: null, userAgent: null, reason: null, beforeData: original, afterData: corrected },
      { action: "ACTIVITY_TEAM_UPDATED", entity: "Actividad", entityId: created.activity.id, userId: fixture.actor.userId, occurredAt: new Date("2026-08-06T12:02:00.000Z"), requestId: fixture.actor.requestId, ipAddress: null, userAgent: null, reason: null, beforeData: corrected, afterData: replaced },
    ]);
  });

  it("retries a real serializable update race so one write wins and the stale writer returns VERSION_CONFLICT", async () => {
    const created = await createActivitiesMutationRepository(database).createActivity(activityInput(fixture), fixture.actor, now);
    if (created.kind !== "CREATED") throw new Error("fixture activity was not created");
    activityIds.push(created.activity.id);
    const lockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const secondDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    let releaseLock: () => void = () => undefined;
    let markLockAcquired: () => void = () => undefined;
    const lockAcquired = new Promise<void>((resolve) => { markLockAcquired = resolve; });
    const holdLock = new Promise<void>((resolve) => { releaseLock = resolve; });
    const lockTransaction = lockerDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${updateBarrierNamespace}, ${updateBarrierKey})`;
      markLockAcquired();
      await holdLock;
    });
    let first: Promise<ActivityMutationResult> | undefined;
    let second: Promise<ActivityMutationResult> | undefined;
    try {
      await database.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION activity_update_test_barrier()
        RETURNS trigger AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(${updateBarrierNamespace}, ${updateBarrierKey});
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS activity_update_test_barrier ON actividad;
        CREATE TRIGGER activity_update_test_barrier
        BEFORE UPDATE ON actividad
        FOR EACH ROW EXECUTE FUNCTION activity_update_test_barrier();
      `);
      await lockAcquired;
      first = createActivitiesMutationRepository(database).updateActivity(
        created.activity.id,
        { version: 1, description: "Primera carrera" },
        fixture.actor,
        new Date("2026-08-06T12:04:00.000Z"),
      );
      second = createActivitiesMutationRepository(secondDatabase).updateActivity(
        created.activity.id,
        { version: 1, description: "Segunda carrera" },
        fixture.actor,
        new Date("2026-08-06T12:04:00.000Z"),
      );
      await waitForActivityUpdateWaiters(2);
      releaseLock();
      await lockTransaction;
      const results = await Promise.all([first, second]);
      expect(results.map((result) => result.kind).sort()).toEqual(["UPDATED", "VERSION_CONFLICT"]);
      const activity = await database.actividad.findUniqueOrThrow({ where: { id: created.activity.id } });
      expect(activity.version).toBe(2);
      expect(await database.auditoria.count({ where: { entity: "Actividad", entityId: created.activity.id, action: "ACTIVITY_UPDATED" } })).toBe(1);
    } finally {
      releaseLock();
      await Promise.allSettled([lockTransaction, ...(first === undefined ? [] : [first]), ...(second === undefined ? [] : [second])]);
      await database.$executeRawUnsafe("DROP TRIGGER IF EXISTS activity_update_test_barrier ON actividad; DROP FUNCTION IF EXISTS activity_update_test_barrier();");
      await lockerDatabase.$disconnect();
      await secondDatabase.$disconnect();
    }
  });

  it("rolls back failed creation and a replacement with a genuinely different team when auditing fails", async () => {
    const failedCreateTransaction = database.$transaction.bind(database);
    const failedCreateDatabase = {
      ...database,
      $transaction: (callback: (tx: typeof database) => Promise<unknown>) =>
        failedCreateTransaction(async (transaction) => {
          vi.spyOn(transaction.auditoria, "create").mockRejectedValueOnce(new Error("audit failed"));
          return callback(transaction as typeof database);
        }),
    };
    const failedCreate = createActivitiesMutationRepository(failedCreateDatabase as unknown as typeof database);
    await expect(failedCreate.createActivity(activityInput(fixture), fixture.actor, now)).rejects.toThrow("audit failed");
    expect(await database.actividad.count({ where: { sucursalId: fixture.branchId, description: "Preparar equipo de red" } })).toBe(0);

    const stableRepository = createActivitiesMutationRepository(database);
    const created = await stableRepository.createActivity(activityInput(fixture), fixture.actor, now);
    if (created.kind !== "CREATED") throw new Error("fixture activity was not created");
    activityIds.push(created.activity.id);
    const before = await database.actividad.findUniqueOrThrow({ where: { id: created.activity.id }, include: { tecnicos: { orderBy: { tecnicoId: "asc" } } } });
    const auditCount = await database.auditoria.count({ where: { entity: "Actividad", entityId: created.activity.id } });
    const transaction = database.$transaction.bind(database);
    const failingDatabase = { ...database, $transaction: (callback: (tx: typeof database) => Promise<unknown>) => transaction(async (tx) => { vi.spyOn(tx.auditoria, "create").mockRejectedValueOnce(new Error("audit failed")); return callback(tx as typeof database); }) };
    const repository = createActivitiesMutationRepository(failingDatabase as unknown as typeof database);
    await expect(repository.replaceActivityTeam(created.activity.id, { version: 1, team: [
      { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "65.00" },
      { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "35.00" },
    ] }, fixture.actor, new Date("2026-08-06T12:03:00.000Z"))).rejects.toThrow("audit failed");
    const after = await database.actividad.findUniqueOrThrow({ where: { id: created.activity.id }, include: { tecnicos: { orderBy: { tecnicoId: "asc" } } } });
    expect(after).toEqual(before);
    expect(await database.auditoria.count({ where: { entity: "Actividad", entityId: created.activity.id } })).toBe(auditCount);
    await expect(database.actividadVisibilidadTecnico.findMany({
      where: { actividadId: created.activity.id },
      orderBy: { tecnicoId: "asc" },
      select: { tecnicoId: true },
    })).resolves.toEqual([{ tecnicoId: fixture.leaderId }]);
  });
});
