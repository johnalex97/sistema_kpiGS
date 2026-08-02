import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createDatabaseClient } from "../../src/config/database.js";
import { createOrdersMutationRepository } from "../../src/orders/orders.mutation.repository.js";
import { updateOrderSchema } from "../../src/orders/orders.schemas.js";
import type {
  CreateOrderInput,
  OrderActorContext,
  UpdateOrderInput,
} from "../../src/orders/orders.types.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

const now = new Date("2026-08-01T12:00:00.000Z");
const annualNumberLockNamespace = 1_196_575_044;

async function waitForAnnualNumberWaiters(
  expected: number,
  year: number,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await database.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT COUNT(*) AS "waiting"
      FROM "pg_locks"
      WHERE "locktype" = 'advisory'
        AND "granted" = false
        AND "classid"::bigint = ${annualNumberLockNamespace}
        AND "objid"::bigint = ${year}
    `;
    if (Number(rows[0]?.waiting ?? 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${expected} annual-number lock waiters`);
}

interface CreationFixture {
  clientIds: string[];
  branchIds: string[];
  serviceTypeIds: string[];
  activeBranchId: string;
  otherActiveBranchId: string;
  inactiveBranchId: string;
  deletedBranchId: string;
  inactiveClientBranchId: string;
  deletedClientBranchId: string;
  activeServiceTypeId: string;
  otherActiveServiceTypeId: string;
  inactiveServiceTypeId: string;
  deletedServiceTypeId: string;
  actor: OrderActorContext;
}

function creationInput(
  fixture: CreationFixture,
  overrides: Partial<CreateOrderInput> = {},
): CreateOrderInput {
  return {
    branchId: fixture.activeBranchId,
    serviceTypeId: fixture.activeServiceTypeId,
    priority: "HIGH",
    reportedProblem: `Problema de creación ${randomUUID()}`,
    description: "Detalle administrativo",
    scheduledFor: new Date("2026-08-02T15:00:00.000Z"),
    estimatedMinutes: 90,
    ...overrides,
  };
}

