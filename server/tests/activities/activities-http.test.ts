import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { parseEnvironment } from "../../src/config/env.js";
import { silentLogger } from "../../src/utils/logger.js";
import {
  database,
  disconnectTestDatabase,
} from "../database/database-test-context.js";

const allowedOrigin = "http://localhost:5173";
const env = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGIN: allowedOrigin,
  DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});
const password = "GeekActivitiesHttp-2026!";
const users = {
  admin: { id: randomUUID(), email: `activities.admin.${randomUUID()}@example.test` },
  supervisor: { id: randomUUID(), email: `activities.supervisor.${randomUUID()}@example.test` },
  responsible: { id: randomUUID(), email: `activities.responsible.${randomUUID()}@example.test` },
  participant: { id: randomUUID(), email: `activities.participant.${randomUUID()}@example.test` },
  foreign: { id: randomUUID(), email: `activities.foreign.${randomUUID()}@example.test` },
  provisional: { id: randomUUID(), email: `activities.provisional.${randomUUID()}@example.test` },
  noActivityPermissions: { id: randomUUID(), email: `activities.none.${randomUUID()}@example.test` },
} as const;
const technicianIds = {
  responsible: randomUUID(),
  participant: randomUUID(),
  foreign: randomUUID(),
} as const;
const createdActivityIds: string[] = [];
let branchId = "";
let activityTypeId = "";

beforeAll(async () => {
  await seedDatabase(database);
  const [roles, branch, activityType, passwordHash] = await Promise.all([
    database.rol.findMany({ where: { code: { in: ["ADMIN", "SUPERVISOR", "TECHNICIAN"] } } }),
    database.sucursalCliente.findFirstOrThrow({ where: { isActive: true, deletedAt: null } }),
    database.tipoActividad.findFirstOrThrow({ where: { isActive: true, deletedAt: null } }),
    hashPassword(password, { N: 1024, r: 8, p: 1, maxmem: 16 * 1024 * 1024 }),
  ]);
  branchId = branch.id;
  activityTypeId = activityType.id;
  const roleIds = Object.fromEntries(roles.map((role) => [role.code, role.id]));
  await database.usuario.createMany({
    data: [
      { ...users.admin, displayName: "Administrador HTTP actividades", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.supervisor, displayName: "Supervisor HTTP actividades", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.responsible, displayName: "Responsable HTTP actividades", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.participant, displayName: "Participante HTTP actividades", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.foreign, displayName: "Ajeno HTTP actividades", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.provisional, displayName: "Provisional HTTP actividades", status: "ACTIVE", mustChangePassword: true, passwordHash },
      { ...users.noActivityPermissions, displayName: "Sin permisos HTTP actividades", status: "ACTIVE", mustChangePassword: false, passwordHash },
    ],
  });
  await database.usuarioRol.createMany({
    data: [
      { usuarioId: users.admin.id, rolId: roleIds.ADMIN! },
      { usuarioId: users.supervisor.id, rolId: roleIds.SUPERVISOR! },
      { usuarioId: users.responsible.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.participant.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.foreign.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.provisional.id, rolId: roleIds.ADMIN! },
    ],
  });
  await database.tecnico.createMany({
    data: [
      { id: technicianIds.responsible, code: `AHR-${randomUUID().slice(0, 8)}`, fullName: "Responsable HTTP actividades", userId: users.responsible.id },
      { id: technicianIds.participant, code: `AHP-${randomUUID().slice(0, 8)}`, fullName: "Participante HTTP actividades", userId: users.participant.id },
      { id: technicianIds.foreign, code: `AHF-${randomUUID().slice(0, 8)}`, fullName: "Ajeno HTTP actividades", userId: users.foreign.id },
    ],
  });
});

afterAll(async () => {
  await database.pausaActividad.deleteMany({ where: { actividadId: { in: createdActivityIds } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: createdActivityIds } } });
  await database.auditoria.deleteMany({ where: { entity: "Actividad", entityId: { in: createdActivityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: createdActivityIds } } });
  await database.tecnico.deleteMany({ where: { id: { in: Object.values(technicianIds) } } });
  const userIds = Object.values(users).map(({ id }) => id);
  await database.sesion.deleteMany({ where: { userId: { in: userIds } } });
  await database.usuarioRol.deleteMany({ where: { usuarioId: { in: userIds } } });
  await database.usuario.deleteMany({ where: { id: { in: userIds } } });
  await disconnectTestDatabase();
});

