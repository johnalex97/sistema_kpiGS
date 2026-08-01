import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  OrderDetailRecord,
  OrderHistoryRecord,
  OrderSummaryRecord,
  OrdersReadRepository,
  PageRecord,
} from "./orders.repository.types.js";
import { orderDetailSelect } from "./orders.repository.types.js";
import type {
  OrderAccessScope,
  OrderListFilters,
} from "./orders.types.js";

const terminalStatuses = ["COMPLETED", "CANCELLED"] as const;
const consistentReadOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

const orderSummaryBaseSelect = {
  id: true,
  orderNumber: true,
  sucursalId: true,
  tipoServicioId: true,
  priority: true,
  status: true,
  reportedProblem: true,
  scheduledFor: true,
  startedAt: true,
  endedAt: true,
  estimatedMinutes: true,
  totalMinutes: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const satisfies Prisma.OrdenTrabajoSelect;

const orderHistoryBaseSelect = {
  id: true,
  previousStatus: true,
  newStatus: true,
  action: true,
  comment: true,
  occurredAt: true,
  metadata: true,
  userId: true,
} as const satisfies Prisma.HistorialOrdenSelect;

async function loadOrderSummaryPage(
  transaction: Prisma.TransactionClient,
  where: Prisma.OrdenTrabajoWhereInput,
  filters: OrderListFilters,
): Promise<PageRecord<OrderSummaryRecord>> {
  const orders = await transaction.ordenTrabajo.findMany({
    where,
    select: orderSummaryBaseSelect,
    orderBy: [
      { scheduledFor: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "asc" },
    ],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });
  const totalItems = await transaction.ordenTrabajo.count({ where });
  if (orders.length === 0) return { items: [], totalItems };

  const branchIds = [...new Set(orders.map((order) => order.sucursalId))];
  const branches = await transaction.sucursalCliente.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, code: true, name: true, clienteId: true },
  });
  const clientIds = [...new Set(branches.map((branch) => branch.clienteId))];
  const clients = await transaction.cliente.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, code: true, tradeName: true },
  });
  const serviceTypeIds = [
    ...new Set(orders.map((order) => order.tipoServicioId)),
  ];
  const serviceTypes = await transaction.tipoServicio.findMany({
    where: { id: { in: serviceTypeIds } },
    select: { id: true, code: true, name: true },
  });
  const orderIds = orders.map((order) => order.id);
  const primaryAssignments = await transaction.ordenTecnico.findMany({
    where: {
      ordenId: { in: orderIds },
      role: "PRIMARY",
      unassignedAt: null,
    },
    select: { ordenId: true, tecnicoId: true, role: true, unassignedAt: true },
    orderBy: [{ assignedAt: "desc" }, { id: "asc" }],
  });
  const supportCounts = await transaction.ordenTecnico.groupBy({
    by: ["ordenId"],
    where: {
      ordenId: { in: orderIds },
      role: "SUPPORT",
      unassignedAt: null,
    },
    _count: { _all: true },
  });
  const technicianIds = [
    ...new Set(primaryAssignments.map((assignment) => assignment.tecnicoId)),
  ];
  const technicians = await transaction.tecnico.findMany({
    where: { id: { in: technicianIds } },
    select: { id: true, code: true, fullName: true },
  });

  const branchesById = new Map(branches.map((branch) => [branch.id, branch]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const serviceTypesById = new Map(
    serviceTypes.map((serviceType) => [serviceType.id, serviceType]),
  );
  const techniciansById = new Map(
    technicians.map((technician) => [technician.id, technician]),
  );
  const primaryByOrderId = new Map<string, (typeof primaryAssignments)[number]>();
  for (const assignment of primaryAssignments) {
    if (!primaryByOrderId.has(assignment.ordenId)) {
      primaryByOrderId.set(assignment.ordenId, assignment);
    }
  }
  const supportCountByOrderId = new Map(
    supportCounts.map((count) => [count.ordenId, count._count._all]),
  );

  return {
    totalItems,
    items: orders.map((order) => {
      const branch = branchesById.get(order.sucursalId)!;
      const client = clientsById.get(branch.clienteId)!;
      const primary = primaryByOrderId.get(order.id);
      const technician = primary
        ? techniciansById.get(primary.tecnicoId)
        : undefined;
      return {
        ...order,
        sucursal: { id: branch.id, code: branch.code, name: branch.name, cliente: client },
        tipoServicio: serviceTypesById.get(order.tipoServicioId)!,
        tecnicos: primary && technician
          ? [{ role: primary.role, unassignedAt: primary.unassignedAt, tecnico: technician }]
          : [],
        _count: { tecnicos: supportCountByOrderId.get(order.id) ?? 0 },
      };
    }) as OrderSummaryRecord[],
  };
}

async function loadOrderHistoryPage(
  transaction: Prisma.TransactionClient,
  where: Prisma.HistorialOrdenWhereInput,
  filters: { page: number; pageSize: number },
): Promise<PageRecord<OrderHistoryRecord>> {
  const histories = await transaction.historialOrden.findMany({
    where,
    select: orderHistoryBaseSelect,
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });
  const totalItems = await transaction.historialOrden.count({ where });
  const userIds = histories.flatMap((history) =>
    history.userId === null ? [] : [history.userId],
  );
  const users = await transaction.usuario.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));
  return {
    totalItems,
    items: histories.map((history) => ({
      ...history,
      usuario: history.userId ? usersById.get(history.userId) ?? null : null,
    })) as OrderHistoryRecord[],
  };
}

