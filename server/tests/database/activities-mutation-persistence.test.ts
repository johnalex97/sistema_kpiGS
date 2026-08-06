import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient } from "../../src/config/database.js";
import { createActivitiesMutationRepository } from "../../src/activities/activities.mutation.repository.js";
import type { ActivityMutationResult } from "../../src/activities/activities.repository.types.js";
import type { ActivityActorContext, CreateActivityInput } from "../../src/activities/activities.types.js";
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

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    clientId: randomUUID(), branchId: randomUUID(), inactiveBranchId: randomUUID(), deletedBranchId: randomUUID(),
    serviceTypeId: randomUUID(), activityTypeId: randomUUID(), alternateActivityTypeId: randomUUID(), inactiveTypeId: randomUUID(), deletedTypeId: randomUUID(),
    orderId: randomUUID(), cancelledOrderId: randomUUID(), leaderId: randomUUID(),
    technicianId: randomUUID(), inactiveTechnicianId: randomUUID(), foreignTechnicianId: randomUUID(),
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
    { ordenId: ids.orderId, tecnicoId: ids.leaderId, role: "PRIMARY" },
    { ordenId: ids.orderId, tecnicoId: ids.technicianId, role: "SUPPORT" },
  ] });
  return { ...ids, actor: { userId: user.id, technicianId: null, permissions: ["ACTIVITIES_MANAGE"], requestId: randomUUID() } };
}

async function removeFixture(fixture: Fixture, activityIds: string[]): Promise<void> {
  await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } });
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
  afterEach(async () => { await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } }); await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } }); await database.actividad.deleteMany({ where: { id: { in: activityIds } } }); activityIds.length = 0; vi.restoreAllMocks(); });
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
    await database.ordenTecnico.update({
      where: { ordenId_tecnicoId: { ordenId: fixture.orderId, tecnicoId: fixture.technicianId } },
      data: { unassignedAt: new Date("2030-01-01T00:00:00.000Z") },
    });
    await expect(repository.createActivity(orderInput(fixture, { team: [
      { technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "50.00" },
      { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
    ] }), fixture.actor, now)).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" });
    await database.ordenTecnico.update({
      where: { ordenId_tecnicoId: { ordenId: fixture.orderId, tecnicoId: fixture.technicianId } },
      data: { unassignedAt: null },
    });
    await expect(repository.createActivity(orderInput(fixture, { orderId: fixture.cancelledOrderId }), fixture.actor, now)).resolves.toEqual({ kind: "RESOURCE_INACTIVE" });
    for (const team of [
      [{ technicianId: fixture.leaderId, role: "RESPONSIBLE" as const, participationPercentage: "50.00" }, { technicianId: fixture.leaderId, role: "PARTICIPANT" as const, participationPercentage: "50.00" }],
      [{ technicianId: fixture.leaderId, role: "PARTICIPANT" as const, participationPercentage: "100.00" }],
      [{ technicianId: fixture.leaderId, role: "RESPONSIBLE" as const, participationPercentage: "50.00" }, { technicianId: fixture.technicianId, role: "RESPONSIBLE" as const, participationPercentage: "50.00" }],
      [{ technicianId: fixture.leaderId, role: "RESPONSIBLE" as const, participationPercentage: "99.99" }],
    ]) await expect(repository.createActivity(activityInput(fixture, { team }), fixture.actor, now)).resolves.toEqual({ kind: "INVALID_PARTICIPATION_TOTAL" });
    expect(await database.actividad.count({ where: { description: "Preparar equipo de red" } })).toBe(0);
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
    expect(await database.actividad.count({ where: { description: "Preparar equipo de red" } })).toBe(0);

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
  });
});
