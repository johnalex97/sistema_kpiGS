import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCatalogs } from "../../prisma/seed/catalogs.js";
import { createApp } from "../../src/app.js";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";
import { createAuthRepository } from "../../src/auth/auth.repository.js";
import { createAuthService } from "../../src/auth/auth.service.js";
import { parseEnvironment } from "../../src/config/env.js";
import { silentLogger } from "../../src/utils/logger.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const origin = "http://localhost:5173";
const password = "AccesosTemporal-2026!";
const replacement = "AccesosNueva-2026!";
const env = parseEnvironment({ NODE_ENV: "test", CORS_ORIGIN: origin, LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test" });
const app = createApp({ env, logger: silentLogger, database });
const ids: string[] = [];
const profiles: string[] = [];
let admin: { id: string; email: string };
let supervisor: { id: string; email: string };
let roles: Record<string, string>;

async function account(role = "TECHNICIAN") {
  const created = await database.usuario.create({ data: {
    email: `access-${randomUUID()}@example.test`, displayName: "Cuenta de accesos", status: "ACTIVE",
    passwordHash: await hashPassword(password), mustChangePassword: false,
    roles: { create: { rolId: roles[role]! } },
  } });
  ids.push(created.id);
  return created;
}
async function login(email = admin.email, loginPassword = password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").set("Origin", origin).send({ email, password: loginPassword }).expect(200);
  return agent;
}
beforeAll(async () => {
  roles = (await database.$transaction(tx => seedCatalogs(tx, { production: true }))).roles;
  admin = await account("ADMIN");
  supervisor = await account("SUPERVISOR");
});
afterAll(async () => {
  await database.auditoria.deleteMany({ where: { OR: [{ userId: { in: ids } }, { entity: "usuario", entityId: { in: ids } }] } });
  await database.sesion.deleteMany({ where: { userId: { in: ids } } });
  await database.tecnico.deleteMany({ where: { id: { in: profiles } } });
  await database.usuario.deleteMany({ where: { id: { in: ids } } });
  await disconnectTestDatabase();
});

describe("administración del acceso de usuarios", () => {
  it("un login fallido pendiente no repone un bloqueo eliminado por el administrador", async () => {
    const target = await account();
    await database.usuario.update({ where: { id: target.id }, data: { failedLoginAttempts: 4 } });
    const agent = await login();
    const real = createAuthRepository(database);
    const service = createAuthService({ repository: { ...real, async recordFailedLogin(...args) {
      await agent.post(`/api/v1/users/${target.id}/unlock`).set("Origin", origin).send({ version: 1 }).expect(200);
      return real.recordFailedLogin(...args);
    } }, now: () => new Date(), config: { sessionTtlMinutes: 480, sessionIdleMinutes: 30, maxFailedAttempts: 5, lockMinutes: 15 } });
    await expect(service.login({ email: target.email, password: "IncorrectaTemporal-2026!" }, { requestId: randomUUID(), ipAddress: null, userAgent: null })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const stored = await database.usuario.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null, version: 2 });
    expect(await database.auditoria.count({ where: { entityId: target.id, action: "AUTH_ACCOUNT_LOCKED" } })).toBe(0);
  });
  it("rechaza un login antiguo si el administrador restablece durante la verificación", async () => {
    const target = await account();
    const agent = await login();
    const real = createAuthRepository(database);
    const service = createAuthService({ repository: { ...real, async completeLogin(input) {
      await agent.post(`/api/v1/users/${target.id}/reset-password`).set("Origin", origin).send({ temporaryPassword: replacement, version: 1 }).expect(200);
      return real.completeLogin(input);
    } }, now: () => new Date(), config: { sessionTtlMinutes: 480, sessionIdleMinutes: 30, maxFailedAttempts: 5, lockMinutes: 15 } });
    await expect(service.login({ email: target.email, password }, { requestId: randomUUID(), ipAddress: null, userAgent: null })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(await database.sesion.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
    expect((await database.usuario.findUniqueOrThrow({ where: { id: target.id } })).mustChangePassword).toBe(true);
  });

  it("un cambio propio en curso no sobrescribe un restablecimiento del administrador", async () => {
    const target = await account();
    const agent = await login();
    const real = createAuthRepository(database);
    const service = createAuthService({ repository: { ...real, async changePasswordAndRotateSession(input) {
      await agent.post(`/api/v1/users/${target.id}/reset-password`).set("Origin", origin).send({ temporaryPassword: replacement, version: 1 }).expect(200);
      return real.changePasswordAndRotateSession(input);
    } }, now: () => new Date(), config: { sessionTtlMinutes: 480, sessionIdleMinutes: 30, maxFailedAttempts: 5, lockMinutes: 15 } });
    const signedIn = await service.login({ email: target.email, password }, { requestId: randomUUID(), ipAddress: null, userAgent: null });
    const principal = await service.authenticate(signedIn.rawToken);
    await expect(service.changePassword(principal!, { currentPassword: password, newPassword: "CambioPropio-2026!" }, { requestId: randomUUID(), ipAddress: null, userAgent: null })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const stored = await database.usuario.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.mustChangePassword).toBe(true);
    expect(await verifyPassword(replacement, stored.passwordHash!)).toBe(true);
    expect(await database.sesion.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
  });
  it("desactiva sin perder perfil ni contraseña, revoca sesiones y permite reactivar", async () => {
    const target = await account();
    const profile = await database.tecnico.create({ data: { code: `ACC-${randomUUID().slice(0, 12)}`, fullName: "Perfil conservado", userId: target.id } });
    profiles.push(profile.id);
    const targetAgent = await login(target.email);
    const agent = await login();
    const response = await agent.patch(`/api/v1/users/${target.id}/status`).set("Origin", origin).send({ status: "INACTIVE", version: target.version }).expect(200);
    expect(response.body.data).toMatchObject({ status: "INACTIVE", version: 2, tecnico: { id: profile.id } });
    await targetAgent.get("/api/v1/auth/me").expect(401);
    await request(app).post("/api/v1/auth/login").set("Origin", origin).send({ email: target.email, password }).expect(401);
    expect((await database.usuario.findUniqueOrThrow({ where: { id: target.id } })).passwordHash).toBe(target.passwordHash);
    await agent.patch(`/api/v1/users/${target.id}/status`).set("Origin", origin).send({ status: "ACTIVE", version: 2 }).expect(200);
    await targetAgent.get("/api/v1/auth/me").expect(401);
    await login(target.email);
    const audit = await database.auditoria.findFirstOrThrow({ where: { action: "USER_STATUS_CHANGED", entityId: target.id } });
    expect(audit.userId).toBe(admin.id);
    expect(audit.beforeData).toMatchObject({ status: "ACTIVE" });
    expect(audit.afterData).toMatchObject({ status: "INACTIVE" });
  });

  it("desbloquea los intentos sin cambiar contraseña ni activar una cuenta inactiva", async () => {
    const target = await account();
    await database.usuario.update({ where: { id: target.id }, data: { status: "INACTIVE", failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) } });
    const agent = await login();
    const response = await agent.post(`/api/v1/users/${target.id}/unlock`).set("Origin", origin).send({ version: 1 }).expect(200);
    expect(response.body.data).toMatchObject({ status: "INACTIVE", failedLoginAttempts: 0, lockedUntil: null, version: 2 });
    const stored = await database.usuario.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.passwordHash).toBe(target.passwordHash);
    await request(app).post("/api/v1/auth/login").set("Origin", origin).send({ email: target.email, password }).expect(401);
    expect(await database.auditoria.count({ where: { action: "USER_UNLOCKED", entityId: target.id } })).toBe(1);
  });

  it("restablece con cambio obligatorio, cierra sesiones y nunca expone secretos", async () => {
    const target = await account();
    const targetAgent = await login(target.email);
    const agent = await login();
    const response = await agent.post(`/api/v1/users/${target.id}/reset-password`).set("Origin", origin).send({ temporaryPassword: replacement, version: 1 }).expect(200);
    expect(response.body.data).toMatchObject({ mustChangePassword: true, status: "ACTIVE", version: 2 });
    const stored = await database.usuario.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword(replacement, stored.passwordHash!)).toBe(true);
    expect(await verifyPassword(password, stored.passwordHash!)).toBe(false);
    await targetAgent.get("/api/v1/auth/me").expect(401);
    const newAgent = await login(target.email, replacement);
    expect((await newAgent.get("/api/v1/auth/me").expect(200)).body.data.user.mustChangePassword).toBe(true);
    await newAgent.get("/api/v1/orders").expect(403);
    const audit = await database.auditoria.findFirstOrThrow({ where: { action: "USER_PASSWORD_RESET", entityId: target.id } });
    for (const secret of [password, replacement, stored.passwordHash!, target.passwordHash!]) {
      expect(JSON.stringify(response.body)).not.toContain(secret);
      expect(JSON.stringify(audit)).not.toContain(secret);
    }
  });

  it("restablecer no activa ni desbloquea silenciosamente una cuenta", async () => {
    const target = await account();
    const lock = new Date(Date.now() + 60_000);
    await database.usuario.update({ where: { id: target.id }, data: { status: "INACTIVE", failedLoginAttempts: 5, lockedUntil: lock } });
    const agent = await login();
    const response = await agent.post(`/api/v1/users/${target.id}/reset-password`).set("Origin", origin).send({ temporaryPassword: replacement, version: 1 }).expect(200);
    expect(response.body.data).toMatchObject({ status: "INACTIVE", failedLoginAttempts: 5, lockedUntil: lock.toISOString() });
  });

  it("rechaza versiones antiguas y dos acciones concurrentes solo modifican una vez", async () => {
    const target = await account();
    const agent = await login();
    const results = await Promise.all([
      agent.patch(`/api/v1/users/${target.id}/status`).set("Origin", origin).send({ status: "INACTIVE", version: 1 }),
      agent.post(`/api/v1/users/${target.id}/unlock`).set("Origin", origin).send({ version: 1 }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await database.usuario.findUniqueOrThrow({ where: { id: target.id } })).version).toBe(2);
    const stale = await agent.post(`/api/v1/users/${target.id}/reset-password`).set("Origin", origin).send({ temporaryPassword: replacement, version: 1 }).expect(409);
    expect(stale.body.errors[0].code).toBe("USER_VERSION_CONFLICT");
    expect((await database.usuario.findUniqueOrThrow({ where: { id: target.id } })).passwordHash).toBe(target.passwordHash);
  });

  it("exige administrador, sesión, cambio de contraseña y origen permitido en cada acción", async () => {
    const target = await account();
    const agent = await login();
    const restricted = await login(supervisor.email);
    for (const [path, method, body] of [
      ["status", "patch", { status: "INACTIVE", version: 1 }],
      ["unlock", "post", { version: 1 }],
      ["reset-password", "post", { temporaryPassword: replacement, version: 1 }],
    ] as const) {
      await request(app)[method](`/api/v1/users/${target.id}/${path}`).set("Origin", origin).send(body).expect(401);
      await restricted[method](`/api/v1/users/${target.id}/${path}`).set("Origin", origin).send(body).expect(403);
      await agent[method](`/api/v1/users/${target.id}/${path}`).send(body).expect(403);
      await agent[method](`/api/v1/users/${admin.id}/${path}`).set("Origin", origin).send(body).expect(409);
    }
    await database.usuario.update({ where: { id: admin.id }, data: { mustChangePassword: true } });
    try {
      await agent.post(`/api/v1/users/${target.id}/unlock`).set("Origin", origin).send({ version: 1 }).expect(403);
    } finally {
      await database.usuario.update({ where: { id: admin.id }, data: { mustChangePassword: false } });
    }
  });

  it("valida entradas estrictas, cuentas ausentes y cuentas eliminadas", async () => {
    const agent = await login();
    const target = await account();
    for (const body of [{ temporaryPassword: "corta", version: 1 }, { temporaryPassword: replacement, version: 0 }, { temporaryPassword: replacement, version: 1, status: "ACTIVE" }]) {
      await agent.post(`/api/v1/users/${target.id}/reset-password`).set("Origin", origin).send(body).expect(400);
    }
    await agent.patch(`/api/v1/users/${target.id}/status`).set("Origin", origin).send({ status: "PENDING", version: 1 }).expect(400);
    await agent.post("/api/v1/users/not-uuid/unlock").set("Origin", origin).send({ version: 1 }).expect(400);
    await agent.post(`/api/v1/users/${randomUUID()}/unlock`).set("Origin", origin).send({ version: 1 }).expect(404);
    await database.usuario.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    await agent.post(`/api/v1/users/${target.id}/unlock`).set("Origin", origin).send({ version: 1 }).expect(404);
  });

  it("muestra información de bloqueo sin hashes ni tokens en el listado", async () => {
    const target = await account();
    const lock = new Date(Date.now() + 60_000);
    await database.usuario.update({ where: { id: target.id }, data: { failedLoginAttempts: 5, lockedUntil: lock } });
    const agent = await login();
    const response = await agent.get(`/api/v1/users?search=${encodeURIComponent(target.email)}`).expect(200);
    expect(response.body.data.items[0]).toMatchObject({ failedLoginAttempts: 5, lockedUntil: lock.toISOString() });
    expect(response.body.data.items[0]).not.toHaveProperty("passwordHash");
    expect(response.body.data.items[0]).not.toHaveProperty("sessions");
  });
});
