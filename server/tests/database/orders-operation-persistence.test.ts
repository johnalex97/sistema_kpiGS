import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "../../generated/prisma/client.js";
import { createDatabaseClient } from "../../src/config/database.js";
import { createOrdersOperationRepository } from "../../src/orders/orders.operation.repository.js";
import type { OrderMutationResult } from "../../src/orders/orders.repository.types.js";
import type { OrderActorContext } from "../../src/orders/orders.types.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

const firstNow = new Date("2026-08-01T12:00:00.000Z");
const secondNow = new Date("2026-08-01T12:30:00.000Z");
const thirdNow = new Date("2026-08-01T13:00:00.000Z");
const fourthNow = new Date("2026-08-01T13:30:00.000Z");

interface OperationalLockWaiters {
  advisoryWaiters: number;
  technicianWaiters: number;
}

async function waitForOperationalLockWindow(
  transaction: Prisma.TransactionClient,
  blockerPid: number,
): Promise<OperationalLockWaiters> {
  const deadline = Date.now() + 2_000;
  let observed: OperationalLockWaiters = {
    advisoryWaiters: 0,
    technicianWaiters: 0,
  };
  while (Date.now() < deadline) {
    const rows = await transaction.$queryRaw<OperationalLockWaiters[]>`
      WITH "advisoryWaiterPids" AS (
        SELECT DISTINCT "locks"."pid"
        FROM "pg_locks" AS "locks"
        INNER JOIN "pg_stat_activity" AS "activity"
          ON "activity"."pid" = "locks"."pid"
        WHERE "activity"."datname" = current_database()
          AND "locks"."locktype" = 'advisory'
          AND "locks"."granted" = false
          AND ${blockerPid} = ANY(pg_blocking_pids("locks"."pid"))
      ),
      "technicianWaiterPids" AS (
        SELECT DISTINCT "locks"."pid"
        FROM "pg_locks" AS "locks"
        INNER JOIN "pg_stat_activity" AS "activity"
          ON "activity"."pid" = "locks"."pid"
        WHERE "activity"."datname" = current_database()
          AND "locks"."locktype" IN ('transactionid', 'tuple')
          AND "locks"."granted" = false
          AND EXISTS (
            SELECT 1
            FROM "advisoryWaiterPids" AS "advisory"
            WHERE "advisory"."pid" = ANY(pg_blocking_pids("locks"."pid"))
          )
      )
      SELECT
        (SELECT COUNT(*) FROM "advisoryWaiterPids")::int AS "advisoryWaiters",
        (SELECT COUNT(*) FROM "technicianWaiterPids")::int AS "technicianWaiters"
    `;
    observed = rows[0] ?? observed;
    if (observed.advisoryWaiters >= 1 && observed.technicianWaiters >= 1) {
      return observed;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const activities = await transaction.$queryRaw<
    Array<{
      pid: number;
      state: string | null;
      waitEventType: string | null;
      waitEvent: string | null;
      query: string;
    }>
  >`
    SELECT
      "pid",
      "state",
      "wait_event_type" AS "waitEventType",
      "wait_event" AS "waitEvent",
      "query"
    FROM "pg_stat_activity"
    WHERE "datname" = current_database()
      AND "pid" <> pg_backend_pid()
    ORDER BY "pid"
  `;
  throw new Error(
    `Expected one advisory waiter and one technician-row waiter; observed ${JSON.stringify({ observed, activities })}`,
  );
}

interface OperationFixture {
  clientId: string;
  branchId: string;
  serviceTypeId: string;
  userId: string;
  technicianIds: {
    primary: string;
    remotePrimary: string;
    support: string;
    unrelated: string;
  };
  materialIds: {
    active: string;
    inactive: string;
    withoutCost: string;
    deleted: string;
  };
}

interface CreateOperationOrderOptions {
  status?: "PENDING" | "ASSIGNED" | "ON_ROUTE" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  version?: number;
  primaryTechnicianId?: string | null;
  supportTechnicianId?: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  withProductiveTime?: boolean;
}

let fixture: OperationFixture;
const createdOrderIds: string[] = [];

function actor(technicianId: string | null): OrderActorContext {
  return {
    userId: fixture.userId,
    technicianId,
    permissions: ["ORDERS_OPERATE_OWN"],
    requestId: randomUUID(),
    ipAddress: "127.0.0.1",
    userAgent: "Orders operation persistence test",
  };
}

async function createOperationOrder(
  options: CreateOperationOrderOptions = {},
): Promise<string> {
  const id = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const status = options.status ?? "ASSIGNED";
  const version = options.version ?? 2;
  createdOrderIds.push(id);
  await database.ordenTrabajo.create({
    data: {
      id,
      orderNumber: `OP-${suffix}`,
      sucursalId: fixture.branchId,
      tipoServicioId: fixture.serviceTypeId,
      priority: "HIGH",
      status,
      reportedProblem: `Problema operativo ${suffix}`,
      ...(options.startedAt !== undefined && { startedAt: options.startedAt }),
      ...(options.endedAt !== undefined && { endedAt: options.endedAt }),
      version,
    },
  });
  const assignments = [];
  if (options.primaryTechnicianId !== null) {
    assignments.push({
      ordenId: id,
      tecnicoId:
        options.primaryTechnicianId ?? fixture.technicianIds.primary,
      role: "PRIMARY" as const,
      assignedAt: new Date("2026-08-01T10:00:00.000Z"),
      assignedById: fixture.userId,
    });
  }
  if (options.supportTechnicianId !== undefined) {
    assignments.push({
      ordenId: id,
      tecnicoId: options.supportTechnicianId,
      role: "SUPPORT" as const,
      assignedAt: new Date("2026-08-01T10:05:00.000Z"),
      assignedById: fixture.userId,
    });
  }
  if (assignments.length > 0) {
    await database.ordenTecnico.createMany({ data: assignments });
  }
  if ((options.withProductiveTime ?? status === "IN_PROGRESS") && assignments.length > 0) {
    const activityType = await database.tipoActividad.findFirstOrThrow({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    await database.actividad.create({
      data: {
        sucursalId: fixture.branchId,
        ordenId: id,
        tipoActividadId: activityType.id,
        status: "COMPLETED",
        description: "Tiempo productivo para completar la orden",
        startedAt: firstNow,
        endedAt: secondNow,
        productiveMinutes: 30,
        tecnicos: {
          create: {
            tecnicoId: assignments[0]!.tecnicoId,
            role: "RESPONSIBLE",
            participationPercentage: "100.00",
            startedAt: firstNow,
            endedAt: secondNow,
          },
        },
      },
    });
  }
  return id;
}

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.usuario.findUniqueOrThrow({
    where: { email: "admin.demo@geeksolution.example.test" },
    select: { id: true },
  });
  fixture = {
    clientId: randomUUID(),
    branchId: randomUUID(),
    serviceTypeId: randomUUID(),
    userId: user.id,
    technicianIds: {
      primary: randomUUID(),
      remotePrimary: randomUUID(),
      support: randomUUID(),
      unrelated: randomUUID(),
    },
    materialIds: {
      active: randomUUID(),
      inactive: randomUUID(),
      withoutCost: randomUUID(),
      deleted: randomUUID(),
    },
  };
  await database.cliente.create({
    data: {
      id: fixture.clientId,
      code: `OP-${suffix}`,
      tradeName: `Cliente operativo ${suffix}`,
    },
  });
  await database.sucursalCliente.create({
    data: {
      id: fixture.branchId,
      clienteId: fixture.clientId,
      code: "MAIN",
      name: `Sucursal operativa ${suffix}`,
      address: "Centro",
    },
  });
  await database.tipoServicio.create({
    data: {
      id: fixture.serviceTypeId,
      code: `OP-${suffix}`,
      name: `Servicio operativo ${suffix}`,
    },
  });
  await database.tecnico.createMany({
    data: Object.entries(fixture.technicianIds).map(([name, id]) => ({
      id,
      code: `OP-${name.slice(0, 8)}-${suffix}`,
      fullName: `Técnico ${name} ${suffix}`,
    })),
  });
  await database.material.createMany({
    data: [
      {
        id: fixture.materialIds.active,
        code: `OP-MAT-ACTIVE-${suffix}`,
        name: `Material activo ${suffix}`,
        unit: "metro",
        referenceCost: "25.00",
      },
      {
        id: fixture.materialIds.inactive,
        code: `OP-MAT-INACTIVE-${suffix}`,
        name: `Material inactivo ${suffix}`,
        unit: "unidad",
        referenceCost: "10.00",
        isActive: false,
      },
      {
        id: fixture.materialIds.withoutCost,
        code: `OP-MAT-NOCOST-${suffix}`,
        name: `Material sin costo ${suffix}`,
        unit: "unidad",
      },
      {
        id: fixture.materialIds.deleted,
        code: `OP-MAT-DELETED-${suffix}`,
        name: `Material eliminado ${suffix}`,
        unit: "unidad",
        referenceCost: "10.00",
        deletedAt: firstNow,
      },
    ],
  });
});

afterEach(async () => {
  await database.actividadTecnico.deleteMany({
    where: { actividad: { ordenId: { in: createdOrderIds } } },
  });
  await database.actividad.deleteMany({
    where: { ordenId: { in: createdOrderIds } },
  });
  await database.materialUtilizado.deleteMany({
    where: { ordenId: { in: createdOrderIds } },
  });
  await database.historialOrden.deleteMany({
    where: { ordenId: { in: createdOrderIds } },
  });
  await database.auditoria.deleteMany({
    where: { entity: "OrdenTrabajo", entityId: { in: createdOrderIds } },
  });
  await database.ordenTecnico.deleteMany({
    where: { ordenId: { in: createdOrderIds } },
  });
  await database.ordenTrabajo.deleteMany({
    where: { id: { in: createdOrderIds } },
  });
  await database.material.update({
    where: { id: fixture.materialIds.active },
    data: { referenceCost: "25.00", isActive: true, deletedAt: null },
  });
  createdOrderIds.length = 0;
});

afterAll(async () => {
  await database.material.deleteMany({
    where: { id: { in: Object.values(fixture.materialIds) } },
  });
  await database.tecnico.deleteMany({
    where: { id: { in: Object.values(fixture.technicianIds) } },
  });
  await database.tipoServicio.delete({ where: { id: fixture.serviceTypeId } });
  await database.sucursalCliente.delete({ where: { id: fixture.branchId } });
  await database.cliente.delete({ where: { id: fixture.clientId } });
  await disconnectTestDatabase();
});

describe("orders operation repository transitions", () => {
  it("moves through all operational states with one version and one trail per transition", async () => {
    const repository = createOrdersOperationRepository(database);
    const primaryActor = actor(fixture.technicianIds.primary);
    const orderId = await createOperationOrder();

    expect(
      await repository.moveOnRoute(orderId, { version: 2 }, primaryActor, firstNow),
    ).toMatchObject({
      kind: "UPDATED",
      order: {
        status: "ON_ROUTE",
        version: 3,
        startedAt: null,
        endedAt: null,
        totalMinutes: null,
      },
    });
    expect(
      await repository.startOrder(orderId, { version: 3 }, primaryActor, secondNow),
    ).toMatchObject({
      kind: "UPDATED",
      order: { status: "IN_PROGRESS", version: 4, startedAt: secondNow },
    });
    expect(
      await repository.pauseOrder(
        orderId,
        { version: 4, comment: "Esperando acceso al cuarto técnico" },
        primaryActor,
        thirdNow,
      ),
    ).toMatchObject({
      kind: "UPDATED",
      order: { status: "PAUSED", version: 5, startedAt: secondNow },
    });
    expect(
      await repository.resumeOrder(orderId, { version: 5 }, primaryActor, fourthNow),
    ).toMatchObject({
      kind: "UPDATED",
      order: {
        status: "IN_PROGRESS",
        version: 6,
        startedAt: secondNow,
        endedAt: null,
        totalMinutes: null,
      },
    });

    const history = await database.historialOrden.findMany({
      where: { ordenId: orderId },
      orderBy: { occurredAt: "asc" },
      select: {
        action: true,
        previousStatus: true,
        newStatus: true,
        comment: true,
        metadata: true,
      },
    });
    expect(history).toEqual([
      {
        action: "ORDER_ON_ROUTE",
        previousStatus: "ASSIGNED",
        newStatus: "ON_ROUTE",
        comment: null,
        metadata: { version: 3 },
      },
      {
        action: "ORDER_STARTED",
        previousStatus: "ON_ROUTE",
        newStatus: "IN_PROGRESS",
        comment: null,
        metadata: { version: 4 },
      },
      {
        action: "ORDER_PAUSED",
        previousStatus: "IN_PROGRESS",
        newStatus: "PAUSED",
        comment: "Esperando acceso al cuarto técnico",
        metadata: { version: 5 },
      },
      {
        action: "ORDER_RESUMED",
        previousStatus: "PAUSED",
        newStatus: "IN_PROGRESS",
        comment: null,
        metadata: { version: 6 },
      },
    ]);
    const audits = await database.auditoria.findMany({
      where: { entity: "OrdenTrabajo", entityId: orderId },
      orderBy: { occurredAt: "asc" },
      select: { action: true, beforeData: true, afterData: true, reason: true },
    });
    expect(audits.map(({ action }) => action)).toEqual([
      "ORDER_ON_ROUTE",
      "ORDER_STARTED",
      "ORDER_PAUSED",
      "ORDER_RESUMED",
    ]);
    expect(audits.map(({ beforeData, afterData, reason }) => ({
      beforeStatus: (beforeData as { status: string }).status,
      afterStatus: (afterData as { status: string }).status,
      reason,
    }))).toEqual([
      { beforeStatus: "ASSIGNED", afterStatus: "ON_ROUTE", reason: null },
      { beforeStatus: "ON_ROUTE", afterStatus: "IN_PROGRESS", reason: null },
      {
        beforeStatus: "IN_PROGRESS",
        afterStatus: "PAUSED",
        reason: "Esperando acceso al cuarto técnico",
      },
      { beforeStatus: "PAUSED", afterStatus: "IN_PROGRESS", reason: null },
    ]);
  });

  it("starts an assigned remote order directly", async () => {
    const orderId = await createOperationOrder({
      primaryTechnicianId: fixture.technicianIds.remotePrimary,
    });
    const result = await createOrdersOperationRepository(database).startOrder(
      orderId,
      { version: 2 },
      actor(fixture.technicianIds.remotePrimary),
      firstNow,
    );

    expect(result).toMatchObject({
      kind: "UPDATED",
      order: { status: "IN_PROGRESS", version: 3, startedAt: firstNow },
    });
  });

  it("rejects invalid source states and stale versions without mutating", async () => {
    const orderId = await createOperationOrder({ status: "PENDING" });
    const repository = createOrdersOperationRepository(database);
    const primaryActor = actor(fixture.technicianIds.primary);

    await expect(
      repository.moveOnRoute(orderId, { version: 2 }, primaryActor, firstNow),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
    await expect(
      repository.startOrder(orderId, { version: 2 }, primaryActor, firstNow),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
    await expect(
      repository.pauseOrder(
        orderId,
        { version: 2, comment: "Estado inválido" },
        primaryActor,
        firstNow,
      ),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
    await expect(
      repository.resumeOrder(orderId, { version: 2 }, primaryActor, firstNow),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });

    const assignedId = await createOperationOrder();
    await expect(
      repository.startOrder(assignedId, { version: 1 }, primaryActor, firstNow),
    ).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    expect(
      await database.ordenTrabajo.findUniqueOrThrow({
        where: { id: assignedId },
        select: { status: true, version: true },
      }),
    ).toEqual({ status: "ASSIGNED", version: 2 });
  });

  it("requires an active primary owned by the actor", async () => {
    const repository = createOrdersOperationRepository(database);
    const noPrimaryId = await createOperationOrder({ primaryTechnicianId: null });
    await expect(
      repository.startOrder(
        noPrimaryId,
        { version: 2 },
        actor(fixture.technicianIds.primary),
        firstNow,
      ),
    ).resolves.toEqual({ kind: "PRIMARY_TECHNICIAN_REQUIRED" });

    const assignedId = await createOperationOrder({
      supportTechnicianId: fixture.technicianIds.support,
    });
    for (const unauthorizedActor of [
      actor(fixture.technicianIds.support),
      actor(fixture.technicianIds.unrelated),
      actor(null),
    ]) {
      await expect(
        repository.startOrder(
          assignedId,
          { version: 2 },
          unauthorizedActor,
          firstNow,
        ),
      ).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED" });
    }
  });

  it("completes an in-progress order as its active primary with gross server time", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
    });

    await expect(
      repository.completeOrder(
        orderId,
        {
          version: 4,
          diagnosis: "Conector principal dañado",
          result: "Conector reemplazado y enlace estable",
        },
        actor(fixture.technicianIds.primary),
        fourthNow,
      ),
    ).resolves.toMatchObject({
      kind: "UPDATED",
      order: {
        status: "COMPLETED",
        diagnosis: "Conector principal dañado",
        result: "Conector reemplazado y enlace estable",
        endedAt: fourthNow,
        totalMinutes: 90,
        version: 5,
      },
    });

    await expect(
      database.historialOrden.findMany({
        where: { ordenId: orderId },
        select: {
          action: true,
          previousStatus: true,
          newStatus: true,
          metadata: true,
        },
      }),
    ).resolves.toEqual([
      {
        action: "ORDER_COMPLETED",
        previousStatus: "IN_PROGRESS",
        newStatus: "COMPLETED",
        metadata: { version: 5 },
      },
    ]);
    await expect(
      database.auditoria.findMany({
        where: { entity: "OrdenTrabajo", entityId: orderId },
        select: { action: true, beforeData: true, afterData: true },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "ORDER_COMPLETED",
        beforeData: expect.objectContaining({ status: "IN_PROGRESS" }),
        afterData: expect.objectContaining({
          status: "COMPLETED",
          endedAt: fourthNow.toISOString(),
          totalMinutes: 90,
          version: 5,
        }),
      }),
    ]);
    await expect(
      repository.completeOrder(
        orderId,
        {
          version: 5,
          diagnosis: "No debe sobrescribir el diagnóstico final",
          result: "No debe sobrescribir el resultado final",
        },
        actor(fixture.technicianIds.primary),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
  });

  it("rejects completion without productive technician time", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
      withProductiveTime: false,
    });

    await expect(repository.completeOrder(
      orderId,
      { version: 4, diagnosis: "Diagnóstico válido", result: "Resultado válido" },
      actor(fixture.technicianIds.primary),
      fourthNow,
    )).resolves.toEqual({ kind: "ORDER_PRODUCTIVE_TIME_REQUIRED" });
    await expect(database.ordenTrabajo.findUniqueOrThrow({ where: { id: orderId } }))
      .resolves.toMatchObject({ status: "IN_PROGRESS", version: 4 });
  });

  it("rejects completion without the required owned in-progress work", async () => {
    const repository = createOrdersOperationRepository(database);
    const activeId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
      supportTechnicianId: fixture.technicianIds.support,
    });

    for (const unauthorizedActor of [
      actor(fixture.technicianIds.support),
      actor(fixture.technicianIds.unrelated),
      actor(null),
    ]) {
      await expect(
        repository.completeOrder(
          activeId,
          {
            version: 4,
            diagnosis: "Diagnóstico confirmado",
            result: "Trabajo finalizado correctamente",
          },
          unauthorizedActor,
          fourthNow,
        ),
      ).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED" });
    }

    const pendingId = await createOperationOrder({ status: "PENDING", version: 4 });
    await expect(
      repository.completeOrder(
        pendingId,
        {
          version: 4,
          diagnosis: "Diagnóstico confirmado",
          result: "Trabajo finalizado correctamente",
        },
        actor(fixture.technicianIds.primary),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });

    const noPrimaryId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      primaryTechnicianId: null,
      startedAt: firstNow,
    });
    await expect(
      repository.completeOrder(
        noPrimaryId,
        {
          version: 4,
          diagnosis: "Diagnóstico confirmado",
          result: "Trabajo finalizado correctamente",
        },
        actor(fixture.technicianIds.primary),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "PRIMARY_TECHNICIAN_REQUIRED" });

    const missingStartId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: null,
    });
    await expect(
      repository.completeOrder(
        missingStartId,
        {
          version: 4,
          diagnosis: "Diagnóstico confirmado",
          result: "Trabajo finalizado correctamente",
        },
        actor(fixture.technicianIds.primary),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });

    await expect(
      repository.completeOrder(
        activeId,
        {
          version: 3,
          diagnosis: "Diagnóstico confirmado",
          result: "Trabajo finalizado correctamente",
        },
        actor(fixture.technicianIds.primary),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "VERSION_CONFLICT" });
  });

  it("cancels each open state administratively and preserves the applicable time fields", async () => {
    const repository = createOrdersOperationRepository(database);
    const administrativeActors = [
      { ...actor(null), permissions: ["orders:manage"] },
      { ...actor(null), permissions: ["orders:supervise"] },
    ];
    const openOrders = await Promise.all([
      createOperationOrder({ status: "PENDING", primaryTechnicianId: null }),
      createOperationOrder({ status: "ASSIGNED" }),
      createOperationOrder({ status: "ON_ROUTE" }),
      createOperationOrder({
        status: "IN_PROGRESS",
        startedAt: firstNow,
      }),
      createOperationOrder({ status: "PAUSED", startedAt: firstNow }),
    ]);

    for (const [index, orderId] of openOrders.entries()) {
      await expect(
        repository.cancelOrder(
          orderId,
          { version: 2, cancellationReason: "Solicitud administrativa confirmada" },
          administrativeActors[index % administrativeActors.length]!,
          fourthNow,
        ),
      ).resolves.toMatchObject({
        kind: "UPDATED",
        order: {
          status: "CANCELLED",
          cancellationReason: "Solicitud administrativa confirmada",
          version: 3,
        },
      });
    }

    await expect(
      database.ordenTrabajo.findMany({
        where: { id: { in: openOrders } },
        select: { id: true, startedAt: true, endedAt: true, totalMinutes: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: openOrders[0],
          startedAt: null,
          endedAt: null,
          totalMinutes: null,
        }),
        expect.objectContaining({
          id: openOrders[1],
          startedAt: null,
          endedAt: null,
          totalMinutes: null,
        }),
        expect.objectContaining({
          id: openOrders[2],
          startedAt: null,
          endedAt: null,
          totalMinutes: null,
        }),
        expect.objectContaining({
          id: openOrders[3],
          startedAt: firstNow,
          endedAt: fourthNow,
          totalMinutes: 90,
        }),
        expect.objectContaining({
          id: openOrders[4],
          startedAt: firstNow,
          endedAt: fourthNow,
          totalMinutes: 90,
        }),
      ]),
    );
    await expect(
      database.historialOrden.count({
        where: { ordenId: { in: openOrders }, action: "ORDER_CANCELLED" },
      }),
    ).resolves.toBe(5);
    await expect(
      database.auditoria.count({
        where: {
          entity: "OrdenTrabajo",
          entityId: { in: openOrders },
          action: "ORDER_CANCELLED",
        },
      }),
    ).resolves.toBe(5);
  });

  it("rejects terminal, stale, and invalid cancellation commands without mutating", async () => {
    const repository = createOrdersOperationRepository(database);
    const administrativeActor = { ...actor(null), permissions: ["orders:manage"] };
    const completedId = await createOperationOrder({
      status: "COMPLETED",
      version: 3,
      startedAt: firstNow,
    });
    const cancelledId = await createOperationOrder({ status: "CANCELLED", version: 3 });
    const assignedId = await createOperationOrder({ status: "ASSIGNED", version: 2 });

    for (const orderId of [completedId, cancelledId]) {
      await expect(
        repository.cancelOrder(
          orderId,
          { version: 3, cancellationReason: "Solicitud administrativa confirmada" },
          administrativeActor,
          fourthNow,
        ),
      ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
    }
    await expect(
      repository.cancelOrder(
        assignedId,
        { version: 1, cancellationReason: "Solicitud administrativa confirmada" },
        administrativeActor,
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: assignedId },
        select: { status: true, version: true, endedAt: true, totalMinutes: true },
      }),
    ).resolves.toEqual({
      status: "ASSIGNED",
      version: 2,
      endedAt: null,
      totalMinutes: null,
    });
  });

  it("rolls completion status, timing, history, and audit back when its audit fails", async () => {
    const orderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
    });
    const before = await database.ordenTrabajo.findUniqueOrThrow({
      where: { id: orderId },
      select: { updatedAt: true },
    });
    const invalidAuditActor = {
      ...actor(fixture.technicianIds.primary),
      userAgent: "x".repeat(501),
    };

    await expect(
      createOrdersOperationRepository(database).completeOrder(
        orderId,
        {
          version: 4,
          diagnosis: "Conector principal dañado",
          result: "Conector reemplazado y enlace estable",
        },
        invalidAuditActor,
        fourthNow,
      ),
    ).rejects.toThrow();
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          status: true,
          version: true,
          endedAt: true,
          totalMinutes: true,
          diagnosis: true,
          result: true,
          updatedAt: true,
        },
      }),
    ).resolves.toEqual({
      status: "IN_PROGRESS",
      version: 4,
      endedAt: null,
      totalMinutes: null,
      diagnosis: null,
      result: null,
      updatedAt: before.updatedAt,
    });
    await expect(
      database.historialOrden.count({ where: { ordenId: orderId } }),
    ).resolves.toBe(0);
    await expect(
      database.auditoria.count({
        where: { entity: "OrdenTrabajo", entityId: orderId },
      }),
    ).resolves.toBe(0);
  });

  it("rolls cancellation status, timing, history, and audit back when its audit fails", async () => {
    const orderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
    });
    const before = await database.ordenTrabajo.findUniqueOrThrow({
      where: { id: orderId },
      select: { updatedAt: true },
    });
    const invalidAuditActor = {
      ...actor(null),
      permissions: ["orders:manage"],
      userAgent: "x".repeat(501),
    };

    await expect(
      createOrdersOperationRepository(database).cancelOrder(
        orderId,
        { version: 4, cancellationReason: "Solicitud administrativa confirmada" },
        invalidAuditActor,
        fourthNow,
      ),
    ).rejects.toThrow();
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          status: true,
          version: true,
          endedAt: true,
          totalMinutes: true,
          cancellationReason: true,
          updatedAt: true,
        },
      }),
    ).resolves.toEqual({
      status: "IN_PROGRESS",
      version: 4,
      endedAt: null,
      totalMinutes: null,
      cancellationReason: null,
      updatedAt: before.updatedAt,
    });
    await expect(
      database.historialOrden.count({ where: { ordenId: orderId } }),
    ).resolves.toBe(0);
    await expect(
      database.auditoria.count({
        where: { entity: "OrdenTrabajo", entityId: orderId },
      }),
    ).resolves.toBe(0);
  });

  it("rolls status, version, history, and audit back together", async () => {
    const orderId = await createOperationOrder();
    const invalidAuditActor = {
      ...actor(fixture.technicianIds.primary),
      userAgent: "x".repeat(501),
    };

    await expect(
      createOrdersOperationRepository(database).startOrder(
        orderId,
        { version: 2 },
        invalidAuditActor,
        firstNow,
      ),
    ).rejects.toThrow();
    expect(
      await database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, version: true, startedAt: true },
      }),
    ).toEqual({ status: "ASSIGNED", version: 2, startedAt: null });
    expect(
      await database.historialOrden.count({ where: { ordenId: orderId } }),
    ).toBe(0);
    expect(
      await database.auditoria.count({
        where: { entity: "OrdenTrabajo", entityId: orderId },
      }),
    ).toBe(0);
  });
});

