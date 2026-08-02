import { Prisma } from "../../generated/prisma/client.js";
import type {
  EstadoOrden,
  PrismaClient,
} from "../../generated/prisma/client.js";
import type {
  OrdersAdministrativeMutationRepository,
  OrderDetailRecord,
} from "./orders.repository.types.js";
import type {
  CreateOrderInput,
  OrderActorContext,
  UpdateOrderInput,
} from "./orders.types.js";

const annualNumberLockNamespace = 1_196_575_044;
const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;
const serializableAttempts = 3;
const pendingEditableFields = new Set<keyof UpdateOrderInput>([
  "branchId",
  "serviceTypeId",
  "priority",
  "reportedProblem",
  "description",
  "scheduledFor",
  "estimatedMinutes",
]);
const assignedEditableFields = new Set<keyof UpdateOrderInput>([
  "priority",
  "reportedProblem",
  "description",
  "scheduledFor",
  "estimatedMinutes",
]);

interface LockedOrderRow {
  id: string;
  status: EstadoOrden;
  version: number;
  branchId: string;
  serviceTypeId: string;
}

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

async function runSerializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryOrderNumberConflict = false,
): Promise<T> {
  for (let attempt = 1; attempt <= serializableAttempts; attempt += 1) {
    try {
      return await database.$transaction(operation, transactionOptions);
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          (retryOrderNumberConflict && isOrderNumberConflict(error)));
      if (!retryable || attempt === serializableAttempts) throw error;
    }
  }
  throw new Error("Unreachable serializable transaction state");
}

function isOrderNumberConflict(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  if (error.code !== "P2002" || error.meta?.modelName !== "OrdenTrabajo") {
    return false;
  }
  const adapterError = error.meta.driverAdapterError;
  if (typeof adapterError !== "object" || adapterError === null) return false;
  const cause = Reflect.get(adapterError, "cause");
  if (typeof cause !== "object" || cause === null) return false;
  const originalMessage = Reflect.get(cause, "originalMessage");
  return (
    typeof originalMessage === "string" &&
    originalMessage.includes("orden_trabajo_order_number_key")
  );
}

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

function tegucigalpaYear(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "America/Tegucigalpa",
      year: "numeric",
    }).format(now),
  );
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
    estimatedMinutes: order.estimatedMinutes,
    version: order.version,
  };
}

async function hasActiveParents(
  transaction: Prisma.TransactionClient,
  branchId: string,
  serviceTypeId: string,
): Promise<boolean> {
  return (
    (await hasActiveBranch(transaction, branchId)) &&
    (await hasActiveServiceType(transaction, serviceTypeId))
  );
}

async function hasActiveBranch(
  transaction: Prisma.TransactionClient,
  branchId: string,
): Promise<boolean> {
  const branch = await transaction.sucursalCliente.findFirst({
    where: {
      id: branchId,
      isActive: true,
      deletedAt: null,
      cliente: { isActive: true, deletedAt: null },
    },
    select: { id: true },
  });
  return branch !== null;
}

