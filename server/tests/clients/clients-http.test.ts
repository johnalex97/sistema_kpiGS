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
  DATABASE_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});
const password = "GeekClientsHttp-2026!";
const users: Record<"admin" | "supervisor" | "technician" | "provisional", { id: string; email: string }> = {
  admin: { id: randomUUID(), email: `clients.admin.${randomUUID()}@example.test` },
  supervisor: { id: randomUUID(), email: `clients.supervisor.${randomUUID()}@example.test` },
  technician: { id: randomUUID(), email: `clients.technician.${randomUUID()}@example.test` },
  provisional: { id: randomUUID(), email: `clients.provisional.${randomUUID()}@example.test` },
};
const createdClientIds: string[] = [];
const createdBranchIds: string[] = [];
const createdContactIds: string[] = [];

beforeAll(async () => {
  await seedDatabase(database);
  const roles = await database.rol.findMany({
    where: { code: { in: ["ADMIN", "SUPERVISOR", "TECHNICIAN"] } },
  });
  const roleId = Object.fromEntries(roles.map((role) => [role.code, role.id]));
  const passwordHash = await hashPassword(password, {
    N: 1024,
    r: 8,
    p: 1,
    maxmem: 16 * 1024 * 1024,
  });
  await database.usuario.createMany({
    data: [
      { ...users.admin, displayName: "Administrador clientes", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.supervisor, displayName: "Supervisor clientes", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.technician, displayName: "Técnico clientes", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.provisional, displayName: "Usuario provisional", status: "ACTIVE", mustChangePassword: true, passwordHash },
    ],
  });
  await database.usuarioRol.createMany({
    data: [
      { usuarioId: users.admin.id, rolId: roleId.ADMIN! },
      { usuarioId: users.supervisor.id, rolId: roleId.SUPERVISOR! },
      { usuarioId: users.technician.id, rolId: roleId.TECHNICIAN! },
      { usuarioId: users.provisional.id, rolId: roleId.ADMIN! },
    ],
  });
});

afterAll(async () => {
  await database.auditoria.deleteMany({
    where: {
      OR: [
        { entity: "cliente", entityId: { in: createdClientIds } },
        { entity: "sucursal_cliente", entityId: { in: createdBranchIds } },
        { entity: "contacto_cliente", entityId: { in: createdContactIds } },
      ],
    },
  });
  await database.contactoCliente.deleteMany({ where: { clienteId: { in: createdClientIds } } });
  await database.sucursalCliente.deleteMany({ where: { clienteId: { in: createdClientIds } } });
  await database.cliente.deleteMany({ where: { id: { in: createdClientIds } } });
  const userIds = Object.values(users).map(({ id }) => id);
  await database.sesion.deleteMany({ where: { userId: { in: userIds } } });
  await database.auditoria.deleteMany({ where: { entity: "usuario", entityId: { in: userIds } } });
  await database.usuarioRol.deleteMany({ where: { usuarioId: { in: userIds } } });
  await database.usuario.deleteMany({ where: { id: { in: userIds } } });
  await disconnectTestDatabase();
});

async function authenticatedAgent(user: (typeof users)[keyof typeof users]) {
  const agent = request.agent(createApp({ env, logger: silentLogger, database }));
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", allowedOrigin)
    .send({ email: user.email, password })
    .expect(200);
  return agent;
}

describe("clients HTTP security", () => {
  it("enforces authentication, changed password, origin, and role permissions", async () => {
    const app = createApp({ env, logger: silentLogger, database });
    const unauthenticated = await request(app).get("/api/v1/clients").expect(401);
    expect(unauthenticated.body.errors[0].code).toBe("AUTHENTICATION_REQUIRED");

    const provisional = await authenticatedAgent(users.provisional);
    const passwordRequired = await provisional.get("/api/v1/clients").expect(403);
    expect(passwordRequired.body.errors[0].code).toBe("PASSWORD_CHANGE_REQUIRED");

    const technician = await authenticatedAgent(users.technician);
    await technician.get("/api/v1/clients").expect(200);
    const forbidden = await technician
      .post("/api/v1/clients")
      .set("Origin", allowedOrigin)
      .send({})
      .expect(403);
    expect(forbidden.body.errors[0].code).toBe("FORBIDDEN");

    const admin = await authenticatedAgent(users.admin);
    const missingOrigin = await admin.post("/api/v1/clients").send({}).expect(403);
    expect(missingOrigin.body.errors[0].code).toBe("ORIGIN_REQUIRED");
    await admin.post("/api/v1/clients").set("Origin", allowedOrigin).send({}).expect(400);

    const supervisor = await authenticatedAgent(users.supervisor);
    await supervisor.post("/api/v1/clients").set("Origin", allowedOrigin).send({}).expect(400);
  });
});