describe("orders operation repository closed adjustments", () => {
  it("adjusts a completed order once, derives gross time, and records the reason", async () => {
    const repository = createOrdersOperationRepository(database);
    const originalStart = new Date("2026-08-01T12:00:00.000Z");
    const originalEnd = new Date("2026-08-01T13:30:00.000Z");
    const adjustedStart = new Date("2026-08-01T14:00:00.000Z");
    const adjustedEnd = new Date("2026-08-01T15:45:00.000Z");
    const reason = "Corrección confirmada por supervisión";
    const orderId = await createOperationOrder({
      status: "COMPLETED",
      version: 5,
      startedAt: originalStart,
      endedAt: originalEnd,
    });

    await expect(
      repository.adjustClosedOrder(
        orderId,
        {
          version: 5,
          reason,
          description: "Trabajo documentado después de la visita",
          startedAt: adjustedStart,
          endedAt: adjustedEnd,
          diagnosis: "Diagnóstico corregido",
          result: "Resultado corregido",
          estimatedMinutes: 120,
        },
        actor(null),
        fourthNow,
      ),
    ).resolves.toMatchObject({
      kind: "UPDATED",
      order: {
        status: "COMPLETED",
        description: "Trabajo documentado después de la visita",
        startedAt: adjustedStart,
        endedAt: adjustedEnd,
        totalMinutes: 105,
        version: 6,
      },
    });

    await expect(
      database.historialOrden.findMany({
        where: { ordenId: orderId },
        select: {
          action: true,
          previousStatus: true,
          newStatus: true,
          comment: true,
          metadata: true,
        },
      }),
    ).resolves.toEqual([
      {
        action: "ORDER_ADJUSTED",
        previousStatus: "COMPLETED",
        newStatus: "COMPLETED",
        comment: reason,
        metadata: {
          version: 6,
          changedFields: [
            "description",
            "startedAt",
            "endedAt",
            "diagnosis",
            "result",
            "estimatedMinutes",
          ],
          before: {
            description: null,
            scheduledFor: null,
            startedAt: originalStart.toISOString(),
            endedAt: originalEnd.toISOString(),
            diagnosis: null,
            result: null,
            cancellationReason: null,
            estimatedMinutes: null,
            totalMinutes: null,
          },
          after: {
            description: "Trabajo documentado después de la visita",
            scheduledFor: null,
            startedAt: adjustedStart.toISOString(),
            endedAt: adjustedEnd.toISOString(),
            diagnosis: "Diagnóstico corregido",
            result: "Resultado corregido",
            cancellationReason: null,
            estimatedMinutes: 120,
            totalMinutes: 105,
          },
        },
      },
    ]);
    await expect(
      database.auditoria.findMany({
        where: { entity: "OrdenTrabajo", entityId: orderId },
        select: { action: true, reason: true, beforeData: true, afterData: true },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "ORDER_ADJUSTED",
        reason,
        beforeData: expect.objectContaining({
          status: "COMPLETED",
          startedAt: originalStart.toISOString(),
          endedAt: originalEnd.toISOString(),
          version: 5,
        }),
        afterData: expect.objectContaining({
          status: "COMPLETED",
          startedAt: adjustedStart.toISOString(),
          endedAt: adjustedEnd.toISOString(),
          totalMinutes: 105,
          version: 6,
        }),
      }),
    ]);
  });

  it("keeps null timing on a cancelled order while applying allowed corrections", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "CANCELLED",
      version: 5,
      primaryTechnicianId: null,
    });

    await expect(
      repository.adjustClosedOrder(
        orderId,
        {
          version: 5,
          reason: "Corrección administrativa confirmada",
          cancellationReason: "Cliente solicitó reprogramar la intervención",
        },
        actor(null),
        fourthNow,
      ),
    ).resolves.toMatchObject({
      kind: "UPDATED",
      order: {
        status: "CANCELLED",
        cancellationReason: "Cliente solicitó reprogramar la intervención",
        startedAt: null,
        endedAt: null,
        totalMinutes: null,
        version: 6,
      },
    });
  });

  it("rejects stale, open, and inverted closed-order adjustments without mutation", async () => {
    const repository = createOrdersOperationRepository(database);
    const completedId = await createOperationOrder({
      status: "COMPLETED",
      version: 5,
      startedAt: firstNow,
      endedAt: fourthNow,
    });
    const openId = await createOperationOrder({ status: "IN_PROGRESS", version: 5 });
    const baseInput = { reason: "Corrección confirmada por supervisión" };

    await expect(
      repository.adjustClosedOrder(
        completedId,
        { ...baseInput, version: 4, description: "No debe persistir" },
        actor(null),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    await expect(
      repository.adjustClosedOrder(
        openId,
        { ...baseInput, version: 5, description: "No debe persistir" },
        actor(null),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
    await expect(
      repository.adjustClosedOrder(
        completedId,
        {
          ...baseInput,
          version: 5,
          startedAt: fourthNow,
          endedAt: firstNow,
        },
        actor(null),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "INVALID_TEMPORAL_RANGE" });
    await expect(
      repository.adjustClosedOrder(
        completedId,
        {
          ...baseInput,
          version: 5,
          startedAt: new Date("2026-08-01T14:00:00.000Z"),
        },
        actor(null),
        fourthNow,
      ),
    ).resolves.toEqual({ kind: "INVALID_TEMPORAL_RANGE" });

    await expect(
      database.ordenTrabajo.findMany({
        where: { id: { in: [completedId, openId] } },
        select: { id: true, status: true, version: true, startedAt: true, endedAt: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          id: completedId,
          status: "COMPLETED",
          version: 5,
          startedAt: firstNow,
          endedAt: fourthNow,
        },
        {
          id: openId,
          status: "IN_PROGRESS",
          version: 5,
          startedAt: null,
          endedAt: null,
        },
      ]),
    );
    await expect(
      database.historialOrden.count({ where: { ordenId: { in: [completedId, openId] } } }),
    ).resolves.toBe(0);
    await expect(
      database.auditoria.count({
        where: {
          entity: "OrdenTrabajo",
          entityId: { in: [completedId, openId] },
        },
      }),
    ).resolves.toBe(0);
  });

  it("ignores fields outside the closed-adjustment allowlist", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "COMPLETED",
      version: 5,
      startedAt: firstNow,
      endedAt: fourthNow,
    });
    const before = await database.ordenTrabajo.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        orderNumber: true,
        sucursalId: true,
        tipoServicioId: true,
        priority: true,
        status: true,
      },
    });

    await expect(
      repository.adjustClosedOrder(
        orderId,
        {
          version: 5,
          reason: "Corrección confirmada por supervisión",
          description: "Solo este campo puede cambiar",
          status: "CANCELLED",
          orderNumber: "OP-MALICIOSA",
          branchId: randomUUID(),
          serviceTypeId: randomUUID(),
          priority: "LOW",
          reportedProblem: "No debe filtrarse al historial",
          totalMinutes: 999,
          passwordHash: "no-debe-filtrarse",
          assignments: [],
          materials: [],
        } as never,
        actor(null),
        fourthNow,
      ),
    ).resolves.toMatchObject({
      kind: "UPDATED",
      order: { status: "COMPLETED", version: 6 },
    });
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          orderNumber: true,
          sucursalId: true,
          tipoServicioId: true,
          priority: true,
          status: true,
        },
      }),
    ).resolves.toEqual(before);
    const history = await database.historialOrden.findFirstOrThrow({
      where: { ordenId: orderId, action: "ORDER_ADJUSTED" },
      select: { metadata: true },
    });
    expect(Object.keys(history.metadata as object).sort()).toEqual([
      "after",
      "before",
      "changedFields",
      "version",
    ]);
    expect(JSON.stringify(history.metadata)).not.toContain("reportedProblem");
    expect(JSON.stringify(history.metadata)).not.toContain("passwordHash");
  });

  it("rolls the closed-order update and history back when its audit fails", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "COMPLETED",
      version: 5,
      startedAt: firstNow,
      endedAt: fourthNow,
    });
    const before = await database.ordenTrabajo.findUniqueOrThrow({
      where: { id: orderId },
      select: { description: true, version: true, totalMinutes: true, updatedAt: true },
    });

    await expect(
      repository.adjustClosedOrder(
        orderId,
        {
          version: 5,
          reason: "Corrección confirmada por supervisión",
          description: "No debe persistir si la auditoría falla",
        },
        { ...actor(null), userAgent: "x".repeat(501) },
        fourthNow,
      ),
    ).rejects.toThrow();
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: { description: true, version: true, totalMinutes: true, updatedAt: true },
      }),
    ).resolves.toEqual(before);
    await expect(
      database.historialOrden.count({ where: { ordenId: orderId } }),
    ).resolves.toBe(0);
    await expect(
      database.auditoria.count({
        where: { entity: "OrdenTrabajo", entityId: orderId },
      }),
    ).resolves.toBe(0);
  });
});

