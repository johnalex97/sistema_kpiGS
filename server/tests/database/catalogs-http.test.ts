import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCatalogs } from "../../prisma/seed/catalogs.js";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { parseEnvironment } from "../../src/config/env.js";
import { silentLogger } from "../../src/utils/logger.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const origin = "http://localhost:5173";
const password = "CatalogosTemporal-2026!";
const env = parseEnvironment({ NODE_ENV: "test", CORS_ORIGIN: origin, LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test" });
const app = createApp({ env, logger: silentLogger, database });
const adminEmail = `catalog-admin-${randomUUID()}@example.test`;
const supervisorEmail = `catalog-supervisor-${randomUUID()}@example.test`;
const userIds: string[] = [];
const created: { kind: string; id: string }[] = [];
const orderIds: string[] = [];
const branchIds: string[] = [];
const clientIds: string[] = [];
const activityIds: string[] = [];
const technicianIds: string[] = [];

beforeAll(async () => {
  const catalogs = await database.$transaction(tx => seedCatalogs(tx, { production: true }));
  for (const [email, code] of [[adminEmail, "ADMIN"], [supervisorEmail, "SUPERVISOR"]] as const) {
    const rolId = catalogs.roles[code];
    if (!rolId) throw new Error("Falta rol");
    const user = await database.usuario.create({ data: { email, displayName: "Administrador de catálogos", status: "ACTIVE", mustChangePassword: false,
      passwordHash: await hashPassword(password), roles: { create: { rolId } } } });
    userIds.push(user.id);
  }
});
afterAll(async () => {
  await database.auditoria.deleteMany({ where: { userId: { in: userIds } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  await database.tecnico.deleteMany({ where: { id: { in: technicianIds } } });
  await database.historialOrden.deleteMany({ where: { ordenId: { in: orderIds } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: orderIds } } });
  await database.sucursalCliente.deleteMany({ where: { id: { in: branchIds } } });
  await database.cliente.deleteMany({ where: { id: { in: clientIds } } });
  for (const item of created) {
    if (item.kind === "services") await database.tipoServicio.delete({ where: { id: item.id } });
    if (item.kind === "activities") await database.tipoActividad.delete({ where: { id: item.id } });
    if (item.kind === "recurrence-causes") await database.causaReincidencia.delete({ where: { id: item.id } });
  }
  await database.sesion.deleteMany({ where: { userId: { in: userIds } } });
  await database.usuario.deleteMany({ where: { id: { in: userIds } } });
  await disconnectTestDatabase();
});
async function login(email = adminEmail) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").set("Origin", origin).send({ email, password }).expect(200);
  return agent;
}

describe("catálogos administrables", () => {
  it("respeta el orden configurado en el selector de servicios", async () => {
    const agent = await login();
    const early = await agent.post("/api/v1/catalogs/services").set("Origin", origin).send({ code: `EARLY_${randomUUID().replaceAll("-", "")}`, name: "ZZZ primero", displayOrder: 0 }).expect(201);
    const late = await agent.post("/api/v1/catalogs/services").set("Origin", origin).send({ code: `LATE_${randomUUID().replaceAll("-", "")}`, name: "AAA último", displayOrder: 100000 }).expect(201);
    created.push({ kind: "services", id: early.body.data.id }, { kind: "services", id: late.body.data.id });
    const services = (await agent.get("/api/v1/orders/catalog").expect(200)).body.data.serviceTypes.map((item: { id: string }) => item.id);
    expect(services.indexOf(early.body.data.id)).toBeLessThan(services.indexOf(late.body.data.id));
  });

  it("conserva las órdenes existentes al desactivar su servicio", async () => {
    const agent = await login();
    const service = (await agent.post("/api/v1/catalogs/services").set("Origin", origin).send({ code: `HISTORY_${randomUUID().replaceAll("-", "")}`, name: "Servicio histórico" }).expect(201)).body.data;
    created.push({ kind: "services", id: service.id });
    const client = await database.cliente.create({ data: { code: `CAT-${randomUUID().slice(0, 15)}`, tradeName: "Cliente histórico" } });
    clientIds.push(client.id);
    const branch = await database.sucursalCliente.create({ data: { clienteId: client.id, code: "CENTRAL", name: "Central", address: "Dirección de prueba" } });
    branchIds.push(branch.id);
    const order = await database.ordenTrabajo.create({ data: { orderNumber: `CAT-${randomUUID().slice(0, 20)}`, sucursalId: branch.id, tipoServicioId: service.id, reportedProblem: "Trabajo existente" } });
    orderIds.push(order.id);
    await agent.patch(`/api/v1/catalogs/services/${service.id}`).set("Origin", origin).send({ isActive: false, updatedAt: service.updatedAt }).expect(200);
    expect((await database.ordenTrabajo.findUniqueOrThrow({ where: { id: order.id } })).tipoServicioId).toBe(service.id);
    expect((await database.tipoServicio.findUniqueOrThrow({ where: { id: service.id } })).deletedAt).toBeNull();
    await agent.get(`/api/v1/orders/${order.id}`).expect(200);
    const otherBranch = await database.sucursalCliente.create({ data: { clienteId: client.id, code: "OTRA", name: "Otra", address: "Otra dirección" } });
    branchIds.push(otherBranch.id);
    await agent.patch(`/api/v1/orders/${order.id}`).set("Origin", origin).send({ version: order.version, branchId: otherBranch.id, serviceTypeId: service.id }).expect(200);

    const type = (await agent.post("/api/v1/catalogs/activities").set("Origin", origin).send({ code: `KEEP_${randomUUID().replaceAll("-", "")}`, name: "Actividad histórica" }).expect(201)).body.data;
    created.push({ kind: "activities", id: type.id });
    const technician = await database.tecnico.create({ data: { code: `CT-${randomUUID().slice(0, 15)}`, fullName: "Técnico histórico" } });
    technicianIds.push(technician.id);
    const activity = await database.actividad.create({ data: { sucursalId: branch.id, tipoActividadId: type.id, description: "Actividad existente", tecnicos: { create: { tecnicoId: technician.id, role: "RESPONSIBLE", participationPercentage: 100 } } } });
    activityIds.push(activity.id);
    await agent.patch(`/api/v1/catalogs/activities/${type.id}`).set("Origin", origin).send({ isActive: false, updatedAt: type.updatedAt }).expect(200);
    const edited = await agent.patch(`/api/v1/activities/${activity.id}`).set("Origin", origin).send({ version: activity.version, activityTypeId: type.id, description: "Descripción editada" }).expect(200);
    await agent.put(`/api/v1/activities/${activity.id}/team`).set("Origin", origin).send({ version: edited.body.data.version, team: [{ technicianId: technician.id, role: "RESPONSIBLE", participationPercentage: "100.00" }] }).expect(200);
  });

  it("impide que dos administradores sobrescriban simultáneamente la misma versión", async () => {
    const agent = await login();
    const item = (await agent.post("/api/v1/catalogs/activities").set("Origin", origin).send({ code: `RACE_${randomUUID().replaceAll("-", "")}`, name: "Actividad concurrente" }).expect(201)).body.data;
    created.push({ kind: "activities", id: item.id });
    const results = await Promise.all(["Primero", "Segundo"].map(name => agent.patch(`/api/v1/catalogs/activities/${item.id}`).set("Origin", origin).send({ name, updatedAt: item.updatedAt })));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const winner = results.find(result => result.status === 200);
    expect((await database.tipoActividad.findUniqueOrThrow({ where: { id: item.id } })).name).toBe(winner?.body.data.name);
    const history = (await agent.get(`/api/v1/catalogs/activities/${item.id}/history`).expect(200)).body.data;
    expect(history.items.filter((entry: { action: string }) => entry.action === "CATALOG_UPDATED")).toHaveLength(1);
  });

  it.each(["services", "activities", "recurrence-causes"])("crea, edita y desactiva %s con auditoría y código fijo", async kind => {
    const agent = await login();
    const code = `TEST_${randomUUID().replaceAll("-", "").toUpperCase()}`;
    const initial = await agent.post(`/api/v1/catalogs/${kind}`).set("Origin", origin).send({ code, name: "Opción nueva", description: "Descripción", displayOrder: 7, isActive: true }).expect(201);
    const item = initial.body.data;
    created.push({ kind, id: item.id });
    expect(item).toMatchObject({ code, name: "Opción nueva", displayOrder: 7, isActive: true });
    const edited = await agent.patch(`/api/v1/catalogs/${kind}/${item.id}`).set("Origin", origin).send({ name: "Opción editada", description: null, displayOrder: 2, isActive: false, updatedAt: item.updatedAt }).expect(200);
    expect(edited.body.data).toMatchObject({ id: item.id, code, name: "Opción editada", isActive: false });
    const list = await agent.get(`/api/v1/catalogs/${kind}?search=${code}`).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].isActive).toBe(false);
    const stale = await agent.patch(`/api/v1/catalogs/${kind}/${item.id}`).set("Origin", origin).send({ name: "Cambio obsoleto", updatedAt: item.updatedAt }).expect(409);
    expect(stale.body.errors[0].code).toBe("CATALOG_VERSION_CONFLICT");
    await agent.patch(`/api/v1/catalogs/${kind}/${item.id}`).set("Origin", origin).send({ code: "CHANGED", updatedAt: edited.body.data.updatedAt }).expect(400);
    const history = await agent.get(`/api/v1/catalogs/${kind}/${item.id}/history`).expect(200);
    expect(history.body.data.items.map((entry: { action: string }) => entry.action)).toEqual(["CATALOG_UPDATED", "CATALOG_CREATED"]);
    expect(history.body.data.items[0].beforeData).toMatchObject({ isActive: true });
    expect(history.body.data.items[0].afterData).toMatchObject({ isActive: false });
    expect(history.body.data.items[0].actor.displayName).toBe("Administrador de catálogos");
    expect(JSON.stringify(history.body)).not.toContain("passwordHash");
    await agent.post(`/api/v1/catalogs/${kind}`).set("Origin", origin).send({ code, name: "Duplicada" }).expect(409);
    const active = kind === "services" ? (await agent.get("/api/v1/orders/catalog").expect(200)).body.data.serviceTypes
      : kind === "activities" ? (await agent.get("/api/v1/activity-types").expect(200)).body.data
      : (await agent.get("/api/v1/recurrences/catalog").expect(200)).body.data.causes;
    expect(active.map((entry: { id: string }) => entry.id)).not.toContain(item.id);
  });

  it("exige administrador, origen permitido y contraseña definitiva", async () => {
    await request(app).get("/api/v1/catalogs/services").expect(401);
    const supervisor = await login(supervisorEmail);
    await supervisor.get("/api/v1/catalogs/services").expect(403);
    await supervisor.post("/api/v1/catalogs/services").set("Origin", origin).send({ code: "NO", name: "Prohibida" }).expect(403);
    const agent = await login();
    await agent.post("/api/v1/catalogs/services").send({ code: "NO", name: "Sin origen" }).expect(403);
    await database.usuario.update({ where: { email: adminEmail }, data: { mustChangePassword: true } });
    try { await agent.get("/api/v1/catalogs/services").expect(403); }
    finally { await database.usuario.update({ where: { email: adminEmail }, data: { mustChangePassword: false } }); }
  });

  it("valida tipos, identificadores, nombres vacíos y límites", async () => {
    const agent = await login();
    await agent.get("/api/v1/catalogs/users").expect(400);
    await agent.get("/api/v1/catalogs/services?pageSize=1000").expect(400);
    await agent.post("/api/v1/catalogs/services").set("Origin", origin).send({ code: "BAD CODE", name: "   " }).expect(400);
    await agent.patch(`/api/v1/catalogs/services/${randomUUID()}`).set("Origin", origin).send({ name: "No existe", updatedAt: new Date().toISOString() }).expect(404);
    await agent.get("/api/v1/catalogs/services/not-uuid/history").expect(400);
  });
});
