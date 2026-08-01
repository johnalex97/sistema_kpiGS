import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  OrderDetailRecord,
  OrderHistoryRecord,
  OrderSummaryRecord,
  OrdersReadRepository,
} from "./orders.repository.types.js";
import {
  orderDetailSelect,
  orderHistorySelect,
  orderSummarySelect,
} from "./orders.repository.types.js";
import type {
  OrderAccessScope,
  OrderListFilters,
} from "./orders.types.js";

const terminalStatuses = ["COMPLETED", "CANCELLED"] as const;

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
      const items = await database.ordenTrabajo.findMany({
        where,
        select: orderSummarySelect,
        orderBy: [
          { scheduledFor: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
          { id: "asc" },
        ],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      });
      const totalItems = await database.ordenTrabajo.count({ where });
      return { items: items as OrderSummaryRecord[], totalItems };
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
      const items = await database.historialOrden.findMany({
        where,
        select: orderHistorySelect,
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      });
      const totalItems = await database.historialOrden.count({ where });
      return { items: items as OrderHistoryRecord[], totalItems };
    },
  };
}
