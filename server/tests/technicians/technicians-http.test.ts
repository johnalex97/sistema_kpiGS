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
const password = "GeekTechHttp-2026!";
const createdTechnicianIds: string[] = [];
let adminId = "";
let adminEmail = "";
let readOnlyId = "";
let readOnlyEmail = "";

beforeAll(async () => {
  await seedDatabase(database);
  const adminRole = await database.rol.findUniqueOrThrow({
    where: { code: "ADMIN" },
  });
  adminId = randomUUID();
  adminEmail = `technicians.http.${randomUUID()}@example.test`;
  const technicianRole = await database.rol.findUniqueOrThrow({
    where: { code: "TECHNICIAN" },
  });
  readOnlyId = randomUUID();
  readOnlyEmail = `technicians.http.read-only.${randomUUID()}@example.test`;
  await database.usuario.create({
    data: {
      id: adminId,
      email: adminEmail,
      displayName: "Administrador HTTP Técnicos",
      status: "ACTIVE",
      mustChangePassword: false,
      passwordHash: await hashPassword(password, {
        N: 1024,
        r: 8,
        p: 1,
        maxmem: 16 * 1024 * 1024,
      }),
      roles: { create: { rolId: adminRole.id } },
    },
  });
  await database.usuario.create({
    data: {
      id: readOnlyId,
      email: readOnlyEmail,
      displayName: "Usuario solo lectura HTTP TÃ©cnicos",
      status: "ACTIVE",
      mustChangePassword: false,
      passwordHash: await hashPassword(password, {
        N: 1024,
        r: 8,
        p: 1,
        maxmem: 16 * 1024 * 1024,
      }),
      roles: { create: { rolId: technicianRole.id } },
    },
  });
});

afterAll(async () => {
  await database.auditoria.deleteMany({
    where: { entity: "tecnico", entityId: { in: createdTechnicianIds } },
  });
  await database.tecnico.deleteMany({
    where: { id: { in: createdTechnicianIds } },
  });
  await database.sesion.deleteMany({ where: { userId: adminId } });
  await database.auditoria.deleteMany({
    where: { entity: "usuario", entityId: adminId },
  });
  await database.usuarioRol.deleteMany({ where: { usuarioId: adminId } });
  await database.usuario.deleteMany({ where: { id: adminId } });
  await database.sesion.deleteMany({ where: { userId: readOnlyId } });
  await database.auditoria.deleteMany({
    where: { entity: "usuario", entityId: readOnlyId },
  });
  await database.usuarioRol.deleteMany({ where: { usuarioId: readOnlyId } });
  await database.usuario.deleteMany({ where: { id: readOnlyId } });
  await disconnectTestDatabase();
});

async function authenticatedAgent(email = adminEmail) {
  const agent = request.agent(
    createApp({ env, logger: silentLogger, database }),
  );
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", allowedOrigin)
    .send({ email, password })
    .expect(200);
  return agent;
}