describe("orders operation repository materials", () => {
  it("adds materials in active work states for managers and the active primary", async () => {
    const repository = createOrdersOperationRepository(database);
    const eligibleActors = [
      {
        label: "ADMIN",
        value: { ...actor(null), permissions: ["ORDERS_MANAGE"] },
      },
      {
        label: "SUPERVISOR",
        value: { ...actor(null), permissions: ["ORDERS_MANAGE"] },
      },
      {
        label: "PRIMARY",
        value: actor(fixture.technicianIds.primary),
      },
    ];

    for (const status of ["IN_PROGRESS", "PAUSED"] as const) {
      for (const eligibleActor of eligibleActors) {
        const orderId = await createOperationOrder({
          status,
          version: 4,
          startedAt: firstNow,
        });
        const result = await repository.addOrderMaterial(
          orderId,
          {
            version: 4,
            materialId: fixture.materialIds.active,
            quantity: "12.500",
            observation: `${eligibleActor.label} ${status}`,
          },
          eligibleActor.value,
          secondNow,
        );

        expect(result.kind).toBe("UPDATED");
        if (result.kind !== "UPDATED") continue;
        expect(result.order).toMatchObject({ status, version: 5 });
        expect(result.order.materiales).toHaveLength(1);
        expect(result.order.materiales[0]?.quantity.toFixed(3)).toBe("12.500");
        expect(
          result.order.materiales[0]?.historicalUnitCost.toFixed(2),
        ).toBe("25.00");
        await expect(
          database.historialOrden.count({
            where: { ordenId: orderId, action: "ORDER_MATERIAL_ADDED" },
          }),
        ).resolves.toBe(1);
        await expect(
          database.auditoria.count({
            where: {
              entity: "OrdenTrabajo",
              entityId: orderId,
              action: "ORDER_MATERIAL_ADDED",
            },
          }),
        ).resolves.toBe(1);
      }
    }
  });

  it("updates and removes a nested usage without changing its historical cost", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
    });
    const primaryActor = actor(fixture.technicianIds.primary);
    const added = await repository.addOrderMaterial(
      orderId,
      {
        version: 4,
        materialId: fixture.materialIds.active,
        quantity: "1.250",
        observation: "Cable del enlace",
      },
      primaryActor,
      firstNow,
    );
    expect(added.kind).toBe("UPDATED");
    if (added.kind !== "UPDATED") return;
    const usageId = added.order.materiales[0]!.id;

    await database.material.update({
      where: { id: fixture.materialIds.active },
      data: { referenceCost: "40.00" },
    });
    const updated = await repository.updateOrderMaterial(
      orderId,
      usageId,
      { version: 5, quantity: "3.750", observation: null },
      primaryActor,
      secondNow,
    );
    expect(updated.kind).toBe("UPDATED");
    if (updated.kind !== "UPDATED") return;
    expect(updated.order.version).toBe(6);
    expect(updated.order.materiales[0]?.quantity.toFixed(3)).toBe("3.750");
    expect(updated.order.materiales[0]?.historicalUnitCost.toFixed(2)).toBe(
      "25.00",
    );
    expect(updated.order.materiales[0]?.observation).toBeNull();

    const removed = await repository.removeOrderMaterial(
      orderId,
      usageId,
      { version: 6 },
      primaryActor,
      thirdNow,
    );
    expect(removed).toMatchObject({
      kind: "UPDATED",
      order: { version: 7, materiales: [] },
    });
    await expect(
      database.historialOrden.findMany({
        where: { ordenId: orderId },
        select: { action: true, metadata: true },
        orderBy: { occurredAt: "asc" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ action: "ORDER_MATERIAL_ADDED" }),
      expect.objectContaining({ action: "ORDER_MATERIAL_UPDATED" }),
      expect.objectContaining({
        action: "ORDER_MATERIAL_REMOVED",
        metadata: expect.objectContaining({
          materialUsage: expect.objectContaining({
            id: usageId,
            quantity: "3.750",
            historicalUnitCost: "25.00",
          }),
        }),
      }),
    ]);
    await expect(
      database.auditoria.findFirstOrThrow({
        where: {
          entityId: orderId,
          action: "ORDER_MATERIAL_REMOVED",
        },
        select: { beforeData: true, afterData: true },
      }),
    ).resolves.toEqual({
      beforeData: expect.objectContaining({
        materialUsage: expect.objectContaining({ id: usageId }),
      }),
      afterData: expect.objectContaining({ materialUsage: null }),
    });
  });

  it("rejects support, unrelated, and permissionless technicians transactionally", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      supportTechnicianId: fixture.technicianIds.support,
      startedAt: firstNow,
    });
    const unauthorizedActors = [
      actor(fixture.technicianIds.support),
      actor(fixture.technicianIds.unrelated),
      { ...actor(fixture.technicianIds.primary), permissions: [] },
    ];

    for (const unauthorizedActor of unauthorizedActors) {
      await expect(
        repository.addOrderMaterial(
          orderId,
          {
            version: 4,
            materialId: fixture.materialIds.active,
            quantity: "1.000",
          },
          unauthorizedActor,
          secondNow,
        ),
      ).resolves.toEqual({ kind: "TECHNICIAN_NOT_ASSIGNED" });
    }
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: { version: true },
      }),
    ).resolves.toEqual({ version: 4 });
    await expect(
      database.materialUtilizado.count({ where: { ordenId: orderId } }),
    ).resolves.toBe(0);
  });

  it("allows material changes only while in progress or paused", async () => {
    const repository = createOrdersOperationRepository(database);
    const manager = { ...actor(null), permissions: ["ORDERS_MANAGE"] };
    for (const status of ["PENDING", "ASSIGNED", "ON_ROUTE"] as const) {
      const orderId = await createOperationOrder({ status, version: 4 });
      await expect(
        repository.addOrderMaterial(
          orderId,
          {
            version: 4,
            materialId: fixture.materialIds.active,
            quantity: "1.000",
          },
          manager,
          secondNow,
        ),
      ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
    }
    for (const status of ["COMPLETED", "CANCELLED"] as const) {
      const orderId = await createOperationOrder({ status, version: 4 });
      await expect(
        repository.addOrderMaterial(
          orderId,
          {
            version: 4,
            materialId: fixture.materialIds.active,
            quantity: "1.000",
          },
          manager,
          secondNow,
        ),
      ).resolves.toEqual({ kind: "ORDER_CLOSED" });
    }
  });

  it("rejects unavailable material resources without changing the order", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "PAUSED",
      version: 4,
      startedAt: firstNow,
    });
    const manager = { ...actor(null), permissions: ["ORDERS_MANAGE"] };
    const cases = [
      [randomUUID(), "MATERIAL_NOT_FOUND"],
      [fixture.materialIds.inactive, "RESOURCE_INACTIVE"],
      [fixture.materialIds.deleted, "RESOURCE_INACTIVE"],
      [fixture.materialIds.withoutCost, "MATERIAL_COST_UNAVAILABLE"],
    ] as const;

    for (const [materialId, kind] of cases) {
      await expect(
        repository.addOrderMaterial(
          orderId,
          { version: 4, materialId, quantity: "1.000" },
          manager,
          secondNow,
        ),
      ).resolves.toEqual({ kind });
    }
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: { version: true },
      }),
    ).resolves.toEqual({ version: 4 });
  });

  it("returns a safe nested not-found and rejects stale material commands", async () => {
    const repository = createOrdersOperationRepository(database);
    const firstOrderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
    });
    const secondOrderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
    });
    const foreignUsage = await database.materialUtilizado.create({
      data: {
        ordenId: secondOrderId,
        materialId: fixture.materialIds.active,
        quantity: "2.000",
        historicalUnitCost: "25.00",
      },
      select: { id: true },
    });
    const manager = { ...actor(null), permissions: ["ORDERS_MANAGE"] };

    await expect(
      repository.updateOrderMaterial(
        firstOrderId,
        foreignUsage.id,
        { version: 4, quantity: "5.000" },
        manager,
        secondNow,
      ),
    ).resolves.toEqual({ kind: "MATERIAL_USAGE_NOT_FOUND" });
    await expect(
      repository.removeOrderMaterial(
        firstOrderId,
        foreignUsage.id,
        { version: 4 },
        manager,
        secondNow,
      ),
    ).resolves.toEqual({ kind: "MATERIAL_USAGE_NOT_FOUND" });
    await expect(
      repository.addOrderMaterial(
        firstOrderId,
        {
          version: 3,
          materialId: fixture.materialIds.active,
          quantity: "1.000",
        },
        manager,
        secondNow,
      ),
    ).resolves.toEqual({ kind: "VERSION_CONFLICT" });
    const preservedForeignUsage =
      await database.materialUtilizado.findUniqueOrThrow({
        where: { id: foreignUsage.id },
        select: { quantity: true },
      });
    expect(preservedForeignUsage.quantity.toFixed(3)).toBe("2.000");
  });

  it("rolls usage, order version, history, and audit back together", async () => {
    const repository = createOrdersOperationRepository(database);
    const orderId = await createOperationOrder({
      status: "IN_PROGRESS",
      version: 4,
      startedAt: firstNow,
    });
    const invalidAuditActor = {
      ...actor(fixture.technicianIds.primary),
      userAgent: "x".repeat(501),
    };

    await expect(
      repository.addOrderMaterial(
        orderId,
        {
          version: 4,
          materialId: fixture.materialIds.active,
          quantity: "1.000",
        },
        invalidAuditActor,
        secondNow,
      ),
    ).rejects.toThrow();
    await expect(
      database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: { version: true },
      }),
    ).resolves.toEqual({ version: 4 });
    await expect(
      database.materialUtilizado.count({ where: { ordenId: orderId } }),
    ).resolves.toBe(0);
    await expect(
      database.historialOrden.count({ where: { ordenId: orderId } }),
    ).resolves.toBe(0);
    await expect(
      database.auditoria.count({
        where: { entity: "OrdenTrabajo", entityId: orderId },
      }),
    ).resolves.toBe(0);
  });
});

