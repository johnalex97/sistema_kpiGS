import { Prisma } from "../../generated/prisma/client.js";
import type {
  EstadoOrden,
  PrismaClient,
} from "../../generated/prisma/client.js";
import type {
  OrderDetailRecord,
  OrdersMutationRepository,
} from "./orders.repository.types.js";
import type {
  AssignmentInput,
  CreateOrderInput,
  OrderActorContext,
  UnassignmentInput,
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

interface LockedTechnicianRow {
  id: string;
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

async function writeAssignmentTrail(
  transaction: Prisma.TransactionClient,
  before: OrderDetailRecord,
  order: OrderDetailRecord,
  actor: OrderActorContext,
  now: Date,
  action:
    | "ORDER_ASSIGNED"
    | "ORDER_PRIMARY_REPLACED"
    | "ORDER_UNASSIGNED",
  metadata: Prisma.InputJsonValue,
  reason?: string,
): Promise<void> {
  await transaction.historialOrden.create({
    data: {
      ordenId: order.id,
      previousStatus: before.status,
      newStatus: order.status,
      action,
      ...(reason !== undefined && { comment: reason }),
      userId: actor.userId,
      occurredAt: now,
      requestId: actor.requestId,
      metadata,
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
      ...(reason !== undefined && { reason }),
      occurredAt: now,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
    },
  });
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
      "sucursal_id" AS "branchId",
      "tipo_servicio_id" AS "serviceTypeId"
    FROM "orden_trabajo"
    WHERE "id" = ${id}::uuid
      AND "deleted_at" IS NULL
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockActiveTechnician(
  transaction: Prisma.TransactionClient,
  technicianId: string,
): Promise<LockedTechnicianRow | null> {
  const rows = await transaction.$queryRaw<LockedTechnicianRow[]>`
    SELECT "id"
    FROM "tecnico"
    WHERE "id" = ${technicianId}::uuid
      AND "status" <> 'inactive'::"estado_tecnico"
      AND "deleted_at" IS NULL
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

function assignmentAllowed(
  status: EstadoOrden,
  role: AssignmentInput["role"],
): boolean {
  if (role === "PRIMARY") return status === "PENDING" || status === "ASSIGNED";
  return !["COMPLETED", "CANCELLED"].includes(status);
}

function closedOrder(status: EstadoOrden): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

function primaryRemovalAllowed(status: EstadoOrden): boolean {
  return status === "PENDING" || status === "ASSIGNED";
}

async function updateOrderForAssignment(
  transaction: Prisma.TransactionClient,
  id: string,
  version: number,
  status: EstadoOrden,
  now: Date,
): Promise<boolean> {
  const changed = await transaction.ordenTrabajo.updateMany({
    where: { id, version },
    data: { status, updatedAt: now, version: { increment: 1 } },
  });
  return changed.count === 1;
}

async function assignTechnician(
  transaction: Prisma.TransactionClient,
  id: string,
  input: AssignmentInput,
  actor: OrderActorContext,
  now: Date,
) {
  const locked = await lockOrder(transaction, id);
  if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
  if (locked.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
  const existingAssignment = await transaction.ordenTecnico.findFirst({
    where: {
      ordenId: id,
      tecnicoId: input.technicianId,
      unassignedAt: null,
    },
    select: { id: true, role: true },
  });
  const demotingPrimary =
    existingAssignment?.role === "PRIMARY" &&
    input.role === "SUPPORT";
  if (closedOrder(locked.status)) return { kind: "ORDER_CLOSED" } as const;
  if (
    demotingPrimary
      ? !primaryRemovalAllowed(locked.status)
      : !assignmentAllowed(locked.status, input.role)
  ) {
    return { kind: "INVALID_ORDER_TRANSITION" } as const;
  }
  if (!(await lockActiveTechnician(transaction, input.technicianId))) {
    return { kind: "RESOURCE_INACTIVE" } as const;
  }

  const before = await loadOrderDetail(transaction, id);
  let retiredPrimaryIds: string[] = [];
  if (input.role === "PRIMARY" && locked.status === "ASSIGNED") {
    const activePrimaries = await transaction.ordenTecnico.findMany({
      where: {
        ordenId: id,
        tecnicoId: { not: input.technicianId },
        role: "PRIMARY",
        unassignedAt: null,
      },
      select: { tecnicoId: true },
    });
    retiredPrimaryIds = activePrimaries.map(({ tecnicoId }) => tecnicoId);
    if (retiredPrimaryIds.length > 0) {
      await transaction.ordenTecnico.updateMany({
        where: {
          ordenId: id,
          tecnicoId: { in: retiredPrimaryIds },
          role: "PRIMARY",
          unassignedAt: null,
        },
        data: { unassignedAt: now },
      });
    }
  }
  if (existingAssignment !== null) {
    await transaction.ordenTecnico.update({
      where: { id: existingAssignment.id },
      data: { unassignedAt: now },
    });
  }
  await transaction.ordenTecnico.create({
    data: {
      ordenId: id,
      tecnicoId: input.technicianId,
      role: input.role,
      assignedAt: now,
      assignedById: actor.userId,
    },
  });
  const nextStatus =
    demotingPrimary && locked.status === "ASSIGNED"
      ? "PENDING"
      : input.role === "PRIMARY" && locked.status === "PENDING"
      ? "ASSIGNED"
      : locked.status;
  if (!(await updateOrderForAssignment(transaction, id, input.version, nextStatus, now))) {
    return { kind: "VERSION_CONFLICT" } as const;
  }

  const order = await loadOrderDetail(transaction, id);
  const action = demotingPrimary
    ? "ORDER_UNASSIGNED"
    : retiredPrimaryIds.length > 0
      ? "ORDER_PRIMARY_REPLACED"
      : "ORDER_ASSIGNED";
  await writeAssignmentTrail(
    transaction,
    before,
    order,
    actor,
    now,
    action,
    demotingPrimary
      ? {
          technicianId: input.technicianId,
          previousRole: "PRIMARY",
          newRole: "SUPPORT",
          previousStatus: before.status,
          newStatus: order.status,
          version: order.version,
        }
      : {
          technicianId: input.technicianId,
          role: input.role,
          retiredTechnicians: retiredPrimaryIds.map((technicianId) => ({
            technicianId,
            role: "PRIMARY",
          })),
          version: order.version,
        },
  );
  return { kind: "UPDATED", order } as const;
}

async function unassignTechnician(
  transaction: Prisma.TransactionClient,
  id: string,
  technicianId: string,
  input: UnassignmentInput,
  actor: OrderActorContext,
  now: Date,
) {
  const locked = await lockOrder(transaction, id);
  if (!locked) return { kind: "ORDER_NOT_FOUND" } as const;
  if (locked.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
  if (closedOrder(locked.status)) return { kind: "ORDER_CLOSED" } as const;

  const assignment = await transaction.ordenTecnico.findFirst({
    where: { ordenId: id, tecnicoId: technicianId, unassignedAt: null },
    select: { id: true, role: true },
  });
  if (!assignment) {
    const historicalAssignment = await transaction.ordenTecnico.findFirst({
      where: { ordenId: id, tecnicoId: technicianId },
      select: { id: true },
    });
    return historicalAssignment === null
      ? { kind: "ASSIGNMENT_NOT_FOUND" } as const
      : { kind: "TECHNICIAN_NOT_ASSIGNED" } as const;
  }
  if (
    assignment.role === "PRIMARY" &&
    locked.status !== "PENDING" &&
    locked.status !== "ASSIGNED"
  ) {
    return { kind: "INVALID_ORDER_TRANSITION" } as const;
  }

  const before = await loadOrderDetail(transaction, id);
  await transaction.ordenTecnico.update({
    where: { id: assignment.id },
    data: { unassignedAt: now },
  });
  const nextStatus =
    assignment.role === "PRIMARY" && locked.status === "ASSIGNED"
      ? "PENDING"
      : locked.status;
  if (!(await updateOrderForAssignment(transaction, id, input.version, nextStatus, now))) {
    return { kind: "VERSION_CONFLICT" } as const;
  }

  const order = await loadOrderDetail(transaction, id);
  await writeAssignmentTrail(
    transaction,
    before,
    order,
    actor,
    now,
    "ORDER_UNASSIGNED",
    { technicianId, role: assignment.role, version: order.version },
    input.reason,
  );
  return { kind: "UPDATED", order } as const;
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

  const parentsChanged =
    (input.branchId !== undefined && input.branchId !== locked.branchId) ||
    (input.serviceTypeId !== undefined &&
      input.serviceTypeId !== locked.serviceTypeId);
  if (
    parentsChanged &&
    !(await hasActiveParents(
      transaction,
      input.branchId ?? locked.branchId,
      input.serviceTypeId ?? locked.serviceTypeId,
    ))
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
): OrdersMutationRepository {
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

    async assignTechnician(id, input, actor, now) {
      return runSerializableTransaction(
        database,
        (transaction) => assignTechnician(transaction, id, input, actor, now),
      );
    },

    async unassignTechnician(id, technicianId, input, actor, now) {
      return runSerializableTransaction(
        database,
        (transaction) =>
          unassignTechnician(transaction, id, technicianId, input, actor, now),
      );
    },
  };
}
