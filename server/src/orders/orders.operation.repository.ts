import { Prisma } from "../../generated/prisma/client.js";
import type {
  EstadoOrden,
  PrismaClient,
} from "../../generated/prisma/client.js";
import type {
  OrderDetailRecord,
  OrderMutationResult,
  OrdersMaterialMutationRepository,
} from "./orders.repository.types.js";
import {
  calculateGrossMinutes,
  transitionOrder,
} from "./orders.state-machine.js";
import type {
  OrderActorContext,
  OrderCommand,
} from "./orders.types.js";

type OperationalCommand = Extract<
  OrderCommand,
  "ON_ROUTE" | "START" | "PAUSE" | "RESUME"
>;

type TrailedCommand = OperationalCommand | "COMPLETE" | "CANCEL";
type MaterialAction =
  | "ORDER_MATERIAL_ADDED"
  | "ORDER_MATERIAL_UPDATED"
  | "ORDER_MATERIAL_REMOVED";

interface LockedOrderRow {
  id: string;
  status: EstadoOrden;
  version: number;
  startedAt: Date | null;
}

interface LockedTechnicianRow {
  id: string;
}

interface LockedMaterialRow {
  id: string;
  referenceCost: Prisma.Decimal | null;
  isActive: boolean;
  deletedAt: Date | null;
}

interface MaterialUsageRow {
  id: string;
  materialId: string;
  quantity: Prisma.Decimal;
  historicalUnitCost: Prisma.Decimal;
  observation: string | null;
  createdAt: Date;
}

const materialUsageSelect = {
  id: true,
  materialId: true,
  quantity: true,
  historicalUnitCost: true,
  observation: true,
  createdAt: true,
} as const satisfies Prisma.MaterialUtilizadoSelect;

