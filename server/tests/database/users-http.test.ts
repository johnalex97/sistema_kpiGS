import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCatalogs } from "../../prisma/seed/catalogs.js";
import { createApp } from "../../src/app.js";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";
import { parseEnvironment } from "../../src/config/env.js";
import { silentLogger } from "../../src/utils/logger.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const origin = "http://localhost:5173";
const password = "UsuariosTemporal-2026!";
const env = parseEnvironment({ NODE_ENV: "test", CORS_ORIGIN: origin, LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test" });
const app = createApp({ env, logger: silentLogger, database });
const adminEmail = `users-admin-${randomUUID()}@example.test`;
const technicianEmail = `users-tech-${randomUUID()}@example.test`;
const ids: string[] = [];
const technicianIds: string[] = [];

beforeAll(async () => {
  const catalogs = await database.$transaction(tx => seedCatalogs(tx, { production: true }));
  for (const [email, code] of [[adminEmail, "ADMIN"], [technicianEmail, "TECHNICIAN"]] as const) {
    const roleId = catalogs.roles[code];
    if (!roleId) throw new Error("Falta rol de prueba");
    const user = await database.usuario.create({ data: {
      email, displayName: "Usuario HTTP de prueba", status: "ACTIVE", mustChangePassword: false,
      passwordHash: await hashPassword(password), roles: { create: { rolId: roleId } },
    } });
    ids.push(user.id);
  }
});

afterAll(async () => {
  await database.auditoria.deleteMany({ where: { OR: [{ userId: { in: ids } }, { entity: "usuario", entityId: { in: ids } }] } });
  await database.sesion.deleteMany({ where: { userId: { in: ids } } });
  await database.tecnico.deleteMany({ where: { id: { in: technicianIds } } });
  await database.usuario.deleteMany({ where: { id: { in: ids } } });
  await disconnectTestDatabase();
});

async function login(email = adminEmail) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").set("Origin", origin).send({ email, password }).expect(200);
  return agent;
}

describe("administración de usuarios", () => {
  it("permite cambiar un rol, conserva la contraseña y revoca las sesiones del usuario", async () => {
    const agent = await login();
    const email = `role-change-${randomUUID()}@example.test`;
    const created = await agent.post("/api/v1/users").set("Origin", origin).send({ displayName: "Cambio de rol", email, temporaryPassword: password }).expect(201);
    const id = created.body.data.id;
    ids.push(id);
    const profile = await database.tecnico.create({ data: { code: `ROLE-${randomUUID().slice(0, 12)}`, userId: id, fullName: "Perfil promovido" } });
    technicianIds.push(profile.id);
    const targetAgent = await login(email);
    const before = await database.usuario.findUniqueOrThrow({ where: { id } });
    const response = await agent.patch(`/api/v1/users/${id}/role`).set("Origin", origin).send({ role: "SUPERVISOR", version: before.version }).expect(200);
    expect(response.body.data.roles).toEqual(["SUPERVISOR"]);
    expect(response.body.data.version).toBe(before.version + 1);
    const edited = await agent.patch(`/api/v1/technicians/${profile.id}`).set("Origin", origin).send({ version: profile.version, userId: id, specialty: "Coordinación técnica" }).expect(200);
    expect(edited.body.data.user.id).toBe(id);
    await agent.post("/api/v1/technicians").set("Origin", origin).send({ fullName: "Nuevo perfil indebido", userId: id }).expect(409);
    expect((await database.usuario.findUniqueOrThrow({ where: { id } })).passwordHash).toBe(before.passwordHash);
    await targetAgent.get("/api/v1/auth/me").expect(401);
    const audit = await database.auditoria.findFirstOrThrow({ where: { entityId: id, action: "USER_ROLE_CHANGED" } });
    expect(audit.beforeData).toMatchObject({ roles: ["TECHNICIAN"] });
    expect(audit.afterData).toMatchObject({ roles: ["SUPERVISOR"] });
    expect(JSON.stringify(audit)).not.toContain(before.passwordHash!);
    const stale = await agent.patch(`/api/v1/users/${id}/role`).set("Origin", origin).send({ role: "ADMIN", version: before.version }).expect(409);
    expect(stale.body.errors[0].code).toBe("USER_VERSION_CONFLICT");
  });

  it("impide a técnicos cambiar roles y valida el rol y el origen", async () => {
    const technician = await login(technicianEmail);
    const admin = await database.usuario.findUniqueOrThrow({ where: { email: adminEmail } });
    await technician.patch(`/api/v1/users/${admin.id}/role`).set("Origin", origin).send({ role: "ADMIN", version: admin.version }).expect(403);
    const agent = await login();
    await agent.patch(`/api/v1/users/${admin.id}/role`).send({ role: "TECHNICIAN", version: admin.version }).expect(403);
    await agent.patch(`/api/v1/users/${admin.id}/role`).set("Origin", origin).send({ role: "ROOT", version: admin.version }).expect(400);
    await agent.patch(`/api/v1/users/${randomUUID()}/role`).set("Origin", origin).send({ role: "TECHNICIAN", version: 1 }).expect(404);
  });

  it("no permite que un administrador cambie su propio rol", async () => {
    const agent = await login();
    const admin = await database.usuario.findUniqueOrThrow({ where: { email: adminEmail } });
    const result = await agent.patch(`/api/v1/users/${admin.id}/role`).set("Origin", origin).send({ role: "TECHNICIAN", version: admin.version }).expect(409);
    expect(["SELF_ROLE_CHANGE_FORBIDDEN", "LAST_ACTIVE_ADMIN"]).toContain(result.body.errors[0].code);
    expect((await agent.get("/api/v1/auth/me").expect(200)).body.data.user.roles).toContain("ADMIN");
  });
  it("exige sesión y permiso de administración", async () => {
    await request(app).get("/api/v1/users").expect(401);
    const agent = await login(technicianEmail);
    await agent.get("/api/v1/users").expect(403);
    await agent.post("/api/v1/users").set("Origin", origin).send({}).expect(403);
  });

  it("exige origen permitido y cambio de contraseña del administrador", async () => {
    const agent = await login();
    await agent.post("/api/v1/users").send({}).expect(403);
    await database.usuario.update({ where: { email: adminEmail }, data: { mustChangePassword: true } });
    try {
      await agent.get("/api/v1/users").expect(403);
      await agent.post("/api/v1/users").set("Origin", origin).send({}).expect(403);
    } finally {
      await database.usuario.update({ where: { email: adminEmail }, data: { mustChangePassword: false } });
    }
  });

  it("crea una cuenta técnica utilizable, elegible y auditada sin revelar secretos", async () => {
    const agent = await login();
    const email = `new-tech-${randomUUID()}@example.test`;
    const response = await agent.post("/api/v1/users").set("Origin", origin).send({
      displayName: "Nueva Técnica", email: ` ${email.toUpperCase()} `, temporaryPassword: password,
    }).expect(201);
    ids.push(response.body.data.id);
    expect(response.body.data).toMatchObject({ email, status: "ACTIVE", mustChangePassword: true, roles: ["TECHNICIAN"] });
    expect(JSON.stringify(response.body)).not.toContain(password);
    expect(response.body.data).not.toHaveProperty("passwordHash");
    const account = await database.usuario.findUniqueOrThrow({ where: { email } });
    expect(await verifyPassword(password, account.passwordHash!)).toBe(true);
    const eligible = await agent.get(`/api/v1/technicians/eligible-users?search=${encodeURIComponent(email)}`).expect(200);
    expect(eligible.body.data.items.map((item: { id: string }) => item.id)).toContain(account.id);
    const newAgent = await login(email);
    const me = await newAgent.get("/api/v1/auth/me").expect(200);
    expect(me.body.data.user.mustChangePassword).toBe(true);
    await newAgent.get("/api/v1/users").expect(403);
    const audit = await database.auditoria.findFirstOrThrow({ where: { action: "USER_CREATED", entityId: account.id } });
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain(account.passwordHash!);
  });

  it("rechaza correos duplicados sin reemplazar la cuenta", async () => {
    const agent = await login();
    const response = await agent.post("/api/v1/users").set("Origin", origin).send({
      displayName: "Reemplazo", email: adminEmail.toUpperCase(), temporaryPassword: password,
    }).expect(409);
    expect(response.body.errors[0].code).toBe("USER_EMAIL_EXISTS");
    expect((await database.usuario.findUniqueOrThrow({ where: { email: adminEmail } })).displayName).toBe("Usuario HTTP de prueba");
  });

  it("rechaza contraseñas débiles y asignación de privilegios desde el formulario", async () => {
    const agent = await login();
    const email = `invalid-${randomUUID()}@example.test`;
    for (const payload of [
      { displayName: "Inválido", email, temporaryPassword: "corta" },
      { displayName: "Inválido", email, temporaryPassword: password, role: "ADMIN" },
    ]) {
      await agent.post("/api/v1/users").set("Origin", origin).send(payload).expect(400);
    }
    expect(await database.usuario.findUnique({ where: { email } })).toBeNull();
  });

  it("consulta cuentas paginadas y filtradas sin hashes ni tokens", async () => {
    const agent = await login();
    const response = await agent.get(`/api/v1/users?search=${encodeURIComponent(adminEmail)}&pageSize=1`).expect(200);
    expect(response.body.data.pagination.totalItems).toBe(1);
    expect(response.body.data.items[0].email).toBe(adminEmail);
    expect(response.body.data.items[0]).not.toHaveProperty("passwordHash");
    expect(response.body.data.items[0]).not.toHaveProperty("sessions");
    await agent.get("/api/v1/users?pageSize=1000").expect(400);
  });
});