function scopedOrderWhere(scope: OrderAccessScope): Prisma.OrdenTrabajoWhereInput {
  return {
    deletedAt: null,
    ...(scope.kind === "TECHNICIAN" && {
      tecnicos: { some: { tecnicoId: scope.technicianId } },
    }),
  };
}

function listOrderWhere(
  filters: OrderListFilters,
  scope: OrderAccessScope,
  now: Date,
): Prisma.OrdenTrabajoWhereInput {
  const constraints: Prisma.OrdenTrabajoWhereInput[] = [];
  if (filters.technicianId) {
    constraints.push({ tecnicos: { some: { tecnicoId: filters.technicianId } } });
  }
  if (filters.overdue === true) {
    constraints.push({
      scheduledFor: { lt: now },
      status: { notIn: [...terminalStatuses] },
    });
  }
  if (filters.overdue === false) {
    constraints.push({
      OR: [
        { scheduledFor: null },
        { scheduledFor: { gte: now } },
        { status: { in: [...terminalStatuses] } },
      ],
    });
  }

  return {
    ...scopedOrderWhere(scope),
    ...(filters.clientId && { sucursal: { clienteId: filters.clientId } }),
    ...(filters.branchId && { sucursalId: filters.branchId }),
    ...(filters.serviceTypeId && { tipoServicioId: filters.serviceTypeId }),
    ...(filters.status && { status: { in: filters.status } }),
    ...(filters.priority && { priority: { in: filters.priority } }),
    ...((filters.scheduledFrom || filters.scheduledTo) && {
      scheduledFor: {
        ...(filters.scheduledFrom && { gte: filters.scheduledFrom }),
        ...(filters.scheduledTo && { lte: filters.scheduledTo }),
      },
    }),
    ...(filters.search && {
      OR: [
        { orderNumber: { contains: filters.search, mode: "insensitive" } },
        { reportedProblem: { contains: filters.search, mode: "insensitive" } },
        { sucursal: { name: { contains: filters.search, mode: "insensitive" } } },
        {
          sucursal: {
            cliente: { tradeName: { contains: filters.search, mode: "insensitive" } },
          },
        },
      ],
    }),
    ...(constraints.length > 0 && { AND: constraints }),
  };
}

export function createOrdersReadRepository(
  database: PrismaClient,
): OrdersReadRepository {
  return {
    async listOrders(filters, scope, now) {
      const where = listOrderWhere(filters, scope, now);
      return database.$transaction(
        (transaction) => loadOrderSummaryPage(transaction, where, filters),
        consistentReadOptions,
      );
    },

    async findOrderById(id, scope) {
      const record = await database.ordenTrabajo.findFirst({
        where: { id, ...scopedOrderWhere(scope) },
        select: orderDetailSelect,
      });
      return record as OrderDetailRecord | null;
    },

    async listOrderHistory(id, filters, scope) {
      const visibleOrder = await database.ordenTrabajo.findFirst({
        where: { id, ...scopedOrderWhere(scope) },
        select: { id: true },
      });
      if (!visibleOrder) return null;

      const where: Prisma.HistorialOrdenWhereInput = { ordenId: id };
      return database.$transaction(
        (transaction) => loadOrderHistoryPage(transaction, where, filters),
        consistentReadOptions,
      );
    },
  };
}