async function createCreationFixture(): Promise<CreationFixture> {
  const suffix = randomUUID().slice(0, 8);
  const activeClientId = randomUUID();
  const inactiveClientId = randomUUID();
  const deletedClientId = randomUUID();
  const activeBranchId = randomUUID();
  const otherActiveBranchId = randomUUID();
  const inactiveBranchId = randomUUID();
  const deletedBranchId = randomUUID();
  const inactiveClientBranchId = randomUUID();
  const deletedClientBranchId = randomUUID();
  const activeServiceTypeId = randomUUID();
  const otherActiveServiceTypeId = randomUUID();
  const inactiveServiceTypeId = randomUUID();
  const deletedServiceTypeId = randomUUID();
  const user = await database.usuario.findUniqueOrThrow({
    where: { email: "admin.demo@geeksolution.example.test" },
    select: { id: true },
  });

  await database.cliente.createMany({
    data: [
      { id: activeClientId, code: `MUT-A-${suffix}`, tradeName: `Activo ${suffix}` },
      {
        id: inactiveClientId,
        code: `MUT-I-${suffix}`,
        tradeName: `Inactivo ${suffix}`,
        isActive: false,
      },
      {
        id: deletedClientId,
        code: `MUT-D-${suffix}`,
        tradeName: `Eliminado ${suffix}`,
        deletedAt: now,
      },
    ],
  });
  await database.sucursalCliente.createMany({
    data: [
      {
        id: activeBranchId,
        clienteId: activeClientId,
        code: "ACTIVE",
        name: `Sucursal activa ${suffix}`,
        address: "Centro",
      },
      {
        id: inactiveBranchId,
        clienteId: activeClientId,
        code: "INACTIVE",
        name: `Sucursal inactiva ${suffix}`,
        address: "Centro",
        isActive: false,
      },
      {
        id: otherActiveBranchId,
        clienteId: activeClientId,
        code: "OTHER-ACTIVE",
        name: `Otra sucursal activa ${suffix}`,
        address: "Centro",
      },
      {
        id: deletedBranchId,
        clienteId: activeClientId,
        code: "DELETED",
        name: `Sucursal eliminada ${suffix}`,
        address: "Centro",
        deletedAt: now,
      },
      {
        id: inactiveClientBranchId,
        clienteId: inactiveClientId,
        code: "CLIENT-INACTIVE",
        name: `Cliente inactivo ${suffix}`,
        address: "Centro",
      },
      {
        id: deletedClientBranchId,
        clienteId: deletedClientId,
        code: "CLIENT-DELETED",
        name: `Cliente eliminado ${suffix}`,
        address: "Centro",
      },
    ],
  });
  await database.tipoServicio.createMany({
    data: [
      {
        id: activeServiceTypeId,
        code: `MUT-A-${suffix}`,
        name: `Servicio activo ${suffix}`,
      },
      {
        id: inactiveServiceTypeId,
        code: `MUT-I-${suffix}`,
        name: `Servicio inactivo ${suffix}`,
        isActive: false,
      },
      {
        id: otherActiveServiceTypeId,
        code: `MUT-O-${suffix}`,
        name: `Otro servicio activo ${suffix}`,
      },
      {
        id: deletedServiceTypeId,
        code: `MUT-D-${suffix}`,
        name: `Servicio eliminado ${suffix}`,
        deletedAt: now,
      },
    ],
  });

  return {
    clientIds: [activeClientId, inactiveClientId, deletedClientId],
    branchIds: [
      activeBranchId,
      otherActiveBranchId,
      inactiveBranchId,
      deletedBranchId,
      inactiveClientBranchId,
      deletedClientBranchId,
    ],
    serviceTypeIds: [
      activeServiceTypeId,
      otherActiveServiceTypeId,
      inactiveServiceTypeId,
      deletedServiceTypeId,
    ],
    activeBranchId,
    otherActiveBranchId,
    inactiveBranchId,
    deletedBranchId,
    inactiveClientBranchId,
    deletedClientBranchId,
    activeServiceTypeId,
    otherActiveServiceTypeId,
    inactiveServiceTypeId,
    deletedServiceTypeId,
    actor: {
      userId: user.id,
      technicianId: null,
      permissions: ["orders:write"],
      requestId: randomUUID(),
      ipAddress: "127.0.0.1",
      userAgent: "Orders mutation persistence test",
    },
  };
}

afterAll(disconnectTestDatabase);