async function hasActiveServiceType(
  transaction: Prisma.TransactionClient,
  serviceTypeId: string,
): Promise<boolean> {
  const serviceType = await transaction.tipoServicio.findFirst({
    where: {
      id: serviceTypeId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  return serviceType !== null;
}

async function nextAnnualOrderNumber(
  transaction: Prisma.TransactionClient,
  now: Date,
): Promise<string> {
  const year = tegucigalpaYear(now);
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${annualNumberLockNamespace}, ${year})`;
  const pattern = `^GS-${year}-[0-9]+$`;
  const rows = await transaction.$queryRaw<Array<{ orderNumber: string }>>`
    SELECT "order_number" AS "orderNumber"
    FROM "orden_trabajo"
    WHERE "order_number" ~ ${pattern}
  `;
  const maximum = rows.reduce((current, row) => {
    const suffix = Number(row.orderNumber.slice(`GS-${year}-`.length));
    return Math.max(current, suffix);
  }, 0);
  return `GS-${year}-${String(maximum + 1).padStart(4, "0")}`;
}

async function writeCreationTrail(
  transaction: Prisma.TransactionClient,
  order: OrderDetailRecord,
  actor: OrderActorContext,
  now: Date,
): Promise<void> {
  await transaction.historialOrden.create({
    data: {
      ordenId: order.id,
      previousStatus: null,
      newStatus: "PENDING",
      action: "ORDER_CREATED",
      userId: actor.userId,
      occurredAt: now,
      requestId: actor.requestId,
      metadata: { version: order.version },
    },
  });
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action: "ORDER_CREATED",
      entity: "OrdenTrabajo",
      entityId: order.id,
      afterData: orderAuditSnapshot(order),
      occurredAt: now,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
    },
  });
}

async function createOrder(
  transaction: Prisma.TransactionClient,
  input: CreateOrderInput,
  actor: OrderActorContext,
  now: Date,
) {
  if (
    !(await hasActiveParents(
      transaction,
      input.branchId,
      input.serviceTypeId,
    ))
  ) {
    return { kind: "RESOURCE_INACTIVE" } as const;
  }

  const orderNumber = await nextAnnualOrderNumber(transaction, now);
  const created = await transaction.ordenTrabajo.create({
    data: {
      orderNumber,
      sucursalId: input.branchId,
      tipoServicioId: input.serviceTypeId,
      priority: input.priority,
      status: "PENDING",
      reportedProblem: input.reportedProblem,
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.scheduledFor !== undefined && {
        scheduledFor: input.scheduledFor,
      }),
      ...(input.estimatedMinutes !== undefined && {
        estimatedMinutes: input.estimatedMinutes,
      }),
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    select: { id: true },
  });
  const detail = await loadOrderDetail(transaction, created.id);
  await writeCreationTrail(transaction, detail, actor, now);
  return { kind: "CREATED", order: detail } as const;
}

function editableFieldsForStatus(
  status: EstadoOrden,
): ReadonlySet<keyof UpdateOrderInput> {
  if (status === "PENDING") return pendingEditableFields;
  if (status === "ASSIGNED") return assignedEditableFields;
  return new Set();
}

function updatePatch(
  input: UpdateOrderInput,
  now: Date,
): Prisma.OrdenTrabajoUncheckedUpdateManyInput {
  return {
    ...(input.branchId !== undefined && { sucursalId: input.branchId }),
    ...(input.serviceTypeId !== undefined && {
      tipoServicioId: input.serviceTypeId,
    }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.reportedProblem !== undefined && {
      reportedProblem: input.reportedProblem,
    }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.scheduledFor !== undefined && {
      scheduledFor: input.scheduledFor,
    }),
    ...(input.estimatedMinutes !== undefined && {
      estimatedMinutes: input.estimatedMinutes,
    }),
    updatedAt: now,
  };
}

async function writeUpdateTrail(
  transaction: Prisma.TransactionClient,
  before: OrderDetailRecord,
  order: OrderDetailRecord,
  actor: OrderActorContext,
  now: Date,
  changedFields: readonly string[],
): Promise<void> {
  await transaction.historialOrden.create({
    data: {
      ordenId: order.id,
      previousStatus: before.status,
      newStatus: order.status,
      action: "ORDER_UPDATED",
      userId: actor.userId,
      occurredAt: now,
      requestId: actor.requestId,
      metadata: { changedFields, version: order.version },
    },
  });
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action: "ORDER_UPDATED",
      entity: "OrdenTrabajo",
      entityId: order.id,
      beforeData: orderAuditSnapshot(before),
      afterData: orderAuditSnapshot(order),
      occurredAt: now,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
    },
  });
}

async function updateOrder(
  transaction: Prisma.TransactionClient,
  id: string,
  input: UpdateOrderInput,
  actor: OrderActorContext,
  now: Date,
) {
  const rows = await transaction.$queryRaw<LockedOrderRow[]>`
    SELECT
      "id",
      UPPER("status"::text) AS "status",
      "version",
      "sucursal_id" AS "branchId",
      "tipo_servicio_id" AS "serviceTypeId"
    FROM "orden_trabajo"
    WHERE "id" = ${id}::uuid
      AND "deleted_at" IS NULL
    FOR UPDATE
  `;
  const locked = rows[0];
  if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
  if (locked.version !== input.version) {
    return { kind: "VERSION_CONFLICT" } as const;
  }

  const changedFields = Object.keys(input).filter(
    (key) => key !== "version",
  ) as Array<keyof UpdateOrderInput>;
  const allowedFields = editableFieldsForStatus(locked.status);
  if (changedFields.some((field) => !allowedFields.has(field))) {
    return { kind: "INVALID_ORDER_TRANSITION" } as const;
  }

  if (
    input.branchId !== undefined &&
    input.branchId !== locked.branchId &&
    !(await hasActiveBranch(transaction, input.branchId))
  ) {
    return { kind: "RESOURCE_INACTIVE" } as const;
  }
  if (
    input.serviceTypeId !== undefined &&
    input.serviceTypeId !== locked.serviceTypeId &&
    !(await hasActiveServiceType(transaction, input.serviceTypeId))
  ) {
    return { kind: "RESOURCE_INACTIVE" } as const;
  }

  const before = await loadOrderDetail(transaction, id);
  const changed = await transaction.ordenTrabajo.updateMany({
    where: { id, version: input.version },
    data: {
      ...updatePatch(input, now),
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) {
    return { kind: "VERSION_CONFLICT" } as const;
  }

  const order = await loadOrderDetail(transaction, id);
  await writeUpdateTrail(
    transaction,
    before,
    order,
    actor,
    now,
    changedFields,
  );
  return { kind: "UPDATED", order } as const;
}

export function createOrdersMutationRepository(
  database: PrismaClient,
): OrdersAdministrativeMutationRepository {
  return {
    async createOrder(input, actor, now) {
      return runSerializableTransaction(
        database,
        (transaction) => createOrder(transaction, input, actor, now),
        true,
      );
    },

    async updateOrder(id, input, actor, now) {
      return runSerializableTransaction(
        database,
        (transaction) => updateOrder(transaction, id, input, actor, now),
      );
    },
  };
}