async function authenticatedAgent(user: { email: string }) {
  const agent = request.agent(createApp({ env, logger: silentLogger, database }));
  await agent.post("/api/v1/auth/login").set("Origin", allowedOrigin).send({ email: user.email, password }).expect(200);
  return agent;
}

function pendingInput(description: string, team?: unknown) {
  return { branchId, activityTypeId, description, ...(team === undefined ? {} : { team }) };
}

function expectSuccessEnvelope(response: request.Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({
    success: true,
    errors: [],
    meta: { requestId: expect.any(String) },
  });
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function aggregateSnapshot(activityId: string) {
  const [activity, audits] = await Promise.all([
    database.actividad.findUniqueOrThrow({
      where: { id: activityId },
      include: {
        tecnicos: { orderBy: { tecnicoId: "asc" } },
        pausas: { orderBy: { id: "asc" } },
      },
    }),
    database.auditoria.findMany({
      where: { entity: "Actividad", entityId: activityId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    activity: {
      id: activity.id,
      status: activity.status,
      version: activity.version,
      startedAt: iso(activity.startedAt),
      endedAt: iso(activity.endedAt),
      pausedMinutes: activity.pausedMinutes,
      productiveMinutes: activity.productiveMinutes,
      createdAt: iso(activity.createdAt),
      updatedAt: iso(activity.updatedAt),
      team: activity.tecnicos.map((member) => ({
        technicianId: member.tecnicoId,
        role: member.role,
        participationPercentage: member.participationPercentage.toFixed(2),
        startedAt: iso(member.startedAt),
        endedAt: iso(member.endedAt),
      })),
      pauses: activity.pausas.map((pause) => ({
        id: pause.id,
        startedAt: iso(pause.startedAt),
        endedAt: iso(pause.endedAt),
        reason: pause.reason,
      })),
    },
    audits: audits.map((audit) => ({
      id: audit.id,
      action: audit.action,
      userId: audit.userId,
      reason: audit.reason,
      occurredAt: iso(audit.occurredAt),
      requestId: audit.requestId,
      beforeData: audit.beforeData,
      afterData: audit.afterData,
    })),
  };
}

describe("activities HTTP", () => {
  it("exposes the protected activity type catalog with the standard envelope", async () => {
    const agent = await authenticatedAgent(users.admin);

    const response = await agent.get("/api/v1/activity-types").expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: expect.any(Array),
      errors: [],
      meta: { requestId: expect.any(String) },
    });
  });

  it("runs all activity operations with public data, versions and cleanup IDs", async () => {
    const admin = await authenticatedAgent(users.admin);
    const responsible = await authenticatedAgent(users.responsible);
    const team = [
      { technicianId: technicianIds.responsible, role: "RESPONSIBLE", participationPercentage: "50.00" },
      { technicianId: technicianIds.participant, role: "PARTICIPANT", participationPercentage: "50.00" },
    ];
    const created = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Diagnosticar equipo HTTP", team)).expect(201);
    const activityId = created.body.data.id as string;
    createdActivityIds.push(activityId);
    expectSuccessEnvelope(created, 201);
    expect(created.headers.location).toBe(`/api/v1/activities/${activityId}`);
    expect(created.body.data).toMatchObject({ status: "PENDING", version: 1, description: "Diagnosticar equipo HTTP" });

    const listed = await responsible.get("/api/v1/activities").expect(200);
    expectSuccessEnvelope(listed, 200);
    expect(listed.body.data.items.map((item: { id: string }) => item.id)).toContain(activityId);
    const detail = await responsible.get(`/api/v1/activities/${activityId}`).expect(200);
    expectSuccessEnvelope(detail, 200);
    expect(detail.body.data.team).toHaveLength(2);

    const updated = await admin.patch(`/api/v1/activities/${activityId}`).set("Origin", allowedOrigin)
      .send({ version: 1, description: "Diagnosticar fuente HTTP" }).expect(200);
    expectSuccessEnvelope(updated, 200);
    expect(updated.body.data.version).toBe(2);
    const teamUpdated = await admin.put(`/api/v1/activities/${activityId}/team`).set("Origin", allowedOrigin)
      .send({ version: 2, team }).expect(200);
    expectSuccessEnvelope(teamUpdated, 200);
    expect(teamUpdated.body.data.version).toBe(3);

    const started = await responsible.post(`/api/v1/activities/${activityId}/start`).set("Origin", allowedOrigin).send({ version: 3 }).expect(200);
    expectSuccessEnvelope(started, 200);
    expect(started.body.data).toMatchObject({ status: "IN_PROGRESS", version: 4, startedAt: expect.any(String), endedAt: null });
    const paused = await responsible.post(`/api/v1/activities/${activityId}/pause`).set("Origin", allowedOrigin).send({ version: started.body.data.version, reason: "Pausa HTTP" }).expect(200);
    expectSuccessEnvelope(paused, 200);
    expect(paused.body.data).toMatchObject({ status: "PAUSED", version: 5, startedAt: started.body.data.startedAt, endedAt: null });
    expect(paused.body.data.pauses).toMatchObject([{ startedAt: expect.any(String), endedAt: null, reason: "Pausa HTTP" }]);
    const resumed = await responsible.post(`/api/v1/activities/${activityId}/resume`).set("Origin", allowedOrigin).send({ version: paused.body.data.version }).expect(200);
    expectSuccessEnvelope(resumed, 200);
    expect(resumed.body.data).toMatchObject({ status: "IN_PROGRESS", version: 6, startedAt: started.body.data.startedAt, endedAt: null });
    expect(resumed.body.data.pauses).toMatchObject([{ startedAt: paused.body.data.pauses[0].startedAt, endedAt: expect.any(String), reason: "Pausa HTTP" }]);
    const completed = await responsible.post(`/api/v1/activities/${activityId}/complete`).set("Origin", allowedOrigin)
      .send({ version: resumed.body.data.version, result: "Fuente sustituida HTTP" }).expect(200);
    expectSuccessEnvelope(completed, 200);
    expect(completed.body.data).toMatchObject({ status: "COMPLETED", version: 7, result: "Fuente sustituida HTTP" });
    expect(completed.body.data.pauses).toHaveLength(1);
    expect(typeof completed.body.data.productiveMinutes).toBe("number");

    const manual = await admin.post("/api/v1/activities/manual").set("Origin", allowedOrigin).send({
      ...pendingInput("Carga manual HTTP"), result: "Visita registrada HTTP", justification: "Registro anterior validado",
      startedAt: "2026-08-01T08:00:00.000Z", endedAt: "2026-08-01T10:00:00.000Z",
      team: [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }).expect(201);
    createdActivityIds.push(manual.body.data.id);
    expectSuccessEnvelope(manual, 201);
    expect(manual.headers.location).toBe(`/api/v1/activities/${manual.body.data.id}`);
    expect(manual.body.data).toMatchObject({ status: "COMPLETED", productiveMinutes: 120, version: 1 });
    const adjusted = await admin.post(`/api/v1/activities/${manual.body.data.id}/adjustments`).set("Origin", allowedOrigin)
      .send({ version: 1, reason: "CorrecciÃ³n HTTP", description: "Carga manual corregida HTTP" }).expect(200);
    expectSuccessEnvelope(adjusted, 200);
    expect(adjusted.body.data).toMatchObject({ version: 2, description: "Carga manual corregida HTTP" });

    const cancellable = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Actividad cancelable HTTP", [{ technicianId: technicianIds.responsible, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(201);
    createdActivityIds.push(cancellable.body.data.id);
    expectSuccessEnvelope(cancellable, 201);
    const cancelled = await admin.post(`/api/v1/activities/${cancellable.body.data.id}/cancel`).set("Origin", allowedOrigin)
      .send({ version: 1, reason: "Solicitud retirada HTTP" }).expect(200);
    expectSuccessEnvelope(cancelled, 200);
    expect(cancelled.body.data).toMatchObject({ status: "CANCELLED", version: 2 });
    const audits = await database.auditoria.findMany({
      where: { entity: "Actividad", entityId: { in: [activityId, manual.body.data.id, cancellable.body.data.id] } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      "ACTIVITY_ADJUSTED",
      "ACTIVITY_CANCELLED",
      "ACTIVITY_COMPLETED",
      "ACTIVITY_CREATED",
      "ACTIVITY_CREATED",
      "ACTIVITY_MANUAL_RECORDED",
      "ACTIVITY_PAUSED",
      "ACTIVITY_RESUMED",
      "ACTIVITY_STARTED",
      "ACTIVITY_TEAM_UPDATED",
      "ACTIVITY_UPDATED",
    ]);
  });

  it("allows a technician to create own pending and manual activities through HTTP", async () => {
    const responsible = await authenticatedAgent(users.responsible);
    const pending = await responsible.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Pendiente propia HTTP")).expect(201);
    createdActivityIds.push(pending.body.data.id);
    expectSuccessEnvelope(pending, 201);
    expect(pending.headers.location).toBe(`/api/v1/activities/${pending.body.data.id}`);
    expect(pending.body.data.team).toMatchObject([{ technician: { id: technicianIds.responsible }, role: "RESPONSIBLE", participationPercentage: "100.00" }]);

    const manual = await responsible.post("/api/v1/activities/manual").set("Origin", allowedOrigin).send({
      ...pendingInput("Manual propia HTTP"),
      result: "Registro propio HTTP",
      justification: "Carga propia justificada",
      startedAt: "2026-08-03T08:00:00.000Z",
      endedAt: "2026-08-03T09:00:00.000Z",
    }).expect(201);
    createdActivityIds.push(manual.body.data.id);
    expectSuccessEnvelope(manual, 201);
    expect(manual.headers.location).toBe(`/api/v1/activities/${manual.body.data.id}`);
    expect(manual.body.data).toMatchObject({ status: "COMPLETED", productiveMinutes: 60 });
    expect(manual.body.data.team).toMatchObject([{ technician: { id: technicianIds.responsible }, role: "RESPONSIBLE", participationPercentage: "100.00" }]);
  });

  it("denies every activity route security stack to an authenticated user without activity permissions", async () => {
    const admin = await authenticatedAgent(users.admin);
    const target = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Objetivo sin permisos HTTP", [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(201);
    createdActivityIds.push(target.body.data.id);
    const before = await aggregateSnapshot(target.body.data.id);
    const noPermissions = await authenticatedAgent(users.noActivityPermissions);
    const requests = [
      () => noPermissions.get("/api/v1/activities"),
      () => noPermissions.post("/api/v1/activities").set("Origin", allowedOrigin).send(pendingInput("CreaciÃ³n denegada HTTP")),
      () => noPermissions.put(`/api/v1/activities/${target.body.data.id}/team`).set("Origin", allowedOrigin).send({ version: 1, team: [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }] }),
      () => noPermissions.post(`/api/v1/activities/${target.body.data.id}/start`).set("Origin", allowedOrigin).send({ version: 1 }),
    ];
    for (const send of requests) {
      const response = await send().expect(403);
      expect(response.body).toMatchObject({ success: false, data: null, errors: [{ code: "FORBIDDEN" }], meta: { requestId: expect.any(String) } });
    }
    expect(await aggregateSnapshot(target.body.data.id)).toEqual(before);
  });

  it("rejects adversarial requests without leaking or mutating activities", async () => {
    const app = createApp({ env, logger: silentLogger, database });
    const unauthenticated = await request(app).get("/api/v1/activities").expect(401);
    expect(unauthenticated.body.errors[0].code).toBe("AUTHENTICATION_REQUIRED");
    await request(app).post("/api/v1/activities").set("Origin", allowedOrigin).send({}).expect(401);

    const provisional = await authenticatedAgent(users.provisional);
    const passwordRequired = await provisional.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Provisional HTTP", [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(403);
    expect(passwordRequired.body.errors[0].code).toBe("PASSWORD_CHANGE_REQUIRED");

    const admin = await authenticatedAgent(users.admin);
    const missingOrigin = await admin.post("/api/v1/activities").send({}).expect(403);
    expect(missingOrigin.body.errors[0].code).toBe("ORIGIN_REQUIRED");
    const invalidBefore = await database.actividad.count();
    const invalid = await admin.post("/api/v1/activities").set("Origin", allowedOrigin).send({
      ...pendingInput("Clave desconocida HTTP", [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }]),
      unexpected: true,
    }).expect(400);
    expect(invalid.body.errors[0].code).toBe("VALIDATION_ERROR");
    expect(await database.actividad.count()).toBe(invalidBefore);

    const participantActivity = await admin.post("/api/v1/activities").set("Origin", allowedOrigin).send(
      pendingInput("Participante no opera HTTP", [
        { technicianId: technicianIds.responsible, role: "RESPONSIBLE", participationPercentage: "50.00" },
        { technicianId: technicianIds.participant, role: "PARTICIPANT", participationPercentage: "50.00" },
      ]),
    ).expect(201);
    createdActivityIds.push(participantActivity.body.data.id);
    const participant = await authenticatedAgent(users.participant);
    const participantBefore = await aggregateSnapshot(participantActivity.body.data.id);
    const participantOperation = await participant.post(`/api/v1/activities/${participantActivity.body.data.id}/start`).set("Origin", allowedOrigin)
      .send({ version: 1 }).expect(403);
    expect(participantOperation.body.errors[0].code).toBe("FORBIDDEN");
    expect(await aggregateSnapshot(participantActivity.body.data.id)).toEqual(participantBefore);

    const foreignActivity = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Actividad ajena HTTP", [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(201);
    createdActivityIds.push(foreignActivity.body.data.id);
    const responsible = await authenticatedAgent(users.responsible);
    const foreignBefore = await aggregateSnapshot(foreignActivity.body.data.id);
    const foreign = await responsible.post(`/api/v1/activities/${foreignActivity.body.data.id}/start`).set("Origin", allowedOrigin).send({ version: 1 }).expect(404);
    const absent = await responsible.post(`/api/v1/activities/${randomUUID()}/start`).set("Origin", allowedOrigin).send({ version: 1 }).expect(404);
    expect(foreign.body).toMatchObject({ success: false, message: "La actividad solicitada no existe", data: null, errors: [{ code: "ACTIVITY_NOT_FOUND" }] });
    expect(absent.body).toMatchObject({ success: false, message: foreign.body.message, data: null, errors: foreign.body.errors });
    expect(await aggregateSnapshot(foreignActivity.body.data.id)).toEqual(foreignBefore);

    const ownActivity = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Control de versiÃ³n HTTP", [{ technicianId: technicianIds.responsible, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(201);
    createdActivityIds.push(ownActivity.body.data.id);
    const started = await responsible.post(`/api/v1/activities/${ownActivity.body.data.id}/start`).set("Origin", allowedOrigin).send({ version: 1 }).expect(200);
    const staleBefore = await aggregateSnapshot(ownActivity.body.data.id);
    const stale = await responsible.post(`/api/v1/activities/${ownActivity.body.data.id}/pause`).set("Origin", allowedOrigin).send({ version: 1, reason: "VersiÃ³n vencida HTTP" }).expect(409);
    expect(stale.body.errors[0].code).toBe("VERSION_CONFLICT");
    expect(await aggregateSnapshot(ownActivity.body.data.id)).toEqual(staleBefore);
    const invalidStateBefore = await aggregateSnapshot(ownActivity.body.data.id);
    const invalidState = await responsible.post(`/api/v1/activities/${ownActivity.body.data.id}/start`).set("Origin", allowedOrigin).send({ version: started.body.data.version }).expect(409);
    expect(invalidState.body.errors[0].code).toBe("INVALID_ACTIVITY_STATE");
    expect(await aggregateSnapshot(ownActivity.body.data.id)).toEqual(invalidStateBefore);

    const overlapAnchor = await admin.post("/api/v1/activities/manual").set("Origin", allowedOrigin).send({
      ...pendingInput("Ancla de solapamiento HTTP"), result: "Ancla registrada", justification: "Aislamiento de solapamiento",
      startedAt: "2026-08-02T08:00:00.000Z", endedAt: "2026-08-02T10:00:00.000Z",
      team: [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }).expect(201);
    createdActivityIds.push(overlapAnchor.body.data.id);
    const overlapBefore = await aggregateSnapshot(overlapAnchor.body.data.id);
    const overlap = await admin.post("/api/v1/activities/manual").set("Origin", allowedOrigin).send({
      ...pendingInput("Solapamiento HTTP"), result: "No debe registrarse", justification: "Prueba de solapamiento",
      startedAt: "2026-08-02T08:00:00.000Z", endedAt: "2026-08-02T10:00:00.000Z",
      team: [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    });
    if (overlap.status === 201 && typeof overlap.body.data?.id === "string") {
      createdActivityIds.push(overlap.body.data.id);
    }
    expect(overlap.status).toBe(409);
    expect(overlap.body.errors[0].code).toBe("TIME_OVERLAP");
    expect(await aggregateSnapshot(overlapAnchor.body.data.id)).toEqual(overlapBefore);
  });
});