describe("orders mutation repository creation", () => {
  let fixture: CreationFixture;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    fixture = await createCreationFixture();
  });

  afterEach(async () => {
    await database.historialOrden.deleteMany({
      where: { ordenId: { in: createdOrderIds } },
    });
    await database.auditoria.deleteMany({
      where: { entity: "OrdenTrabajo", entityId: { in: createdOrderIds } },
    });
    await database.ordenTrabajo.deleteMany({
      where: { id: { in: createdOrderIds } },
    });
    createdOrderIds.length = 0;
  });

  afterAll(async () => {
    await database.tipoServicio.deleteMany({
      where: { id: { in: fixture.serviceTypeIds } },
    });
    await database.sucursalCliente.deleteMany({
      where: { id: { in: fixture.branchIds } },
    });
    await database.cliente.deleteMany({
      where: { id: { in: fixture.clientIds } },
    });
  });

  it("creates a pending version-one order without participants and writes history and audit atomically", async () => {
    const repository = createOrdersMutationRepository(database);
    const input = creationInput(fixture);

    const result = await repository.createOrder(input, fixture.actor, now);

    expect(result.kind).toBe("CREATED");
    if (result.kind !== "CREATED") return;
    createdOrderIds.push(result.order.id);
    expect(result.order).toMatchObject({
      orderNumber: "GS-2026-0004",
      status: "PENDING",
      version: 1,
      priority: input.priority,
      reportedProblem: input.reportedProblem,
    });
    expect(result.order.tecnicos).toEqual([]);
    expect(result.order.materiales).toEqual([]);

    const history = await database.historialOrden.findMany({
      where: { ordenId: result.order.id },
    });
    const audits = await database.auditoria.findMany({
      where: { entity: "OrdenTrabajo", entityId: result.order.id },
    });
    expect(history).toEqual([
      expect.objectContaining({
        action: "ORDER_CREATED",
        previousStatus: null,
        newStatus: "PENDING",
        userId: fixture.actor.userId,
        occurredAt: now,
        requestId: fixture.actor.requestId,
      }),
    ]);
    expect(audits).toEqual([
      expect.objectContaining({
        action: "ORDER_CREATED",
        entity: "OrdenTrabajo",
        userId: fixture.actor.userId,
        occurredAt: now,
        requestId: fixture.actor.requestId,
        ipAddress: fixture.actor.ipAddress,
        userAgent: fixture.actor.userAgent,
        beforeData: null,
      }),
    ]);
  });

  it("uses the Tegucigalpa civil year at the UTC year boundary", async () => {
    const repository = createOrdersMutationRepository(database);
    const tegucigalpaNewYearsEve = new Date("2026-01-01T03:00:00.000Z");

    const result = await repository.createOrder(
      creationInput(fixture),
      fixture.actor,
      tegucigalpaNewYearsEve,
    );

    expect(result.kind).toBe("CREATED");
    if (result.kind !== "CREATED") return;
    createdOrderIds.push(result.order.id);
    expect(result.order.orderNumber).toBe("GS-2025-0001");
  });

  it("ignores malformed annual-number candidates", async () => {
    const repository = createOrdersMutationRepository(database);
    const malformedId = randomUUID();
    await database.ordenTrabajo.create({
      data: {
        id: malformedId,
        orderNumber: "GS-2026-999x",
        sucursalId: fixture.activeBranchId,
        tipoServicioId: fixture.activeServiceTypeId,
        reportedProblem: "Número deliberadamente malformado",
      },
    });
    createdOrderIds.push(malformedId);

    const result = await repository.createOrder(
      creationInput(fixture),
      fixture.actor,
      now,
    );

    expect(result.kind).toBe("CREATED");
    if (result.kind !== "CREATED") return;
    createdOrderIds.push(result.order.id);
    expect(result.order.orderNumber).toBe("GS-2026-0004");
  });

  it.each([
    ["inactive branch", (value: CreationFixture) => value.inactiveBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["deleted branch", (value: CreationFixture) => value.deletedBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["inactive client", (value: CreationFixture) => value.inactiveClientBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["deleted client", (value: CreationFixture) => value.deletedClientBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["inactive service type", (value: CreationFixture) => value.activeBranchId, (value: CreationFixture) => value.inactiveServiceTypeId],
    ["deleted service type", (value: CreationFixture) => value.activeBranchId, (value: CreationFixture) => value.deletedServiceTypeId],
  ])("rejects an %s parent", async (_label, branchId, serviceTypeId) => {
    const repository = createOrdersMutationRepository(database);

    const result = await repository.createOrder(
      creationInput(fixture, {
        branchId: branchId(fixture),
        serviceTypeId: serviceTypeId(fixture),
      }),
      fixture.actor,
      now,
    );

    expect(result).toEqual({ kind: "RESOURCE_INACTIVE" });
  });

  it("serializes concurrent creations into distinct sequential annual numbers", async () => {
    const lockerDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const secondDatabase = createDatabaseClient(process.env.DATABASE_TEST_URL!);
    const firstRepository = createOrdersMutationRepository(database);
    const secondRepository = createOrdersMutationRepository(secondDatabase);
    let releaseLock: () => void = () => undefined;
    let markLockAcquired: () => void = () => undefined;
    const lockAcquired = new Promise<void>((resolve) => {
      markLockAcquired = resolve;
    });
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockTransaction = lockerDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${annualNumberLockNamespace}, ${2026})`;
      markLockAcquired();
      await holdLock;
    });
    await lockAcquired;
    const creations = [
      firstRepository.createOrder(
        creationInput(fixture),
        fixture.actor,
        now,
      ),
      secondRepository.createOrder(
        creationInput(fixture),
        fixture.actor,
        now,
      ),
    ] as const;
    try {
      await waitForAnnualNumberWaiters(2, 2026);
      releaseLock();
      await lockTransaction;
      const settled = await Promise.allSettled(creations);
      const results = settled.flatMap((entry) =>
        entry.status === "fulfilled" ? [entry.value] : [],
      );
      for (const result of results) {
        if (result.kind === "CREATED") createdOrderIds.push(result.order.id);
      }

      expect(settled.every((entry) => entry.status === "fulfilled")).toBe(true);
      expect(results.every((result) => result.kind === "CREATED")).toBe(true);
      const orderNumbers = results.flatMap((result) =>
        result.kind === "CREATED" ? [result.order.orderNumber] : [],
      );
      expect(orderNumbers.sort()).toEqual(["GS-2026-0004", "GS-2026-0005"]);
    } finally {
      releaseLock();
      await Promise.allSettled([lockTransaction, ...creations]);
      await lockerDatabase.$disconnect();
      await secondDatabase.$disconnect();
    }
  });

  it("rolls back the order when history insertion fails", async () => {
    const repository = createOrdersMutationRepository(database);
    const input = creationInput(fixture);
    const actorWithMissingUser = {
      ...fixture.actor,
      userId: randomUUID(),
      requestId: randomUUID(),
    };

    await expect(
      repository.createOrder(input, actorWithMissingUser, now),
    ).rejects.toThrow();

    expect(
      await database.ordenTrabajo.count({
        where: { reportedProblem: input.reportedProblem },
      }),
    ).toBe(0);
  });
});

const editableStatuses = [
  "PENDING",
  "ASSIGNED",
  "ON_ROUTE",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
const nonEditableStatuses = [
  "ON_ROUTE",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
const administrativePatches: ReadonlyArray<
  readonly [string, (fixture: CreationFixture) => UpdateOrderInput]
> = [
  [
    "branchId",
    (fixture) => ({ version: 1, branchId: fixture.otherActiveBranchId }),
  ],
  [
    "serviceTypeId",
    (fixture) => ({
      version: 1,
      serviceTypeId: fixture.otherActiveServiceTypeId,
    }),
  ],
  ["priority", () => ({ version: 1, priority: "LOW" })],
  [
    "reportedProblem",
    () => ({ version: 1, reportedProblem: "Cambio no permitido" }),
  ],
  [
    "description",
    () => ({ version: 1, description: "Cambio no permitido" }),
  ],
  [
    "scheduledFor",
    () => ({
      version: 1,
      scheduledFor: new Date("2026-08-05T15:00:00.000Z"),
    }),
  ],
  ["estimatedMinutes", () => ({ version: 1, estimatedMinutes: 240 })],
];
const rejectedAdministrativeCases = nonEditableStatuses.flatMap((status) =>
  administrativePatches.map(
    ([field, patch]) => [status, field, patch] as const,
  ),
);

interface EditFixture {
  parents: CreationFixture;
  orderIds: Record<(typeof editableStatuses)[number], string>;
  technicianId: string;
  materialId: string;
}

async function createEditFixture(): Promise<EditFixture> {
  const parents = await createCreationFixture();
  const suffix = randomUUID().slice(0, 8);
  const orderIds = Object.fromEntries(
    editableStatuses.map((status) => [status, randomUUID()]),
  ) as EditFixture["orderIds"];
  const technicianId = randomUUID();
  const materialId = randomUUID();
  await database.ordenTrabajo.createMany({
    data: editableStatuses.map((status, index) => ({
      id: orderIds[status],
      orderNumber: `EDIT-${suffix}-${index + 1}`,
      sucursalId: parents.activeBranchId,
      tipoServicioId: parents.activeServiceTypeId,
      priority: "MEDIUM",
      status,
      reportedProblem: `Problema ${status}`,
      description: `Descripción ${status}`,
      scheduledFor: new Date("2026-08-03T15:00:00.000Z"),
      estimatedMinutes: 60,
      version: status === "ASSIGNED" ? 2 : 1,
    })),
  });
  await database.tecnico.create({
    data: {
      id: technicianId,
      code: `EDIT-TEC-${suffix}`,
      fullName: `Técnico de edición ${suffix}`,
    },
  });
  await database.material.create({
    data: {
      id: materialId,
      code: `EDIT-MAT-${suffix}`,
      name: `Material de edición ${suffix}`,
      unit: "unidad",
    },
  });
  await database.ordenTecnico.create({
    data: {
      ordenId: orderIds.ASSIGNED,
      tecnicoId: technicianId,
      role: "PRIMARY",
      assignedAt: new Date("2026-08-01T10:00:00.000Z"),
    },
  });
  await database.materialUtilizado.create({
    data: {
      ordenId: orderIds.ASSIGNED,
      materialId,
      quantity: "2.000",
      historicalUnitCost: "15.50",
      observation: "Material existente",
    },
  });
  return { parents, orderIds, technicianId, materialId };
}

async function removeEditFixture(fixture: EditFixture): Promise<void> {
  const orderIds = Object.values(fixture.orderIds);
  await database.historialOrden.deleteMany({
    where: { ordenId: { in: orderIds } },
  });
  await database.auditoria.deleteMany({
    where: { entity: "OrdenTrabajo", entityId: { in: orderIds } },
  });
  await database.materialUtilizado.deleteMany({
    where: { ordenId: { in: orderIds } },
  });
  await database.ordenTecnico.deleteMany({
    where: { ordenId: { in: orderIds } },
  });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: orderIds } } });
  await database.material.delete({ where: { id: fixture.materialId } });
  await database.tecnico.delete({ where: { id: fixture.technicianId } });
  await database.tipoServicio.deleteMany({
    where: { id: { in: fixture.parents.serviceTypeIds } },
  });
  await database.sucursalCliente.deleteMany({
    where: { id: { in: fixture.parents.branchIds } },
  });
  await database.cliente.deleteMany({
    where: { id: { in: fixture.parents.clientIds } },
  });
}

async function resetEditFixture(fixture: EditFixture): Promise<void> {
  const orderIds = Object.values(fixture.orderIds);
  await database.historialOrden.deleteMany({
    where: { ordenId: { in: orderIds } },
  });
  await database.auditoria.deleteMany({
    where: { entity: "OrdenTrabajo", entityId: { in: orderIds } },
  });
  for (const status of editableStatuses) {
    await database.ordenTrabajo.update({
      where: { id: fixture.orderIds[status] },
      data: {
        sucursalId: fixture.parents.activeBranchId,
        tipoServicioId: fixture.parents.activeServiceTypeId,
        priority: "MEDIUM",
        status,
        reportedProblem: `Problema ${status}`,
        description: `Descripción ${status}`,
        scheduledFor: new Date("2026-08-03T15:00:00.000Z"),
        estimatedMinutes: 60,
        version: status === "ASSIGNED" ? 2 : 1,
      },
    });
  }
}

describe("orders mutation repository administrative editing", () => {
  let fixture: EditFixture;

  beforeAll(async () => {
    fixture = await createEditFixture();
  });

  beforeEach(async () => {
    await resetEditFixture(fixture);
  });

  afterAll(async () => {
    await removeEditFixture(fixture);
  });

  it("allows every administrative field while pending and increments the version once", async () => {
    const repository = createOrdersMutationRepository(database);
    const input: UpdateOrderInput = {
      version: 1,
      branchId: fixture.parents.otherActiveBranchId,
      serviceTypeId: fixture.parents.otherActiveServiceTypeId,
      priority: "CRITICAL",
      reportedProblem: "Problema actualizado en pendiente",
      description: "Descripción actualizada en pendiente",
      scheduledFor: new Date("2026-08-04T15:00:00.000Z"),
      estimatedMinutes: 180,
    };

    const result = await repository.updateOrder(
      fixture.orderIds.PENDING,
      input,
      fixture.parents.actor,
      now,
    );

    expect(result.kind).toBe("UPDATED");
    if (result.kind !== "UPDATED") return;
    expect(result.order).toMatchObject({
      version: 2,
      priority: input.priority,
      reportedProblem: input.reportedProblem,
      description: input.description,
      scheduledFor: input.scheduledFor,
      estimatedMinutes: input.estimatedMinutes,
      sucursal: { id: input.branchId },
      tipoServicio: { id: input.serviceTypeId },
    });
  });

  it("allows only priority, problem, description, schedule, and estimate while assigned", async () => {
    const repository = createOrdersMutationRepository(database);
    const input: UpdateOrderInput = {
      version: 2,
      priority: "HIGH",
      reportedProblem: "Problema actualizado en asignada",
      description: null,
      scheduledFor: null,
      estimatedMinutes: 120,
    };

    const result = await repository.updateOrder(
      fixture.orderIds.ASSIGNED,
      input,
      fixture.parents.actor,
      now,
    );

    expect(result.kind).toBe("UPDATED");
    if (result.kind !== "UPDATED") return;
    expect(result.order).toMatchObject({
      version: 3,
      priority: "HIGH",
      reportedProblem: input.reportedProblem,
      description: null,
      scheduledFor: null,
      estimatedMinutes: 120,
    });
    expect(result.order.tecnicos).toEqual([
      expect.objectContaining({
        role: "PRIMARY",
        tecnico: {
          id: fixture.technicianId,
          code: expect.stringMatching(/^EDIT-TEC-/),
          fullName: expect.stringMatching(/^Técnico de edición /),
        },
      }),
    ]);
    expect(result.order.materiales).toEqual([
      expect.objectContaining({
        observation: "Material existente",
        material: {
          id: fixture.materialId,
          code: expect.stringMatching(/^EDIT-MAT-/),
          name: expect.stringMatching(/^Material de edición /),
          unit: "unidad",
        },
      }),
    ]);
    expect(result.order.materiales[0]?.quantity.toFixed(3)).toBe("2.000");
    expect(result.order.materiales[0]?.historicalUnitCost.toFixed(2)).toBe(
      "15.50",
    );
    expect(result.order).not.toHaveProperty("sucursalId");
    expect(result.order).not.toHaveProperty("tipoServicioId");

    const history = await database.historialOrden.findMany({
      where: { ordenId: fixture.orderIds.ASSIGNED },
    });
    const audits = await database.auditoria.findMany({
      where: {
        entity: "OrdenTrabajo",
        entityId: fixture.orderIds.ASSIGNED,
      },
    });
    expect(history).toEqual([
      expect.objectContaining({
        action: "ORDER_UPDATED",
        previousStatus: "ASSIGNED",
        newStatus: "ASSIGNED",
        userId: fixture.parents.actor.userId,
        occurredAt: now,
        requestId: fixture.parents.actor.requestId,
      }),
    ]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "ORDER_UPDATED",
      entity: "OrdenTrabajo",
      userId: fixture.parents.actor.userId,
      occurredAt: now,
      requestId: fixture.parents.actor.requestId,
      ipAddress: fixture.parents.actor.ipAddress,
      userAgent: fixture.parents.actor.userAgent,
    });
    expect(Object.keys(audits[0]?.beforeData as object).sort()).toEqual([
      "branchId",
      "description",
      "estimatedMinutes",
      "orderNumber",
      "priority",
      "reportedProblem",
      "scheduledFor",
      "serviceTypeId",
      "status",
      "version",
    ]);
    expect(Object.keys(audits[0]?.afterData as object).sort()).toEqual([
      "branchId",
      "description",
      "estimatedMinutes",
      "orderNumber",
      "priority",
      "reportedProblem",
      "scheduledFor",
      "serviceTypeId",
      "status",
      "version",
    ]);
  });

  it("rejects branch and service-type edits while assigned", async () => {
    const repository = createOrdersMutationRepository(database);

    await expect(
      repository.updateOrder(
        fixture.orderIds.ASSIGNED,
        { version: 2, branchId: fixture.parents.otherActiveBranchId },
        fixture.parents.actor,
        now,
      ),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
    await expect(
      repository.updateOrder(
        fixture.orderIds.ASSIGNED,
        {
          version: 2,
          serviceTypeId: fixture.parents.otherActiveServiceTypeId,
        },
        fixture.parents.actor,
        now,
      ),
    ).resolves.toEqual({ kind: "INVALID_ORDER_TRANSITION" });
  });

  it.each(rejectedAdministrativeCases)(
    "%s rejects the administrative field %s",
    async (status, _field, patch) => {
      const repository = createOrdersMutationRepository(database);

      const result = await repository.updateOrder(
        fixture.orderIds[status],
        patch(fixture.parents),
        fixture.parents.actor,
        now,
      );

      expect(result).toEqual({ kind: "INVALID_ORDER_TRANSITION" });
      expect(
        await database.ordenTrabajo.findUniqueOrThrow({
          where: { id: fixture.orderIds[status] },
          select: {
            sucursalId: true,
            tipoServicioId: true,
            priority: true,
            reportedProblem: true,
            description: true,
            scheduledFor: true,
            estimatedMinutes: true,
            version: true,
          },
        }),
      ).toEqual({
        sucursalId: fixture.parents.activeBranchId,
        tipoServicioId: fixture.parents.activeServiceTypeId,
        priority: "MEDIUM",
        reportedProblem: `Problema ${status}`,
        description: `Descripción ${status}`,
        scheduledFor: new Date("2026-08-03T15:00:00.000Z"),
        estimatedMinutes: 60,
        version: 1,
      });
    },
  );

  it("returns an exact version conflict without mutating or writing trails", async () => {
    const repository = createOrdersMutationRepository(database);
    const orderId = fixture.orderIds.ON_ROUTE;

    const result = await repository.updateOrder(
      orderId,
      { version: 2, priority: "HIGH" },
      fixture.parents.actor,
      now,
    );

    expect(result).toEqual({ kind: "VERSION_CONFLICT" });
    expect(
      await database.ordenTrabajo.findUniqueOrThrow({
        where: { id: orderId },
        select: { priority: true, version: true },
      }),
    ).toEqual({ priority: "MEDIUM", version: 1 });
    expect(await database.historialOrden.count({ where: { ordenId: orderId } })).toBe(0);
    expect(
      await database.auditoria.count({
        where: { entity: "OrdenTrabajo", entityId: orderId },
      }),
    ).toBe(0);
  });

  it.each([
    ["inactive branch", (value: CreationFixture) => value.inactiveBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["deleted branch", (value: CreationFixture) => value.deletedBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["inactive client", (value: CreationFixture) => value.inactiveClientBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["deleted client", (value: CreationFixture) => value.deletedClientBranchId, (value: CreationFixture) => value.activeServiceTypeId],
    ["inactive service type", (value: CreationFixture) => value.activeBranchId, (value: CreationFixture) => value.inactiveServiceTypeId],
    ["deleted service type", (value: CreationFixture) => value.activeBranchId, (value: CreationFixture) => value.deletedServiceTypeId],
  ])("rejects an %s replacement parent", async (_label, branchId, serviceTypeId) => {
    const repository = createOrdersMutationRepository(database);
    const orderId = fixture.orderIds.PENDING;

    const result = await repository.updateOrder(
      orderId,
      {
        version: 1,
        branchId: branchId(fixture.parents),
        serviceTypeId: serviceTypeId(fixture.parents),
      },
      fixture.parents.actor,
      now,
    );

    expect(result).toEqual({ kind: "RESOURCE_INACTIVE" });
  });

  it("keeps empty administrative patches outside the repository contract", () => {
    expect(updateOrderSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});
