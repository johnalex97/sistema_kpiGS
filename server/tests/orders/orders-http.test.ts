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
const password = "GeekOrdersHttp-2026!";
const suffix = randomUUID().slice(0, 8);
const users = {
  admin: {
    id: randomUUID(),
    email: `orders.admin.${randomUUID()}@example.test`,
  },
  supervisor: {
    id: randomUUID(),
    email: `orders.supervisor.${randomUUID()}@example.test`,
  },
  primary: {
    id: randomUUID(),
    email: `orders.primary.${randomUUID()}@example.test`,
  },
  support: {
    id: randomUUID(),
    email: `orders.support.${randomUUID()}@example.test`,
  },
  other: {
    id: randomUUID(),
    email: `orders.other.${randomUUID()}@example.test`,
  },
  provisional: {
    id: randomUUID(),
    email: `orders.provisional.${randomUUID()}@example.test`,
  },
} as const;
const technicianIds = {
  primary: randomUUID(),
  support: randomUUID(),
  other: randomUUID(),
} as const;
const createdOrderIds: string[] = [];
let branchId = "";
let serviceTypeId = "";
let materialId = "";

beforeAll(async () => {
  await seedDatabase(database);
  const [roles, branch, serviceType, material, passwordHash] =
    await Promise.all([
      database.rol.findMany({
        where: { code: { in: ["ADMIN", "SUPERVISOR", "TECHNICIAN"] } },
      }),
      database.sucursalCliente.findFirstOrThrow({
        where: { isActive: true, deletedAt: null },
      }),
      database.tipoServicio.findFirstOrThrow({
        where: { code: "SUPPORT", isActive: true, deletedAt: null },
      }),
      database.material.findFirstOrThrow({
        where: { isActive: true, deletedAt: null, referenceCost: { not: null } },
      }),
      hashPassword(password, {
        N: 1024,
        r: 8,
        p: 1,
        maxmem: 16 * 1024 * 1024,
      }),
    ]);
  branchId = branch.id;
  serviceTypeId = serviceType.id;
  materialId = material.id;
  const roleIds = Object.fromEntries(roles.map((role) => [role.code, role.id]));

  await database.usuario.createMany({
    data: [
      {
        ...users.admin,
        displayName: "Administrador HTTP órdenes",
        status: "ACTIVE",
        mustChangePassword: false,
        passwordHash,
      },
      {
        ...users.supervisor,
        displayName: "Supervisor HTTP órdenes",
        status: "ACTIVE",
        mustChangePassword: false,
        passwordHash,
      },
      {
        ...users.primary,
        displayName: "Principal HTTP órdenes",
        status: "ACTIVE",
        mustChangePassword: false,
        passwordHash,
      },
      {
        ...users.support,
        displayName: "Soporte HTTP órdenes",
        status: "ACTIVE",
        mustChangePassword: false,
        passwordHash,
      },
      {
        ...users.other,
        displayName: "Técnico ajeno HTTP órdenes",
        status: "ACTIVE",
        mustChangePassword: false,
        passwordHash,
      },
      {
        ...users.provisional,
        displayName: "Provisional HTTP órdenes",
        status: "ACTIVE",
        mustChangePassword: true,
        passwordHash,
      },
    ],
  });
  await database.usuarioRol.createMany({
    data: [
      { usuarioId: users.admin.id, rolId: roleIds.ADMIN! },
      { usuarioId: users.supervisor.id, rolId: roleIds.SUPERVISOR! },
      { usuarioId: users.primary.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.support.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.other.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.provisional.id, rolId: roleIds.ADMIN! },
    ],
  });
  await database.tecnico.createMany({
    data: [
      {
        id: technicianIds.primary,
        code: `OHP-${suffix}`,
        fullName: "Principal HTTP órdenes",
        userId: users.primary.id,
      },
      {
        id: technicianIds.support,
        code: `OHS-${suffix}`,
        fullName: "Soporte HTTP órdenes",
        userId: users.support.id,
      },
      {
        id: technicianIds.other,
        code: `OHO-${suffix}`,
        fullName: "Técnico ajeno HTTP órdenes",
        userId: users.other.id,
      },
    ],
  });
});