describe("clients HTTP lifecycle", () => {
  it("completes the client, branch, and contact lifecycle without leaking internal data", async () => {
    const agent = await authenticatedAgent(users.admin);
    const createdResponse = await agent
      .post("/api/v1/clients")
      .set("Origin", allowedOrigin)
      .send({
        tradeName: `Cliente HTTP ${randomUUID().slice(0, 8)}`,
        email: "  CLIENTE.HTTP@EXAMPLE.TEST  ",
        mainBranch: {
          name: "Principal",
          address: "Centro",
          city: "Tegucigalpa",
          lat: "14.0723",
          long: "-87.1921",
        },
        primaryContact: {
          scope: "MAIN_BRANCH",
          fullName: "Contacto inicial",
          email: "INICIAL@EXAMPLE.TEST",
        },
      })
      .expect(201);
    const client = createdResponse.body.data;
    createdClientIds.push(client.id);
    createdBranchIds.push(client.branches[0].id);
    createdContactIds.push(client.contacts[0].id);
    expect(createdResponse.body.message).toBe("Cliente creado");
    expect(client).toMatchObject({ version: 1, email: "cliente.http@example.test" });
    expect(client.branches[0]).toMatchObject({ code: "MAIN", version: 1 });
    expect(client.contacts[0]).toMatchObject({ scope: "BRANCH", isPrimary: true, version: 1 });

    const list = await agent.get("/api/v1/clients?page=1&pageSize=20").expect(200);
    expect(list.body.data.pagination).toMatchObject({ page: 1, pageSize: 20 });
    expect(list.body.data.items.some(({ id }: { id: string }) => id === client.id)).toBe(true);
    await agent.get(`/api/v1/clients/${client.id}`).expect(200);

    const updatedClient = await agent
      .patch(`/api/v1/clients/${client.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, notes: "Cliente actualizado por HTTP" })
      .expect(200);
    expect(updatedClient.body.data.version).toBe(2);
    const staleClient = await agent
      .patch(`/api/v1/clients/${client.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, notes: "Versión anterior" })
      .expect(409);
    expect(staleClient.body.errors[0].code).toBe("VERSION_CONFLICT");

    const branchResponse = await agent
      .post(`/api/v1/clients/${client.id}/branches`)
      .set("Origin", allowedOrigin)
      .send({ name: "Sucursal norte", address: "Norte", country: "HN" })
      .expect(201);
    const branch = branchResponse.body.data;
    createdBranchIds.push(branch.id);
    expect(branch).toMatchObject({ code: "SUC-001", version: 1 });

    const updatedBranch = await agent
      .patch(`/api/v1/clients/${client.id}/branches/${branch.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, city: "Comayagüela" })
      .expect(200);
    expect(updatedBranch.body.data.version).toBe(2);
    const foreignBranch = await database.sucursalCliente.findFirstOrThrow({
      where: { clienteId: { not: client.id } },
      select: { id: true },
    });
    const foreignNested = await agent
      .patch(`/api/v1/clients/${client.id}/branches/${foreignBranch.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, city: "No permitido" })
      .expect(404);
    expect(foreignNested.body.errors[0].code).toBe("BRANCH_NOT_FOUND");
    await agent.get(`/api/v1/clients/${client.id}/branches`).expect(200);

    const generalResponse = await agent
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set("Origin", allowedOrigin)
      .send({ scope: "CLIENT", fullName: "Administración general", isPrimary: true })
      .expect(201);
    const generalContact = generalResponse.body.data;
    createdContactIds.push(generalContact.id);
    expect(generalContact).toMatchObject({ scope: "CLIENT", branchId: null, version: 1 });

    const branchContactResponse = await agent
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set("Origin", allowedOrigin)
      .send({
        scope: "BRANCH",
        branchId: branch.id,
        fullName: "Encargado norte",
        isPrimary: true,
      })
      .expect(201);
    const branchContact = branchContactResponse.body.data;
    createdContactIds.push(branchContact.id);
    await agent.get(`/api/v1/clients/${client.id}/contacts`).expect(200);

    const updatedContact = await agent
      .patch(`/api/v1/clients/${client.id}/contacts/${generalContact.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, fullName: "Administración central" })
      .expect(200);
    expect(updatedContact.body.data.version).toBe(2);

    const inactiveContact = await agent
      .delete(`/api/v1/clients/${client.id}/contacts/${branchContact.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, reason: "Contacto local fuera de servicio" })
      .expect(200);
    expect(inactiveContact.body.data).toMatchObject({ isActive: false, version: 2 });
    const inactiveList = await agent
      .get(`/api/v1/clients/${client.id}/contacts?includeInactive=true`)
      .expect(200);
    expect(inactiveList.body.data.items.some(({ id }: { id: string }) => id === branchContact.id)).toBe(true);
    const activeContact = await agent
      .post(`/api/v1/clients/${client.id}/contacts/${branchContact.id}/reactivate`)
      .set("Origin", allowedOrigin)
      .send({ version: 2, reason: "Contacto local nuevamente disponible" })
      .expect(200);
    expect(activeContact.body.data.version).toBe(3);

    const inactiveBranch = await agent
      .delete(`/api/v1/clients/${client.id}/branches/${branch.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 2, reason: "Cierre temporal de la sucursal" })
      .expect(200);
    expect(inactiveBranch.body.data).toMatchObject({ isActive: false, version: 3 });
    const activeBranch = await agent
      .post(`/api/v1/clients/${client.id}/branches/${branch.id}/reactivate`)
      .set("Origin", allowedOrigin)
      .send({ version: 3, reason: "Reapertura aprobada de la sucursal" })
      .expect(200);
    expect(activeBranch.body.data.version).toBe(4);

    const inactiveClient = await agent
      .delete(`/api/v1/clients/${client.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 2, reason: "Cierre temporal aprobado del cliente" })
      .expect(200);
    expect(inactiveClient.body.data).toMatchObject({ isActive: false, version: 3 });
    await agent.get(`/api/v1/clients/${client.id}`).expect(404);
    await agent.get(`/api/v1/clients/${client.id}?includeInactive=true`).expect(200);
    const activeClient = await agent
      .post(`/api/v1/clients/${client.id}/reactivate`)
      .set("Origin", allowedOrigin)
      .send({ version: 3, reason: "Reactivación aprobada del cliente" })
      .expect(200);
    expect(activeClient.body.data).toMatchObject({ isActive: true, version: 4 });

    const serialized = JSON.stringify(activeClient.body);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("permissions");
    expect(serialized).not.toContain("deletedAt");
    expect(activeClient.body.meta.requestId).toBeTypeOf("string");
  });
});
