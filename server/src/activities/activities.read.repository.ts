import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  activityDetailSelect,
  activitySummarySelect,
  activityTypeSelect,
} from "./activities.repository.types.js";
import type {
  ActivitiesReadRepository,
  ActivityDetailRecord,
  ActivitySummaryRecord,
  ActivityTypeRecord,
  PageRecord,
} from "./activities.repository.types.js";
import type {
  ActivityAccessScope,
  ActivityListFilters,
} from "./activities.types.js";

const consistentReadOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

function visibleActivityWhere(
  scope: ActivityAccessScope,
): Prisma.ActividadWhereInput {
  return {
    deletedAt: null,
    sucursal: { deletedAt: null, cliente: { deletedAt: null } },
    tipoActividad: { deletedAt: null },
    AND: [
      { OR: [{ ordenId: null }, { orden: { deletedAt: null } }] },
      ...(scope.kind === "TECHNICIAN" ? [{
        OR: [
          { tecnicos: { some: { tecnicoId: scope.technicianId } } },
          { visibilidadTecnicos: { some: { tecnicoId: scope.technicianId } } },
        ],
      }] : []),
    ],
  };
}

function listActivityWhere(
  filters: ActivityListFilters,
  scope: ActivityAccessScope,
): Prisma.ActividadWhereInput {
  const constraints: Prisma.ActividadWhereInput[] = [visibleActivityWhere(scope)];
  if (filters.status) constraints.push({ status: { in: filters.status } });
  if (filters.activityTypeId) constraints.push({ tipoActividadId: filters.activityTypeId });
  if (filters.clientId) constraints.push({ sucursal: { clienteId: filters.clientId } });
  if (filters.branchId) constraints.push({ sucursalId: filters.branchId });
  if (filters.orderId) constraints.push({ ordenId: filters.orderId });
  if (filters.technicianId) {
    constraints.push({ tecnicos: { some: { tecnicoId: filters.technicianId } } });
  }
  if (filters.startedFrom || filters.startedTo) {
    constraints.push({
      startedAt: {
        ...(filters.startedFrom && { gte: filters.startedFrom }),
        ...(filters.startedTo && { lte: filters.startedTo }),
      },
    });
  }
  if (filters.search) {
    constraints.push({
      OR: [
        { description: { contains: filters.search, mode: "insensitive" } },
        { result: { contains: filters.search, mode: "insensitive" } },
        { orden: { orderNumber: { contains: filters.search, mode: "insensitive" } } },
        { sucursal: { cliente: { tradeName: { contains: filters.search, mode: "insensitive" } } } },
        { tecnicos: { some: { tecnico: { code: { contains: filters.search, mode: "insensitive" } } } } },
        { tecnicos: { some: { tecnico: { fullName: { contains: filters.search, mode: "insensitive" } } } } },
      ],
    });
  }
  return { AND: constraints };
}

async function loadActivityPage(
  transaction: Prisma.TransactionClient,
  where: Prisma.ActividadWhereInput,
  filters: ActivityListFilters,
): Promise<PageRecord<ActivitySummaryRecord>> {
  const items = await transaction.actividad.findMany({
    where,
    select: activitySummarySelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });
  const totalItems = await transaction.actividad.count({ where });
  return { items: items as ActivitySummaryRecord[], totalItems };
}

export function createActivitiesReadRepository(
  database: PrismaClient,
): ActivitiesReadRepository {
  return {
    async listActivityTypes(): Promise<ActivityTypeRecord[]> {
      const records = await database.tipoActividad.findMany({
        where: { isActive: true, deletedAt: null },
        select: activityTypeSelect,
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      });
      return records as ActivityTypeRecord[];
    },

    async listActivities(filters, scope) {
      const where = listActivityWhere(filters, scope);
      return database.$transaction(
        (transaction) => loadActivityPage(transaction, where, filters),
        consistentReadOptions,
      );
    },

    async findActivityById(id, scope) {
      const record = await database.actividad.findFirst({
        where: { AND: [{ id }, visibleActivityWhere(scope)] },
        select: activityDetailSelect,
      });
      return record as ActivityDetailRecord | null;
    },
  };
}
