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
}

interface CreateOperationOrderOptions {
  status?: "PENDING" | "ASSIGNED" | "ON_ROUTE" | "IN_PROGRESS" | "PAUSED";
  version?: number;
  primaryTechnicianId?: string | null;
  supportTechnicianId?: string;
  startedAt?: Date | null;
}

let fixture: OperationFixture;
const createdOrderIds: string[] = [];

function actor(technicianId: string | null): OrderActorContext {
  return {
    userId: fixture.userId,
    technicianId,
    permissions: ["orders:operate"],
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
});

afterEach(async () => {
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
  createdOrderIds.length = 0;
});

afterAll(async () => {
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
