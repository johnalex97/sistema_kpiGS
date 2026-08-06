import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createActivitiesMutationRepository } from "../../src/activities/activities.mutation.repository.js";
import type { ActivityActorContext, CreateActivityInput } from "../../src/activities/activities.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const now = new Date("2026-08-06T12:00:00.000Z");

interface Fixture {
  clientId: string;
  branchId: string;
  inactiveBranchId: string;
  serviceTypeId: string;
  activityTypeId: string;
  inactiveTypeId: string;
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
    clientId: randomUUID(), branchId: randomUUID(), inactiveBranchId: randomUUID(),
    serviceTypeId: randomUUID(), activityTypeId: randomUUID(), inactiveTypeId: randomUUID(),
    orderId: randomUUID(), cancelledOrderId: randomUUID(), leaderId: randomUUID(),
    technicianId: randomUUID(), inactiveTechnicianId: randomUUID(), foreignTechnicianId: randomUUID(),
  };
  const user = await database.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" }, select: { id: true } });
  await database.cliente.create({ data: { id: ids.clientId, code: `AM-${suffix}`, tradeName: `Cliente ${suffix}` } });
  await database.sucursalCliente.createMany({ data: [
    { id: ids.branchId, clienteId: ids.clientId, code: "MAIN", name: "Principal", address: "Centro" },
    { id: ids.inactiveBranchId, clienteId: ids.clientId, code: "INACTIVE", name: "Inactiva", address: "Centro", isActive: false },
  ] });
  await database.tipoServicio.create({ data: { id: ids.serviceTypeId, code: `AMS-${suffix}`, name: "Servicio" } });
  await database.tipoActividad.createMany({ data: [
    { id: ids.activityTypeId, code: `AMA-${suffix}`, name: "Trabajo" },
    { id: ids.inactiveTypeId, code: `AMI-${suffix}`, name: "Inactivo", isActive: false },
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
  await database.tipoActividad.deleteMany({ where: { id: { in: [fixture.activityTypeId, fixture.inactiveTypeId] } } });
  await database.tipoServicio.delete({ where: { id: fixture.serviceTypeId } });
  await database.sucursalCliente.deleteMany({ where: { id: { in: [fixture.branchId, fixture.inactiveBranchId] } } });
  await database.cliente.delete({ where: { id: fixture.clientId } });
}

afterAll(disconnectTestDatabase);

describe("activities pending mutation repository", () => {
  let fixture: Fixture;
  const activityIds: string[] = [];
  beforeAll(async () => { fixture = await createFixture(); });
  afterEach(async () => { await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: activityIds } } }); await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } }); await database.actividad.deleteMany({ where: { id: { in: activityIds } } }); activityIds.length = 0; vi.restoreAllMocks(); });
  afterAll(async () => { await removeFixture(fixture, activityIds); });

  it("creates leader individual and group activities with exact team credits and an atomic audit snapshot", async () => {
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
    const audit = await database.auditoria.findFirstOrThrow({ where: { entity: "Actividad", entityId: group.activity.id } });
    expect(audit).toMatchObject({ action: "ACTIVITY_CREATED", userId: fixture.actor.userId, occurredAt: now, requestId: fixture.actor.requestId, beforeData: null, afterData: expect.objectContaining({ version: 1, team: expect.arrayContaining([expect.objectContaining({ technicianId: fixture.leaderId, participationPercentage: "60.00" })]) }) });
  });

  it("creates technicians as an implicit 100 percent self team and derives the branch and default primary from an order", async () => {
    const repository = createActivitiesMutationRepository(database);
    const technicianActor = { ...fixture.actor, technicianId: fixture.technicianId };
    const own = await repository.createActivity(activityInput(fixture, { team: [{ technicianId: fixture.foreignTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }), technicianActor, now);
    expect(own.kind).toBe("CREATED");
    if (own.kind !== "CREATED") return;
    activityIds.push(own.activity.id);
    expect(own.activity.tecnicos).toMatchObject([{ tecnico: { id: fixture.technicianId }, role: "RESPONSIBLE" }]);
    expect(own.activity.tecnicos[0]?.participationPercentage.toFixed(2)).toBe("100.00");
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
    await expect(repository.createActivity(activityInput(fixture, { activityTypeId: fixture.inactiveTypeId }), fixture.actor, now)).resolves.toEqual({ kind: "ACTIVITY_TYPE_NOT_FOUND" });
    await expect(repository.createActivity(activityInput(fixture, { team: [{ technicianId: fixture.inactiveTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }), fixture.actor, now)).resolves.toEqual({ kind: "RESOURCE_INACTIVE" });
    await expect(repository.createActivity(orderInput(fixture, { team: [{ technicianId: fixture.foreignTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }), fixture.actor, now)).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" });
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
    const created = await repository.createActivity(activityInput(fixture), fixture.actor, now);
    if (created.kind !== "CREATED") throw new Error("fixture activity was not created");
    activityIds.push(created.activity.id);
    const updated = await repository.updateActivity(created.activity.id, { version: 1, description: "Descripcion corregida", observations: "Nota" }, fixture.actor, new Date("2026-08-06T12:01:00.000Z"));
    expect(updated).toMatchObject({ kind: "UPDATED", activity: { version: 2, description: "Descripcion corregida", observations: "Nota" } });
    const team = await repository.replaceActivityTeam(created.activity.id, { version: 2, team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "75.00" }, { technicianId: fixture.technicianId, role: "PARTICIPANT", participationPercentage: "25.00" }] }, fixture.actor, new Date("2026-08-06T12:02:00.000Z"));
    expect(team).toMatchObject({ kind: "UPDATED", activity: { version: 3 } });
    if (team.kind === "UPDATED") expect(team.activity.tecnicos.map(({ participationPercentage }) => participationPercentage.toFixed(2))).toEqual(["75.00", "25.00"]);
    await expect(repository.updateActivity(created.activity.id, { version: 1, description: "Stale" }, fixture.actor, now)).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    await database.actividad.update({ where: { id: created.activity.id }, data: { status: "IN_PROGRESS" } });
    await expect(repository.replaceActivityTeam(created.activity.id, { version: 3, team: [{ technicianId: fixture.leaderId, role: "RESPONSIBLE", participationPercentage: "100.00" }] }, fixture.actor, now)).resolves.toEqual({ kind: "INVALID_ACTIVITY_STATE" });
    const actions = await database.auditoria.findMany({ where: { entity: "Actividad", entityId: created.activity.id }, select: { action: true } });
    expect(actions.map(({ action }) => action)).toEqual(["ACTIVITY_CREATED", "ACTIVITY_UPDATED", "ACTIVITY_TEAM_UPDATED"]);
  });

  it("rolls back activity, team, version, timestamp and audit when auditing fails", async () => {
    const stableRepository = createActivitiesMutationRepository(database);
    const created = await stableRepository.createActivity(activityInput(fixture), fixture.actor, now);
    if (created.kind !== "CREATED") throw new Error("fixture activity was not created");
    activityIds.push(created.activity.id);
    const before = await database.actividad.findUniqueOrThrow({ where: { id: created.activity.id }, include: { tecnicos: { orderBy: { tecnicoId: "asc" } } } });
    const auditCount = await database.auditoria.count({ where: { entity: "Actividad", entityId: created.activity.id } });
    const transaction = database.$transaction.bind(database);
    const failingDatabase = { ...database, $transaction: (callback: (tx: typeof database) => Promise<unknown>) => transaction(async (tx) => { vi.spyOn(tx.auditoria, "create").mockRejectedValueOnce(new Error("audit failed")); return callback(tx as typeof database); }) };
    const repository = createActivitiesMutationRepository(failingDatabase as unknown as typeof database);
    await expect(repository.updateActivity(created.activity.id, { version: 1, description: "No debe persistir" }, fixture.actor, new Date("2026-08-06T12:03:00.000Z"))).rejects.toThrow("audit failed");
    const after = await database.actividad.findUniqueOrThrow({ where: { id: created.activity.id }, include: { tecnicos: { orderBy: { tecnicoId: "asc" } } } });
    expect(after).toEqual(before);
    expect(await database.auditoria.count({ where: { entity: "Actividad", entityId: created.activity.id } })).toBe(auditCount);
  });
});
