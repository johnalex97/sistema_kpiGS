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
} as const;
const technicianIds = {
  responsible: randomUUID(),
  participant: randomUUID(),
  foreign: randomUUID(),
} as const;
const createdActivityIds: string[] = [];
let branchId = "";
let activityTypeId = "";
let manualActivityId = "";

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
    expect(created.headers.location).toBe(`/api/v1/activities/${activityId}`);
    expect(created.body.data).toMatchObject({ status: "PENDING", version: 1, description: "Diagnosticar equipo HTTP" });

    const listed = await responsible.get("/api/v1/activities").expect(200);
    expect(listed.body.data.items.map((item: { id: string }) => item.id)).toContain(activityId);
    const detail = await responsible.get(`/api/v1/activities/${activityId}`).expect(200);
    expect(detail.body.data.team).toHaveLength(2);

    const updated = await admin.patch(`/api/v1/activities/${activityId}`).set("Origin", allowedOrigin)
      .send({ version: 1, description: "Diagnosticar fuente HTTP" }).expect(200);
    expect(updated.body.data.version).toBe(2);
    const teamUpdated = await admin.put(`/api/v1/activities/${activityId}/team`).set("Origin", allowedOrigin)
      .send({ version: 2, team }).expect(200);
    expect(teamUpdated.body.data.version).toBe(3);

    const started = await responsible.post(`/api/v1/activities/${activityId}/start`).set("Origin", allowedOrigin).send({ version: 3 }).expect(200);
    const paused = await responsible.post(`/api/v1/activities/${activityId}/pause`).set("Origin", allowedOrigin).send({ version: started.body.data.version, reason: "Pausa HTTP" }).expect(200);
    const resumed = await responsible.post(`/api/v1/activities/${activityId}/resume`).set("Origin", allowedOrigin).send({ version: paused.body.data.version }).expect(200);
    const completed = await responsible.post(`/api/v1/activities/${activityId}/complete`).set("Origin", allowedOrigin)
      .send({ version: resumed.body.data.version, result: "Fuente sustituida HTTP" }).expect(200);
    expect(completed.body.data).toMatchObject({ status: "COMPLETED", version: 7, result: "Fuente sustituida HTTP" });
    expect(completed.body.data.pauses).toHaveLength(1);
    expect(typeof completed.body.data.productiveMinutes).toBe("number");

    const manual = await admin.post("/api/v1/activities/manual").set("Origin", allowedOrigin).send({
      ...pendingInput("Carga manual HTTP"), result: "Visita registrada HTTP", justification: "Registro anterior validado",
      startedAt: "2026-08-01T08:00:00.000Z", endedAt: "2026-08-01T10:00:00.000Z",
      team: [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }).expect(201);
    createdActivityIds.push(manual.body.data.id);
    manualActivityId = manual.body.data.id;
    expect(manual.body.data).toMatchObject({ status: "COMPLETED", productiveMinutes: 120, version: 1 });
    const adjusted = await admin.post(`/api/v1/activities/${manual.body.data.id}/adjustments`).set("Origin", allowedOrigin)
      .send({ version: 1, reason: "CorrecciÃ³n HTTP", description: "Carga manual corregida HTTP" }).expect(200);
    expect(adjusted.body.data).toMatchObject({ version: 2, description: "Carga manual corregida HTTP" });

    const cancellable = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Actividad cancelable HTTP", [{ technicianId: technicianIds.responsible, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(201);
    createdActivityIds.push(cancellable.body.data.id);
    const cancelled = await admin.post(`/api/v1/activities/${cancellable.body.data.id}/cancel`).set("Origin", allowedOrigin)
      .send({ version: 1, reason: "Solicitud retirada HTTP" }).expect(200);
    expect(cancelled.body.data).toMatchObject({ status: "CANCELLED", version: 2 });
    expect(await database.auditoria.count({ where: { entity: "Actividad", entityId: { in: createdActivityIds } } })).toBeGreaterThanOrEqual(10);
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
    const participantOperation = await participant.post(`/api/v1/activities/${participantActivity.body.data.id}/start`).set("Origin", allowedOrigin)
      .send({ version: 1 }).expect(403);
    expect(participantOperation.body.errors[0].code).toBe("FORBIDDEN");
    expect((await database.actividad.findUniqueOrThrow({ where: { id: participantActivity.body.data.id } })).version).toBe(1);

    const foreignActivity = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Actividad ajena HTTP", [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(201);
    createdActivityIds.push(foreignActivity.body.data.id);
    const responsible = await authenticatedAgent(users.responsible);
    const foreign = await responsible.post(`/api/v1/activities/${foreignActivity.body.data.id}/start`).set("Origin", allowedOrigin).send({ version: 1 }).expect(404);
    const absent = await responsible.post(`/api/v1/activities/${randomUUID()}/start`).set("Origin", allowedOrigin).send({ version: 1 }).expect(404);
    expect(foreign.body).toMatchObject({ success: false, message: "La actividad solicitada no existe", data: null, errors: [{ code: "ACTIVITY_NOT_FOUND" }] });
    expect(absent.body).toMatchObject({ success: false, message: foreign.body.message, data: null, errors: foreign.body.errors });
    expect((await database.actividad.findUniqueOrThrow({ where: { id: foreignActivity.body.data.id } })).version).toBe(1);

    const ownActivity = await admin.post("/api/v1/activities").set("Origin", allowedOrigin)
      .send(pendingInput("Control de versiÃ³n HTTP", [{ technicianId: technicianIds.responsible, role: "RESPONSIBLE", participationPercentage: "100.00" }])).expect(201);
    createdActivityIds.push(ownActivity.body.data.id);
    const started = await responsible.post(`/api/v1/activities/${ownActivity.body.data.id}/start`).set("Origin", allowedOrigin).send({ version: 1 }).expect(200);
    const stale = await responsible.post(`/api/v1/activities/${ownActivity.body.data.id}/pause`).set("Origin", allowedOrigin).send({ version: 1, reason: "VersiÃ³n vencida HTTP" }).expect(409);
    expect(stale.body.errors[0].code).toBe("VERSION_CONFLICT");
    const invalidState = await responsible.post(`/api/v1/activities/${ownActivity.body.data.id}/start`).set("Origin", allowedOrigin).send({ version: started.body.data.version }).expect(409);
    expect(invalidState.body.errors[0].code).toBe("INVALID_ACTIVITY_STATE");
    expect((await database.actividad.findUniqueOrThrow({ where: { id: ownActivity.body.data.id } })).version).toBe(started.body.data.version);

    const overlapBefore = await database.actividad.count();
    const overlap = await admin.post("/api/v1/activities/manual").set("Origin", allowedOrigin).send({
      ...pendingInput("Solapamiento HTTP"), result: "No debe registrarse", justification: "Prueba de solapamiento",
      startedAt: "2026-08-01T08:00:00.000Z", endedAt: "2026-08-01T10:00:00.000Z",
      team: [{ technicianId: technicianIds.foreign, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    }).expect(409);
    expect(overlap.body.errors[0].code).toBe("TIME_OVERLAP");
    expect(await database.actividad.count()).toBe(overlapBefore);
    expect(manualActivityId).not.toBe("");
  });
});