describe("technicians HTTP API", () => {
  it("requires authentication, changed password, origin, and permission", async () => {
    const app = createApp({ env, logger: silentLogger, database });
    const unauthenticated = await request(app)
      .get("/api/v1/technicians")
      .expect(401);
    expect(unauthenticated.body.errors[0].code).toBe(
      "AUTHENTICATION_REQUIRED",
    );

    const agent = await authenticatedAgent();
    const missingOrigin = await agent
      .post("/api/v1/technicians")
      .send({ fullName: "Sin origen" })
      .expect(403);
    expect(missingOrigin.body.errors[0].code).toBe("ORIGIN_REQUIRED");

    await database.usuario.update({
      where: { id: adminId },
      data: { mustChangePassword: true },
    });
    const provisional = await agent.get("/api/v1/technicians").expect(403);
    expect(provisional.body.errors[0].code).toBe(
      "PASSWORD_CHANGE_REQUIRED",
    );
    await database.usuario.update({
      where: { id: adminId },
      data: { mustChangePassword: false },
    });
  });

  it("protects and filters the eligible users endpoint", async () => {
    const app = createApp({ env, logger: silentLogger, database });
    await request(app)
      .get("/api/v1/technicians/eligible-users")
      .expect(401);

    const readOnlyAgent = await authenticatedAgent(readOnlyEmail);
    const forbidden = await readOnlyAgent
      .get("/api/v1/technicians/eligible-users")
      .expect(403);
    expect(forbidden.body.error?.code ?? forbidden.body.errors[0]?.code).toBe(
      "FORBIDDEN",
    );

    const managerAgent = await authenticatedAgent();
    const response = await managerAgent
      .get("/api/v1/technicians/eligible-users?page=1&pageSize=20")
      .expect(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        pagination: expect.objectContaining({ page: 1, pageSize: 20 }),
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");

    const search = await managerAgent
      .get(
        "/api/v1/technicians/eligible-users?search=solo%20lectura&pageSize=20",
      )
      .expect(200);
    expect(search.body.data.items).toEqual([
      expect.objectContaining({ id: readOnlyId, email: readOnlyEmail }),
    ]);

    const invalidTechnicianId = await managerAgent
      .get("/api/v1/technicians/eligible-users?technicianId=no-es-uuid")
      .expect(400);
    expect(invalidTechnicianId.body.errors[0].code).toBe("VALIDATION_ERROR");

    await database.usuario.update({
      where: { id: adminId },
      data: { mustChangePassword: true },
    });
    const provisional = await managerAgent
      .get("/api/v1/technicians/eligible-users")
      .expect(403);
    expect(provisional.body.errors[0].code).toBe("PASSWORD_CHANGE_REQUIRED");
    await database.usuario.update({
      where: { id: adminId },
      data: { mustChangePassword: false },
    });
  });

  it("validates input and completes the technician lifecycle", async () => {
    const agent = await authenticatedAgent();
    const invalid = await agent
      .post("/api/v1/technicians")
      .set("Origin", allowedOrigin)
      .send({ fullName: "Inválido", code: "TEC-999" })
      .expect(400);
    expect(invalid.body.errors[0].code).toBe("VALIDATION_ERROR");

    const createdResponse = await agent
      .post("/api/v1/technicians")
      .set("Origin", allowedOrigin)
      .send({
        fullName: "Técnico HTTP",
        specialty: "Redes",
        workEmail: `HTTP.${randomUUID().slice(0, 8)}@EXAMPLE.TEST`,
        hiredOn: "2026-07-01",
      })
      .expect(201);
    const created = createdResponse.body.data;
    createdTechnicianIds.push(created.id);
    expect(createdResponse.body.message).toBe("Técnico creado");
    expect(created).toMatchObject({ status: "AVAILABLE", version: 1 });

    const list = await agent
      .get("/api/v1/technicians?page=1&pageSize=20")
      .expect(200);
    expect(list.body.data.items.some(({ id }: { id: string }) => id === created.id)).toBe(true);

    await agent.get(`/api/v1/technicians/${created.id}`).expect(200);
    const updated = await agent
      .patch(`/api/v1/technicians/${created.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, specialty: "Fibra" })
      .expect(200);
    expect(updated.body.data.version).toBe(2);

    const status = await agent
      .patch(`/api/v1/technicians/${created.id}/status`)
      .set("Origin", allowedOrigin)
      .send({ version: 2, status: "ON_ROUTE" })
      .expect(200);
    expect(status.body.data.version).toBe(3);

    const inactive = await agent
      .delete(`/api/v1/technicians/${created.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 3, reason: "Fin de relación laboral" })
      .expect(200);
    expect(inactive.body.data.status).toBe("INACTIVE");

    const reactivated = await agent
      .post(`/api/v1/technicians/${created.id}/reactivate`)
      .set("Origin", allowedOrigin)
      .send({ version: 4, reason: "Reingreso laboral aprobado" })
      .expect(200);
    expect(reactivated.body.data).toMatchObject({
      status: "AVAILABLE",
      version: 5,
    });
    expect(JSON.stringify(reactivated.body)).not.toContain("passwordHash");
    expect(JSON.stringify(reactivated.body)).not.toContain("permissions");
  });
});