describe("orders operation repository technician overlap", () => {
  it("lets a pause release the technician and blocks the old order from resuming", async () => {
    const repository = createOrdersOperationRepository(database);
    const primaryActor = actor(fixture.technicianIds.primary);
    const firstId = await createOperationOrder();
    const secondId = await createOperationOrder();

    expect(
      await repository.startOrder(firstId, { version: 2 }, primaryActor, firstNow),
    ).toMatchObject({ kind: "UPDATED" });
    await expect(
      repository.startOrder(secondId, { version: 2 }, primaryActor, secondNow),
    ).resolves.toEqual({ kind: "TECHNICIAN_BUSY" });
    expect(
      await repository.pauseOrder(
        firstId,
        { version: 3, comment: "Esperando repuesto" },
        primaryActor,
        secondNow,
      ),
    ).toMatchObject({ kind: "UPDATED", order: { status: "PAUSED", version: 4 } });
    expect(
      await repository.startOrder(secondId, { version: 2 }, primaryActor, thirdNow),
    ).toMatchObject({ kind: "UPDATED", order: { status: "IN_PROGRESS" } });
    await expect(
      repository.resumeOrder(firstId, { version: 4 }, primaryActor, fourthNow),
    ).resolves.toEqual({ kind: "TECHNICIAN_BUSY" });
  });

  it("prevents every ON_ROUTE and IN_PROGRESS overlap", async () => {
    const repository = createOrdersOperationRepository(database);
    const primaryActor = actor(fixture.technicianIds.primary);
    const onRouteId = await createOperationOrder();
    const otherId = await createOperationOrder();

    expect(
      await repository.moveOnRoute(onRouteId, { version: 2 }, primaryActor, firstNow),
    ).toMatchObject({ kind: "UPDATED", order: { status: "ON_ROUTE" } });
    await expect(
      repository.moveOnRoute(otherId, { version: 2 }, primaryActor, secondNow),
    ).resolves.toEqual({ kind: "TECHNICIAN_BUSY" });
    await expect(
      repository.startOrder(otherId, { version: 2 }, primaryActor, secondNow),
    ).resolves.toEqual({ kind: "TECHNICIAN_BUSY" });
  });

  it("allows only one of two concurrent starts for the same primary", async () => {
    const otherDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const blockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const firstId = await createOperationOrder();
    const secondId = await createOperationOrder();
    const primaryActor = actor(fixture.technicianIds.primary);
    let pendingStarts: Promise<OrderMutationResult[]> | undefined;
    try {
      await Promise.all([
        database.$queryRaw`SELECT 1`,
        otherDatabase.$queryRaw`SELECT 1`,
        blockerDatabase.$queryRaw`SELECT 1`,
      ]);
      const waiters = await blockerDatabase.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${fixture.technicianIds.primary}, 0)
            )
          `;
          const blockerRows = await transaction.$queryRaw<Array<{ pid: number }>>`
            SELECT pg_backend_pid() AS "pid"
          `;
          const blockerPid = blockerRows[0]?.pid;
          if (blockerPid === undefined) {
            throw new Error("Advisory blocker backend was not available");
          }
          pendingStarts = Promise.all([
            createOrdersOperationRepository(database).startOrder(
              firstId,
              { version: 2 },
              primaryActor,
              firstNow,
            ),
            createOrdersOperationRepository(otherDatabase).startOrder(
              secondId,
              { version: 2 },
              primaryActor,
              firstNow,
            ),
          ]);
          return waitForOperationalLockWindow(transaction, blockerPid);
        },
        { timeout: 10_000 },
      );
      expect(waiters).toMatchObject({
        advisoryWaiters: 1,
        technicianWaiters: 1,
      });
      if (!pendingStarts) throw new Error("Concurrent starts were not scheduled");
      const results = await pendingStarts;

      expect(results.map(({ kind }) => kind).sort()).toEqual([
        "TECHNICIAN_BUSY",
        "UPDATED",
      ]);
      expect(
        await database.ordenTrabajo.count({
          where: {
            id: { in: [firstId, secondId] },
            status: { in: ["ON_ROUTE", "IN_PROGRESS"] },
          },
        }),
      ).toBe(1);
    } catch (error) {
      if (pendingStarts) await Promise.allSettled([pendingStarts]);
      throw error;
    } finally {
      await Promise.all([
        otherDatabase.$disconnect(),
        blockerDatabase.$disconnect(),
      ]);
    }
  });
});