afterAll(async () => {
  await database.materialUtilizado.deleteMany({
    where: { ordenId: { in: createdOrderIds } },
  });
  await database.historialOrden.deleteMany({
    where: { ordenId: { in: createdOrderIds } },
  });
  await database.ordenTecnico.deleteMany({
    where: { ordenId: { in: createdOrderIds } },
  });
  await database.auditoria.deleteMany({
    where: { entity: "OrdenTrabajo", entityId: { in: createdOrderIds } },
  });
  await database.ordenTrabajo.deleteMany({
    where: { id: { in: createdOrderIds } },
  });
  await database.tecnico.deleteMany({
    where: { id: { in: Object.values(technicianIds) } },
  });
  const userIds = Object.values(users).map(({ id }) => id);
  await database.sesion.deleteMany({ where: { userId: { in: userIds } } });
  await database.auditoria.deleteMany({
    where: { entity: "usuario", entityId: { in: userIds } },
  });
  await database.usuarioRol.deleteMany({
    where: { usuarioId: { in: userIds } },
  });
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

function orderInput(label: string) {
  return {
    branchId,
    serviceTypeId,
    priority: "HIGH",
    reportedProblem: `${label} ${suffix}`,
    description: `Descripción controlada ${label}`,
    scheduledFor: "2026-08-15T15:00:00.000Z",
    estimatedMinutes: 90,
  };
}

describe("orders HTTP security", () => {
  it("enforces authentication, provisional-password, origin, and route permissions", async () => {
    const app = createApp({ env, logger: silentLogger, database });
    const unauthenticated = await request(app).get("/api/v1/orders").expect(401);
    expect(unauthenticated.body.errors[0].code).toBe(
      "AUTHENTICATION_REQUIRED",
    );
    const unauthenticatedMutation = await request(app)
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Sin sesión"))
      .expect(401);
    expect(unauthenticatedMutation.body.errors[0].code).toBe(
      "AUTHENTICATION_REQUIRED",
    );

    const provisional = await authenticatedAgent(users.provisional);
    const passwordRequired = await provisional
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Provisional"))
      .expect(403);
    expect(passwordRequired.body.errors[0].code).toBe(
      "PASSWORD_CHANGE_REQUIRED",
    );

    const admin = await authenticatedAgent(users.admin);
    const foreignId = randomUUID();
    const mutationRoutes = [
      ["post", "/api/v1/orders"],
      ["patch", `/api/v1/orders/${foreignId}`],
      ["post", `/api/v1/orders/${foreignId}/assignments`],
      ["delete", `/api/v1/orders/${foreignId}/assignments/${foreignId}`],
      ["post", `/api/v1/orders/${foreignId}/on-route`],
      ["post", `/api/v1/orders/${foreignId}/start`],
      ["post", `/api/v1/orders/${foreignId}/pause`],
      ["post", `/api/v1/orders/${foreignId}/resume`],
      ["post", `/api/v1/orders/${foreignId}/complete`],
      ["post", `/api/v1/orders/${foreignId}/cancel`],
      ["post", `/api/v1/orders/${foreignId}/adjustments`],
      ["post", `/api/v1/orders/${foreignId}/materials`],
      ["patch", `/api/v1/orders/${foreignId}/materials/${foreignId}`],
      ["delete", `/api/v1/orders/${foreignId}/materials/${foreignId}`],
    ] as const;
    for (const [method, route] of mutationRoutes) {
      const missingOrigin = await admin[method](route).send({}).expect(403);
      expect(missingOrigin.body.errors[0].code).toBe("ORIGIN_REQUIRED");
    }

    const technician = await authenticatedAgent(users.primary);
    const forbiddenCreate = await technician
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Sin permiso"))
      .expect(403);
    expect(forbiddenCreate.body.errors[0].code).toBe("FORBIDDEN");

    const supervisor = await authenticatedAgent(users.supervisor);
    const forbiddenOperation = await supervisor
      .post(`/api/v1/orders/${foreignId}/start`)
      .set("Origin", allowedOrigin)
      .send({ version: 1 })
      .expect(403);
    expect(forbiddenOperation.body.errors[0].code).toBe("FORBIDDEN");

    await supervisor
      .post(`/api/v1/orders/${foreignId}/materials`)
      .set("Origin", allowedOrigin)
      .send({ version: 0 })
      .expect(400);
    const validation = await technician
      .post(`/api/v1/orders/${foreignId}/start`)
      .set("Origin", allowedOrigin)
      .send({ version: 0 })
      .expect(400);
    expect(validation.body).toMatchObject({
      success: false,
      message: "Los datos enviados no son válidos",
      errors: [{ field: "version", code: "VALIDATION_ERROR" }],
    });
  });
});

describe("orders HTTP validation and public history", () => {
  it("returns validation errors for complete and stored temporal conflicts without mutation", async () => {
    const supervisor = await authenticatedAgent(users.supervisor);
    const admin = await authenticatedAgent(users.admin);
    const orderIds = [randomUUID(), randomUUID()];
    createdOrderIds.push(...orderIds);
    const startedAt = new Date("2026-08-01T12:00:00.000Z");
    const endedAt = new Date("2026-08-01T13:00:00.000Z");
    await database.ordenTrabajo.createMany({
      data: orderIds.map((id, index) => ({
        id,
        orderNumber: `HT-${randomUUID().slice(0, 8)}`,
        sucursalId: branchId,
        tipoServicioId: serviceTypeId,
        priority: "HIGH" as const,
        status: "COMPLETED" as const,
        reportedProblem: `Rango temporal HTTP ${index}`,
        startedAt,
        endedAt,
        totalMinutes: 60,
        version: 5,
      })),
    });
    const snapshot = async () => {
      const [orders, historyCount, auditCount] = await Promise.all([
        database.ordenTrabajo.findMany({
          where: { id: { in: orderIds } },
          orderBy: { id: "asc" },
          select: {
            id: true,
            description: true,
            startedAt: true,
            endedAt: true,
            totalMinutes: true,
            version: true,
            updatedAt: true,
          },
        }),
        database.historialOrden.count({
          where: { ordenId: { in: orderIds } },
        }),
        database.auditoria.count({
          where: {
            entity: "OrdenTrabajo",
            entityId: { in: orderIds },
          },
        }),
      ]);
      return { orders, historyCount, auditCount };
    };
    const before = await snapshot();

    const completeConflict = await supervisor
      .post(`/api/v1/orders/${orderIds[0]}/adjustments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 5,
        reason: "Rango completo invertido para validar",
        startedAt: "2026-08-01T15:00:00.000Z",
        endedAt: "2026-08-01T14:00:00.000Z",
      })
      .expect(400);
    expect(completeConflict.body).toMatchObject({
      success: false,
      message: "Los datos enviados no son válidos",
      data: null,
      errors: [{ field: "endedAt", code: "VALIDATION_ERROR" }],
      meta: { requestId: expect.any(String) },
    });

    const storedConflict = await supervisor
      .post(`/api/v1/orders/${orderIds[1]}/adjustments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 5,
        reason: "Inicio posterior al final almacenado",
        startedAt: "2026-08-01T14:00:00.000Z",
      })
      .expect(400);
    expect(storedConflict.body).toMatchObject({
      success: false,
      message: "Los datos enviados no son válidos",
      data: null,
      errors: [{ code: "VALIDATION_ERROR" }],
      meta: { requestId: expect.any(String) },
    });
    expect(await snapshot()).toEqual(before);

    await supervisor
      .post(`/api/v1/orders/${orderIds[0]}/adjustments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 5,
        reason: "Correccion valida para historial publico",
        description: "Descripcion corregida desde HTTP",
        startedAt: "2026-08-01T11:30:00.000Z",
      })
      .expect(200);
    const historyResponse = await admin
      .get(`/api/v1/orders/${orderIds[0]}/history`)
      .expect(200);
    const adjustment = historyResponse.body.data.items[0];
    expect(adjustment).toMatchObject({
      action: "ORDER_ADJUSTED",
      comment: "Correccion valida para historial publico",
      metadata: {
        version: 6,
        changedFields: ["description", "startedAt"],
        before: {
          description: null,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          totalMinutes: 60,
        },
        after: {
          description: "Descripcion corregida desde HTTP",
          startedAt: "2026-08-01T11:30:00.000Z",
          endedAt: endedAt.toISOString(),
          totalMinutes: 90,
        },
      },
    });
    expect(Object.keys(adjustment.metadata.before).sort()).toEqual([
      "cancellationReason",
      "description",
      "diagnosis",
      "endedAt",
      "estimatedMinutes",
      "result",
      "scheduledFor",
      "startedAt",
      "totalMinutes",
    ]);
    expect(JSON.stringify(adjustment.metadata)).not.toContain("reportedProblem");
    expect(JSON.stringify(adjustment.metadata)).not.toContain("passwordHash");
  });

  it("enforces Decimal(12,3) boundaries on material creation and editing", async () => {
    const admin = await authenticatedAgent(users.admin);
    const orderId = randomUUID();
    createdOrderIds.push(orderId);
    await database.ordenTrabajo.create({
      data: {
        id: orderId,
        orderNumber: `HQ-${randomUUID().slice(0, 8)}`,
        sucursalId: branchId,
        tipoServicioId: serviceTypeId,
        priority: "HIGH",
        status: "IN_PROGRESS",
        reportedProblem: "Limite Decimal HTTP",
        startedAt: new Date("2026-08-01T12:00:00.000Z"),
        version: 4,
      },
    });

    const maximumCreated = await admin
      .post(`/api/v1/orders/${orderId}/materials`)
      .set("Origin", allowedOrigin)
      .send({ version: 4, materialId, quantity: "999999999.999" })
      .expect(201);
    expect(maximumCreated.body.data).toMatchObject({
      version: 5,
      materials: [{ quantity: "999999999.999" }],
    });
    const editableCreated = await admin
      .post(`/api/v1/orders/${orderId}/materials`)
      .set("Origin", allowedOrigin)
      .send({ version: 5, materialId, quantity: "1.000" })
      .expect(201);
    const editableUsageId = editableCreated.body.data.materials.find(
      ({ quantity }: { quantity: string }) => quantity === "1.000",
    ).id;
    const maximumEdited = await admin
      .patch(`/api/v1/orders/${orderId}/materials/${editableUsageId}`)
      .set("Origin", allowedOrigin)
      .send({ version: 6, quantity: "999999999.999" })
      .expect(200);
    expect(maximumEdited.body.data).toMatchObject({ version: 7 });
    expect(
      maximumEdited.body.data.materials.filter(
        ({ quantity }: { quantity: string }) =>
          quantity === "999999999.999",
      ),
    ).toHaveLength(2);

    const snapshot = async () => {
      const [order, usages, historyCount, auditCount] = await Promise.all([
        database.ordenTrabajo.findUniqueOrThrow({
          where: { id: orderId },
          select: { version: true, updatedAt: true },
        }),
        database.materialUtilizado.findMany({
          where: { ordenId: orderId },
          orderBy: { id: "asc" },
          select: { id: true, quantity: true, observation: true },
        }),
        database.historialOrden.count({ where: { ordenId: orderId } }),
        database.auditoria.count({
          where: { entity: "OrdenTrabajo", entityId: orderId },
        }),
      ]);
      return {
        order,
        usages: usages.map((usage) => ({
          ...usage,
          quantity: usage.quantity.toFixed(3),
        })),
        historyCount,
        auditCount,
      };
    };
    const beforeOverflow = await snapshot();

    const createOverflow = await admin
      .post(`/api/v1/orders/${orderId}/materials`)
      .set("Origin", allowedOrigin)
      .send({ version: 7, materialId, quantity: "1000000000" })
      .expect(400);
    expect(createOverflow.body).toMatchObject({
      success: false,
      message: "Los datos enviados no son válidos",
      errors: [{ field: "quantity", code: "VALIDATION_ERROR" }],
    });
    const editOverflow = await admin
      .patch(`/api/v1/orders/${orderId}/materials/${editableUsageId}`)
      .set("Origin", allowedOrigin)
      .send({ version: 7, quantity: "1000000000" })
      .expect(400);
    expect(editOverflow.body).toMatchObject({
      success: false,
      message: "Los datos enviados no son válidos",
      errors: [{ field: "quantity", code: "VALIDATION_ERROR" }],
    });
    expect(await snapshot()).toEqual(beforeOverflow);
  });
});

describe("orders HTTP lifecycle", () => {
  it("exposes all order commands with exact versions and safe ownership", async () => {
    const admin = await authenticatedAgent(users.admin);
    const primary = await authenticatedAgent(users.primary);
    const support = await authenticatedAgent(users.support);
    const other = await authenticatedAgent(users.other);
    const supervisor = await authenticatedAgent(users.supervisor);

    const createdResponse = await admin
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Ciclo principal"))
      .expect(201);
    const created = createdResponse.body.data;
    createdOrderIds.push(created.id);
    expect(createdResponse.body).toMatchObject({
      success: true,
      message: "Orden creada",
      data: { status: "PENDING", priority: "HIGH", version: 1 },
      errors: [],
      meta: { requestId: expect.any(String) },
    });

    const updated = await admin
      .patch(`/api/v1/orders/${created.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, priority: "CRITICAL" })
      .expect(200);
    expect(updated.body).toMatchObject({
      message: "Orden actualizada",
      data: { priority: "CRITICAL", version: 2 },
    });
    const stale = await admin
      .patch(`/api/v1/orders/${created.id}`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, priority: "LOW" })
      .expect(409);
    expect(stale.body.errors[0].code).toBe("VERSION_CONFLICT");

    const primaryAssigned = await admin
      .post(`/api/v1/orders/${created.id}/assignments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 2,
        technicianId: technicianIds.primary,
        role: "PRIMARY",
      })
      .expect(200);
    expect(primaryAssigned.body).toMatchObject({
      message: "Técnico asignado",
      data: { status: "ASSIGNED", version: 3 },
    });
    const supportAssigned = await admin
      .post(`/api/v1/orders/${created.id}/assignments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 3,
        technicianId: technicianIds.support,
        role: "SUPPORT",
      })
      .expect(200);
    expect(supportAssigned.body.data).toMatchObject({
      status: "ASSIGNED",
      supportCount: 1,
      version: 4,
    });

    const supportCannotOperate = await support
      .post(`/api/v1/orders/${created.id}/start`)
      .set("Origin", allowedOrigin)
      .send({ version: 4 })
      .expect(409);
    expect(supportCannotOperate.body.errors[0].code).toBe(
      "TECHNICIAN_NOT_ASSIGNED",
    );

    const supportRemoved = await admin
      .delete(
        `/api/v1/orders/${created.id}/assignments/${technicianIds.support}`,
      )
      .set("Origin", allowedOrigin)
      .send({ version: 4, reason: "Soporte retirado del ciclo HTTP" })
      .expect(200);
    expect(supportRemoved.body).toMatchObject({
      message: "Técnico retirado",
      data: { version: 5 },
    });

    const onRoute = await primary
      .post(`/api/v1/orders/${created.id}/on-route`)
      .set("Origin", allowedOrigin)
      .send({ version: 5 })
      .expect(200);
    expect(onRoute.body).toMatchObject({
      message: "Traslado iniciado",
      data: { status: "ON_ROUTE", version: 6 },
    });
    const started = await primary
      .post(`/api/v1/orders/${created.id}/start`)
      .set("Origin", allowedOrigin)
      .send({ version: 6 })
      .expect(200);
    expect(started.body).toMatchObject({
      message: "Trabajo iniciado",
      data: { status: "IN_PROGRESS", version: 7 },
    });
    const paused = await primary
      .post(`/api/v1/orders/${created.id}/pause`)
      .set("Origin", allowedOrigin)
      .send({ version: 7, comment: "Pausa técnica documentada" })
      .expect(200);
    expect(paused.body).toMatchObject({
      message: "Orden pausada",
      data: { status: "PAUSED", version: 8 },
    });
    const resumed = await primary
      .post(`/api/v1/orders/${created.id}/resume`)
      .set("Origin", allowedOrigin)
      .send({ version: 8 })
      .expect(200);
    expect(resumed.body).toMatchObject({
      message: "Orden reanudada",
      data: { status: "IN_PROGRESS", version: 9 },
    });

    const materialAdded = await primary
      .post(`/api/v1/orders/${created.id}/materials`)
      .set("Origin", allowedOrigin)
      .send({
        version: 9,
        materialId,
        quantity: "2.500",
        observation: "Uso durante ciclo HTTP",
      })
      .expect(201);
    const usageId = materialAdded.body.data.materials[0].id;
    expect(materialAdded.body).toMatchObject({
      message: "Material registrado",
      data: {
        version: 10,
        materials: [{ quantity: "2.500" }],
      },
    });

    const foreignCreated = await admin
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Material anidado ajeno"))
      .expect(201);
    const foreignOrderId = foreignCreated.body.data.id;
    createdOrderIds.push(foreignOrderId);
    await admin
      .post(`/api/v1/orders/${foreignOrderId}/assignments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 1,
        technicianId: technicianIds.other,
        role: "PRIMARY",
      })
      .expect(200);
    await other
      .post(`/api/v1/orders/${foreignOrderId}/start`)
      .set("Origin", allowedOrigin)
      .send({ version: 2 })
      .expect(200);
    const foreignMaterial = await admin
      .post(`/api/v1/orders/${foreignOrderId}/materials`)
      .set("Origin", allowedOrigin)
      .send({
        version: 3,
        materialId,
        quantity: "1.250",
        observation: "Uso real de otra orden",
      })
      .expect(201);
    const foreignUsageId = foreignMaterial.body.data.materials[0].id;
    const missingUsageId = randomUUID();
    const nestedSnapshot = async () => {
      const [orders, usages, historyCount, auditCount] = await Promise.all([
        database.ordenTrabajo.findMany({
          where: { id: { in: [created.id, foreignOrderId] } },
          orderBy: { id: "asc" },
          select: { id: true, status: true, version: true },
        }),
        database.materialUtilizado.findMany({
          where: { id: { in: [usageId, foreignUsageId] } },
          orderBy: { id: "asc" },
          select: {
            id: true,
            ordenId: true,
            quantity: true,
            observation: true,
          },
        }),
        database.historialOrden.count({
          where: { ordenId: { in: [created.id, foreignOrderId] } },
        }),
        database.auditoria.count({
          where: {
            entity: "OrdenTrabajo",
            entityId: { in: [created.id, foreignOrderId] },
          },
        }),
      ]);
      return {
        orders,
        usages: usages.map((usage) => ({
          ...usage,
          quantity: usage.quantity.toFixed(3),
        })),
        historyCount,
        auditCount,
      };
    };
    const nestedBefore = await nestedSnapshot();

    for (const method of ["patch", "delete"] as const) {
      const errors = [];
      for (const candidateUsageId of [foreignUsageId, missingUsageId]) {
        const command = primary[method](
          `/api/v1/orders/${created.id}/materials/${candidateUsageId}`,
        ).set("Origin", allowedOrigin);
        const concealed = await (method === "patch"
          ? command.send({ version: 10, quantity: "3.000" })
          : command.send({ version: 10 })
        ).expect(404);
        expect(concealed.body).toMatchObject({
          success: false,
          message: "El material utilizado no existe",
          data: null,
          errors: [
            {
              code: "MATERIAL_USAGE_NOT_FOUND",
              message: "El material utilizado no existe",
            },
          ],
          meta: { requestId: expect.any(String) },
        });
        errors.push({
          success: concealed.body.success,
          message: concealed.body.message,
          data: concealed.body.data,
          errors: concealed.body.errors,
        });
      }
      expect(errors[0]).toEqual(errors[1]);
    }
    expect(await nestedSnapshot()).toEqual(nestedBefore);

    const materialUpdated = await primary
      .patch(`/api/v1/orders/${created.id}/materials/${usageId}`)
      .set("Origin", allowedOrigin)
      .send({ version: 10, quantity: "3.000" })
      .expect(200);
    expect(materialUpdated.body).toMatchObject({
      message: "Material actualizado",
      data: {
        version: 11,
        materials: [{ id: usageId, quantity: "3.000" }],
      },
    });
    const materialRemoved = await primary
      .delete(`/api/v1/orders/${created.id}/materials/${usageId}`)
      .set("Origin", allowedOrigin)
      .send({ version: 11 })
      .expect(200);
    expect(materialRemoved.body).toMatchObject({
      message: "Material retirado",
      data: { version: 12, materials: [] },
    });

    const completed = await primary
      .post(`/api/v1/orders/${created.id}/complete`)
      .set("Origin", allowedOrigin)
      .send({
        version: 12,
        diagnosis: "Conector con terminación deficiente",
        result: "Enlace estabilizado y verificado",
      })
      .expect(200);
    expect(completed.body).toMatchObject({
      message: "Orden completada",
      data: { status: "COMPLETED", version: 13 },
    });
    const adjusted = await supervisor
      .post(`/api/v1/orders/${created.id}/adjustments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 13,
        reason: "Corrección aprobada por supervisión",
        result: "Enlace estable y evidencia revisada",
      })
      .expect(200);
    expect(adjusted.body).toMatchObject({
      message: "Orden ajustada",
      data: { status: "COMPLETED", version: 14 },
    });

    const detail = await admin
      .get(`/api/v1/orders/${created.id}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      message: "Orden consultada",
      data: { id: created.id, version: 14 },
      meta: { requestId: expect.any(String) },
    });
    expect(JSON.stringify(detail.body)).not.toContain("passwordHash");
    expect(JSON.stringify(detail.body)).not.toContain("permissions");

    const filtered = await admin
      .get("/api/v1/orders")
      .query({
        search: suffix,
        branchId,
        serviceTypeId,
        status: "COMPLETED",
        priority: "CRITICAL",
        page: 1,
        pageSize: 1,
      })
      .expect(200);
    expect(filtered.body).toMatchObject({
      message: "Órdenes consultadas",
      data: {
        items: [{ id: created.id }],
        pagination: { page: 1, pageSize: 1, totalItems: 1, totalPages: 1 },
      },
    });
    const history = await admin
      .get(`/api/v1/orders/${created.id}/history`)
      .query({ page: 1, pageSize: 2 })
      .expect(200);
    expect(history.body).toMatchObject({
      message: "Historial consultado",
      data: {
        items: [{ id: expect.any(String) }, { id: expect.any(String) }],
        pagination: { page: 1, pageSize: 2 },
      },
      meta: { requestId: expect.any(String) },
    });

    const cancelledCreated = await admin
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Cancelación"))
      .expect(201);
    createdOrderIds.push(cancelledCreated.body.data.id);
    const cancelled = await admin
      .post(`/api/v1/orders/${cancelledCreated.body.data.id}/cancel`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, cancellationReason: "Solicitud cancelada por cliente" })
      .expect(200);
    expect(cancelled.body).toMatchObject({
      message: "Orden cancelada",
      data: { status: "CANCELLED", version: 2 },
    });

    const visibleCreated = await admin
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Visibilidad actual"))
      .expect(201);
    createdOrderIds.push(visibleCreated.body.data.id);
    await admin
      .post(`/api/v1/orders/${visibleCreated.body.data.id}/assignments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 1,
        technicianId: technicianIds.support,
        role: "SUPPORT",
      })
      .expect(200);
    const supportList = await support
      .get("/api/v1/orders")
      .query({ search: suffix, page: 1, pageSize: 20 })
      .expect(200);
    const visibleIds = supportList.body.data.items.map(
      ({ id }: { id: string }) => id,
    );
    expect(visibleIds).toContain(created.id);
    expect(visibleIds).toContain(visibleCreated.body.data.id);
    expect(visibleIds).not.toContain(cancelledCreated.body.data.id);
    const concealedDetail = await support
      .get(`/api/v1/orders/${cancelledCreated.body.data.id}`)
      .expect(404);
    expect(concealedDetail.body.errors[0].code).toBe("ORDER_NOT_FOUND");
  });

  it("supports direct start and rejects overlapping operational work", async () => {
    const admin = await authenticatedAgent(users.admin);
    const primary = await authenticatedAgent(users.primary);

    const remoteCreated = await admin
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Soporte remoto"))
      .expect(201);
    const remoteId = remoteCreated.body.data.id;
    createdOrderIds.push(remoteId);
    await admin
      .post(`/api/v1/orders/${remoteId}/assignments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 1,
        technicianId: technicianIds.primary,
        role: "PRIMARY",
      })
      .expect(200);
    const directStart = await primary
      .post(`/api/v1/orders/${remoteId}/start`)
      .set("Origin", allowedOrigin)
      .send({ version: 2 })
      .expect(200);
    expect(directStart.body.data).toMatchObject({
      status: "IN_PROGRESS",
      version: 3,
    });

    const busyCreated = await admin
      .post("/api/v1/orders")
      .set("Origin", allowedOrigin)
      .send(orderInput("Conflicto de ocupación"))
      .expect(201);
    const busyId = busyCreated.body.data.id;
    createdOrderIds.push(busyId);
    await admin
      .post(`/api/v1/orders/${busyId}/assignments`)
      .set("Origin", allowedOrigin)
      .send({
        version: 1,
        technicianId: technicianIds.primary,
        role: "PRIMARY",
      })
      .expect(200);
    const busy = await primary
      .post(`/api/v1/orders/${busyId}/start`)
      .set("Origin", allowedOrigin)
      .send({ version: 2 })
      .expect(409);
    expect(busy.body.errors[0].code).toBe("TECHNICIAN_BUSY");

    await admin
      .post(`/api/v1/orders/${remoteId}/cancel`)
      .set("Origin", allowedOrigin)
      .send({ version: 3, cancellationReason: "Fin del escenario de humo HTTP" })
      .expect(200);
    await admin
      .post(`/api/v1/orders/${busyId}/cancel`)
      .set("Origin", allowedOrigin)
      .send({ version: 2, cancellationReason: "Fin del escenario de ocupación" })
      .expect(200);
  });
});