const orderDetailBaseSelect = {
  id: true,
  orderNumber: true,
  sucursalId: true,
  tipoServicioId: true,
  priority: true,
  status: true,
  reportedProblem: true,
  description: true,
  scheduledFor: true,
  startedAt: true,
  endedAt: true,
  diagnosis: true,
  result: true,
  cancellationReason: true,
  estimatedMinutes: true,
  totalMinutes: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const satisfies Prisma.OrdenTrabajoSelect;

async function loadOrderDetail(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<OrderDetailRecord> {
  const record = await transaction.ordenTrabajo.findUniqueOrThrow({
    where: { id },
    select: orderDetailBaseSelect,
  });
  const branch = await transaction.sucursalCliente.findUniqueOrThrow({
    where: { id: record.sucursalId },
    select: { id: true, code: true, name: true, clienteId: true },
  });
  const client = await transaction.cliente.findUniqueOrThrow({
    where: { id: branch.clienteId },
    select: { id: true, code: true, tradeName: true },
  });
  const serviceType = await transaction.tipoServicio.findUniqueOrThrow({
    where: { id: record.tipoServicioId },
    select: { id: true, code: true, name: true },
  });
  const assignments = await transaction.ordenTecnico.findMany({
    where: { ordenId: id },
    select: {
      id: true,
      tecnicoId: true,
      role: true,
      assignedAt: true,
      unassignedAt: true,
    },
    orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
  });
  const technicians = await transaction.tecnico.findMany({
    where: {
      id: { in: [...new Set(assignments.map(({ tecnicoId }) => tecnicoId))] },
    },
    select: { id: true, code: true, fullName: true },
  });
  const techniciansById = new Map(
    technicians.map((technician) => [technician.id, technician]),
  );
  const usages = await transaction.materialUtilizado.findMany({
    where: { ordenId: id },
    select: {
      id: true,
      materialId: true,
      quantity: true,
      historicalUnitCost: true,
      observation: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const materials = await transaction.material.findMany({
    where: {
      id: { in: [...new Set(usages.map(({ materialId }) => materialId))] },
    },
    select: { id: true, code: true, name: true, unit: true },
  });
  const materialsById = new Map(
    materials.map((material) => [material.id, material]),
  );

  return {
    id: record.id,
    orderNumber: record.orderNumber,
    priority: record.priority,
    status: record.status,
    reportedProblem: record.reportedProblem,
    description: record.description,
    scheduledFor: record.scheduledFor,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    diagnosis: record.diagnosis,
    result: record.result,
    cancellationReason: record.cancellationReason,
    estimatedMinutes: record.estimatedMinutes,
    totalMinutes: record.totalMinutes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    sucursal: {
      id: branch.id,
      code: branch.code,
      name: branch.name,
      cliente: client,
    },
    tipoServicio: serviceType,
    tecnicos: assignments.map((assignment) => ({
      role: assignment.role,
      assignedAt: assignment.assignedAt,
      unassignedAt: assignment.unassignedAt,
      tecnico: techniciansById.get(assignment.tecnicoId)!,
    })),
    materiales: usages.map(({ materialId, ...usage }) => ({
      ...usage,
      material: materialsById.get(materialId)!,
    })),
    _count: {
      tecnicos: assignments.filter(
        ({ role, unassignedAt }) =>
          role === "SUPPORT" && unassignedAt === null,
      ).length,
    },
  };
}

function orderAuditSnapshot(order: OrderDetailRecord) {
  return {
    orderNumber: order.orderNumber,
    branchId: order.sucursal.id,
    serviceTypeId: order.tipoServicio.id,
    priority: order.priority,
    status: order.status,
    reportedProblem: order.reportedProblem,
    description: order.description,
    scheduledFor: order.scheduledFor?.toISOString() ?? null,
    startedAt: order.startedAt?.toISOString() ?? null,
    endedAt: order.endedAt?.toISOString() ?? null,
    estimatedMinutes: order.estimatedMinutes,
    totalMinutes: order.totalMinutes,
    version: order.version,
  };
}

async function lockOrder(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<LockedOrderRow | null> {
  const rows = await transaction.$queryRaw<LockedOrderRow[]>`
    SELECT
      "id",
      UPPER("status"::text) AS "status",
      "version",
      "started_at" AS "startedAt"
    FROM "orden_trabajo"
    WHERE "id" = ${id}::uuid
      AND "deleted_at" IS NULL
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockTechnician(
  transaction: Prisma.TransactionClient,
  technicianId: string,
): Promise<LockedTechnicianRow | null> {
  const rows = await transaction.$queryRaw<LockedTechnicianRow[]>`
    SELECT "id"
    FROM "tecnico"
    WHERE "id" = ${technicianId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockMaterial(
  transaction: Prisma.TransactionClient,
  materialId: string,
): Promise<LockedMaterialRow | null> {
  const rows = await transaction.$queryRaw<LockedMaterialRow[]>`
    SELECT
      "id",
      "reference_cost" AS "referenceCost",
      "is_active" AS "isActive",
      "deleted_at" AS "deletedAt"
    FROM "material"
    WHERE "id" = ${materialId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function materialActorFailure(
  transaction: Prisma.TransactionClient,
  orderId: string,
  actor: OrderActorContext,
): Promise<OrderMutationResult | null> {
  if (actor.permissions.includes("ORDERS_MANAGE")) return null;
  if (
    !actor.permissions.includes("ORDERS_OPERATE_OWN") ||
    actor.technicianId === null
  ) {
    return { kind: "TECHNICIAN_NOT_ASSIGNED" };
  }
  const primary = await transaction.ordenTecnico.findFirst({
    where: { ordenId: orderId, role: "PRIMARY", unassignedAt: null },
    select: { tecnicoId: true },
  });
  if (!primary) return { kind: "PRIMARY_TECHNICIAN_REQUIRED" };
  if (primary.tecnicoId !== actor.technicianId) {
    return { kind: "TECHNICIAN_NOT_ASSIGNED" };
  }
  return null;
}

function materialStateFailure(status: EstadoOrden): OrderMutationResult | null {
  if (status === "COMPLETED" || status === "CANCELLED") {
    return { kind: "ORDER_CLOSED" };
  }
  if (status !== "IN_PROGRESS" && status !== "PAUSED") {
    return { kind: "INVALID_ORDER_TRANSITION" };
  }
  return null;
}

function materialUsageSnapshot(usage: MaterialUsageRow) {
  return {
    id: usage.id,
    materialId: usage.materialId,
    quantity: usage.quantity.toFixed(3),
    historicalUnitCost: usage.historicalUnitCost.toFixed(2),
    observation: usage.observation,
    createdAt: usage.createdAt.toISOString(),
  };
}

async function hasOperationalOverlap(
  transaction: Prisma.TransactionClient,
  orderId: string,
  technicianId: string,
): Promise<boolean> {
  const assignment = await transaction.ordenTecnico.findFirst({
    where: {
      ordenId: { not: orderId },
      tecnicoId: technicianId,
      role: "PRIMARY",
      unassignedAt: null,
      orden: {
        deletedAt: null,
        status: { in: ["ON_ROUTE", "IN_PROGRESS"] },
      },
    },
    select: { id: true },
  });
  return assignment !== null;
}

function actionForCommand(command: TrailedCommand): string {
  return {
    ON_ROUTE: "ORDER_ON_ROUTE",
    START: "ORDER_STARTED",
    PAUSE: "ORDER_PAUSED",
    RESUME: "ORDER_RESUMED",
    COMPLETE: "ORDER_COMPLETED",
    CANCEL: "ORDER_CANCELLED",
  }[command];
}

async function writeTransitionTrail(
  transaction: Prisma.TransactionClient,
  before: OrderDetailRecord,
  order: OrderDetailRecord,
  command: TrailedCommand,
  actor: OrderActorContext,
  now: Date,
  comment?: string,
): Promise<void> {
  const action = actionForCommand(command);
  await transaction.historialOrden.create({
    data: {
      ordenId: order.id,
      previousStatus: before.status,
      newStatus: order.status,
      action,
      ...(comment !== undefined && { comment }),
      userId: actor.userId,
      occurredAt: now,
      requestId: actor.requestId,
      metadata: { version: order.version },
    },
  });
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action,
      entity: "OrdenTrabajo",
      entityId: order.id,
      beforeData: orderAuditSnapshot(before),
      afterData: orderAuditSnapshot(order),
      ...(comment !== undefined && { reason: comment }),
      occurredAt: now,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
    },
  });
}

async function writeMaterialTrail(
  transaction: Prisma.TransactionClient,
  before: OrderDetailRecord,
  order: OrderDetailRecord,
  action: MaterialAction,
  actor: OrderActorContext,
  now: Date,
  usageBefore: MaterialUsageRow | null,
  usageAfter: MaterialUsageRow | null,
): Promise<void> {
  const beforeUsage =
    usageBefore === null ? null : materialUsageSnapshot(usageBefore);
  const afterUsage =
    usageAfter === null ? null : materialUsageSnapshot(usageAfter);
  await transaction.historialOrden.create({
    data: {
      ordenId: order.id,
      previousStatus: before.status,
      newStatus: order.status,
      action,
      userId: actor.userId,
      occurredAt: now,
      requestId: actor.requestId,
      metadata: {
        version: order.version,
        materialUsage: afterUsage ?? beforeUsage,
      },
    },
  });
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action,
      entity: "OrdenTrabajo",
      entityId: order.id,
      beforeData: {
        order: orderAuditSnapshot(before),
        materialUsage: beforeUsage,
      },
      afterData: {
        order: orderAuditSnapshot(order),
        materialUsage: afterUsage,
      },
      occurredAt: now,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
    },
  });
}

export function createOrdersOperationRepository(
  database: PrismaClient,
): OrdersMaterialMutationRepository {
  async function runTransition(
    orderId: string,
    expectedVersion: number,
    command: OperationalCommand,
    actor: OrderActorContext,
    now: Date,
    comment?: string,
  ): Promise<OrderMutationResult> {
    return database.$transaction(async (transaction) => {
      const locked = await lockOrder(transaction, orderId);
      if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
      if (locked.version !== expectedVersion) {
        return { kind: "VERSION_CONFLICT" } as const;
      }
      const nextStatus = transitionOrder(locked.status, command);
      if (!nextStatus) return { kind: "INVALID_ORDER_TRANSITION" } as const;

      const primary = await transaction.ordenTecnico.findFirst({
        where: { ordenId: orderId, role: "PRIMARY", unassignedAt: null },
        select: { tecnicoId: true },
      });
      if (!primary) return { kind: "PRIMARY_TECHNICIAN_REQUIRED" } as const;
      if (actor.technicianId !== primary.tecnicoId) {
        return { kind: "TECHNICIAN_NOT_ASSIGNED" } as const;
      }
      if (!(await lockTechnician(transaction, primary.tecnicoId))) {
        return { kind: "TECHNICIAN_NOT_ASSIGNED" } as const;
      }

      if (command !== "PAUSE") {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${primary.tecnicoId}, 0))
        `;
        if (
          await hasOperationalOverlap(
            transaction,
            orderId,
            primary.tecnicoId,
          )
        ) {
          return { kind: "TECHNICIAN_BUSY" } as const;
        }
      }

      const before = await loadOrderDetail(transaction, orderId);
      const changed = await transaction.ordenTrabajo.updateMany({
        where: { id: orderId, version: expectedVersion },
        data: {
          status: nextStatus,
          ...(command === "START" && locked.startedAt === null && {
            startedAt: now,
          }),
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;

      const order = await loadOrderDetail(transaction, orderId);
      await writeTransitionTrail(
        transaction,
        before,
        order,
        command,
        actor,
        now,
        comment,
      );
      return { kind: "UPDATED", order } as const;
    });
  }

  return {
    moveOnRoute(id, input, actor, now) {
      return runTransition(id, input.version, "ON_ROUTE", actor, now);
    },
    startOrder(id, input, actor, now) {
      return runTransition(id, input.version, "START", actor, now);
    },
    pauseOrder(id, input, actor, now) {
      return runTransition(
        id,
        input.version,
        "PAUSE",
        actor,
        now,
        input.comment,
      );
    },
    resumeOrder(id, input, actor, now) {
      return runTransition(id, input.version, "RESUME", actor, now);
    },
    async completeOrder(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const locked = await lockOrder(transaction, id);
        if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
        if (locked.version !== input.version) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const nextStatus = transitionOrder(locked.status, "COMPLETE");
        if (!nextStatus || locked.startedAt === null) {
          return { kind: "INVALID_ORDER_TRANSITION" } as const;
        }

        const primary = await transaction.ordenTecnico.findFirst({
          where: { ordenId: id, role: "PRIMARY", unassignedAt: null },
          select: { tecnicoId: true },
        });
        if (!primary) return { kind: "PRIMARY_TECHNICIAN_REQUIRED" } as const;
        if (actor.technicianId !== primary.tecnicoId) {
          return { kind: "TECHNICIAN_NOT_ASSIGNED" } as const;
        }
        if (!(await lockTechnician(transaction, primary.tecnicoId))) {
          return { kind: "TECHNICIAN_NOT_ASSIGNED" } as const;
        }

        const before = await loadOrderDetail(transaction, id);
        const changed = await transaction.ordenTrabajo.updateMany({
          where: { id, version: input.version },
          data: {
            status: nextStatus,
            endedAt: now,
            diagnosis: input.diagnosis,
            result: input.result,
            totalMinutes: calculateGrossMinutes(locked.startedAt, now),
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;

        const order = await loadOrderDetail(transaction, id);
        await writeTransitionTrail(
          transaction,
          before,
          order,
          "COMPLETE",
          actor,
          now,
        );
        return { kind: "UPDATED", order } as const;
      });
    },
    async cancelOrder(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const locked = await lockOrder(transaction, id);
        if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
        if (locked.version !== input.version) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const nextStatus = transitionOrder(locked.status, "CANCEL");
        if (!nextStatus) return { kind: "INVALID_ORDER_TRANSITION" } as const;

        const before = await loadOrderDetail(transaction, id);
        const endedAt = locked.startedAt === null ? null : now;
        const totalMinutes =
          locked.startedAt === null
            ? null
            : calculateGrossMinutes(locked.startedAt, now);
        const changed = await transaction.ordenTrabajo.updateMany({
          where: { id, version: input.version },
          data: {
            status: nextStatus,
            endedAt,
            totalMinutes,
            cancellationReason: input.cancellationReason,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;

        const order = await loadOrderDetail(transaction, id);
        await writeTransitionTrail(
          transaction,
          before,
          order,
          "CANCEL",
          actor,
          now,
          input.cancellationReason,
        );
        return { kind: "UPDATED", order } as const;
      });
    },
    async addOrderMaterial(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const locked = await lockOrder(transaction, id);
        if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
        if (locked.version !== input.version) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const stateFailure = materialStateFailure(locked.status);
        if (stateFailure) return stateFailure;
        const actorFailure = await materialActorFailure(transaction, id, actor);
        if (actorFailure) return actorFailure;

        const material = await lockMaterial(transaction, input.materialId);
        if (!material) return { kind: "MATERIAL_NOT_FOUND" } as const;
        if (!material.isActive || material.deletedAt !== null) {
          return { kind: "RESOURCE_INACTIVE" } as const;
        }
        if (material.referenceCost === null) {
          return { kind: "MATERIAL_COST_UNAVAILABLE" } as const;
        }

        const before = await loadOrderDetail(transaction, id);
        const usage = await transaction.materialUtilizado.create({
          data: {
            ordenId: id,
            actividadId: null,
            materialId: input.materialId,
            quantity: new Prisma.Decimal(input.quantity),
            historicalUnitCost: material.referenceCost,
            observation: input.observation ?? null,
          },
          select: materialUsageSelect,
        });
        const changed = await transaction.ordenTrabajo.updateMany({
          where: { id, version: input.version },
          data: { updatedAt: now, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const order = await loadOrderDetail(transaction, id);
        await writeMaterialTrail(
          transaction,
          before,
          order,
          "ORDER_MATERIAL_ADDED",
          actor,
          now,
          null,
          usage,
        );
        return { kind: "UPDATED", order } as const;
      });
    },
    async updateOrderMaterial(id, usageId, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const locked = await lockOrder(transaction, id);
        if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
        if (locked.version !== input.version) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const stateFailure = materialStateFailure(locked.status);
        if (stateFailure) return stateFailure;
        const actorFailure = await materialActorFailure(transaction, id, actor);
        if (actorFailure) return actorFailure;

        const usageBefore = await transaction.materialUtilizado.findFirst({
          where: { id: usageId, ordenId: id },
          select: materialUsageSelect,
        });
        if (!usageBefore) {
          return { kind: "MATERIAL_USAGE_NOT_FOUND" } as const;
        }

        const before = await loadOrderDetail(transaction, id);
        const usageAfter = await transaction.materialUtilizado.update({
          where: { id: usageBefore.id },
          data: {
            ...(input.quantity !== undefined && {
              quantity: new Prisma.Decimal(input.quantity),
            }),
            ...(input.observation !== undefined && {
              observation: input.observation,
            }),
          },
          select: materialUsageSelect,
        });
        const changed = await transaction.ordenTrabajo.updateMany({
          where: { id, version: input.version },
          data: { updatedAt: now, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const order = await loadOrderDetail(transaction, id);
        await writeMaterialTrail(
          transaction,
          before,
          order,
          "ORDER_MATERIAL_UPDATED",
          actor,
          now,
          usageBefore,
          usageAfter,
        );
        return { kind: "UPDATED", order } as const;
      });
    },
    async removeOrderMaterial(id, usageId, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const locked = await lockOrder(transaction, id);
        if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
        if (locked.version !== input.version) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const stateFailure = materialStateFailure(locked.status);
        if (stateFailure) return stateFailure;
        const actorFailure = await materialActorFailure(transaction, id, actor);
        if (actorFailure) return actorFailure;

        const usageBefore = await transaction.materialUtilizado.findFirst({
          where: { id: usageId, ordenId: id },
          select: materialUsageSelect,
        });
        if (!usageBefore) {
          return { kind: "MATERIAL_USAGE_NOT_FOUND" } as const;
        }

        const before = await loadOrderDetail(transaction, id);
        await transaction.materialUtilizado.delete({
          where: { id: usageBefore.id },
        });
        const changed = await transaction.ordenTrabajo.updateMany({
          where: { id, version: input.version },
          data: { updatedAt: now, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          return { kind: "VERSION_CONFLICT" } as const;
        }
        const order = await loadOrderDetail(transaction, id);
        await writeMaterialTrail(
          transaction,
          before,
          order,
          "ORDER_MATERIAL_REMOVED",
          actor,
          now,
          usageBefore,
          null,
        );
        return { kind: "UPDATED", order } as const;
      });
    },
  };
}
