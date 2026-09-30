import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { PerformanceAnalyticsRepository, PerformanceSnapshotInput } from "./performance-analytics.repository.types.js";

const minute = 60_000;

function orderWhere(input: PerformanceSnapshotInput): Prisma.OrdenTrabajoWhereInput {
  const { query, period, scope } = input;
  return {
    deletedAt: null,
    sucursal: { is: { deletedAt: null, isActive: true, cliente: { is: { deletedAt: null, isActive: true } } } },
    ...(query.clientId ? { sucursal: { is: { ...(query.branchId ? { id: query.branchId } : {}), clienteId: query.clientId, deletedAt: null, isActive: true, cliente: { is: { deletedAt: null, isActive: true } } } } } : {}),
    ...(query.branchId && !query.clientId ? { sucursalId: query.branchId } : {}),
    ...(query.serviceTypeId ? { tipoServicioId: query.serviceTypeId } : {}),
    ...(query.orderStatus ? { status: query.orderStatus } : {}),
    ...(scope.kind === "TECHNICIAN" ? { AND: [{ OR: [{ tecnicos: { some: { tecnicoId: scope.technicianId } } }, { actividades: { some: { tecnicos: { some: { tecnicoId: scope.technicianId } } } } }] }] } : {}),
    OR: [
      { endedAt: { gte: period.startInclusive, lt: period.endExclusive } },
      { status: "CANCELLED", updatedAt: { gte: period.startInclusive, lt: period.endExclusive } },
    ],
  };
}

function activityPauseMinutes(activity: { pausedMinutes: number; pausas: Array<{ startedAt: Date; endedAt: Date | null }> }): number {
  const captured = activity.pausas.reduce((total, pause) => total + (pause.endedAt ? Math.max(0, Math.round((pause.endedAt.getTime() - pause.startedAt.getTime()) / minute)) : 0), 0);
  return captured || activity.pausedMinutes;
}

export function createPerformanceAnalyticsRepository(database: PrismaClient): PerformanceAnalyticsRepository {
  return {
    async readSnapshot(input) {
      return database.$transaction(async (transaction) => {
        const technicianWhere = {
          deletedAt: null,
          status: { not: "INACTIVE" as const },
          ...(input.scope.kind === "TECHNICIAN" ? { id: input.scope.technicianId } : {}),
          ...(input.query.technicianId ? { id: input.query.technicianId } : {}),
        };
        const scopedOrderWhere = orderWhere(input);
        const activityWhere: Prisma.ActividadWhereInput = {
          status: "COMPLETED",
          deletedAt: null,
          endedAt: { gte: input.period.startInclusive, lt: input.period.endExclusive },
          sucursal: { is: { deletedAt: null, isActive: true, cliente: { is: { deletedAt: null, isActive: true } } } },
          AND: [{ OR: [{ ordenId: null }, { orden: { is: { deletedAt: null } } }] }],
          ...(input.scope.kind === "TECHNICIAN" ? { tecnicos: { some: { tecnicoId: input.scope.technicianId } } } : {}),
          ...(input.query.technicianId ? { tecnicos: { some: { tecnicoId: input.query.technicianId } } } : {}),
          ...(input.query.branchId ? { sucursalId: input.query.branchId } : {}),
          ...(input.query.clientId ? { sucursal: { is: { clienteId: input.query.clientId, deletedAt: null, isActive: true, cliente: { is: { deletedAt: null, isActive: true } } } } } : {}),
          ...(input.query.serviceTypeId || input.query.orderStatus ? { orden: { is: { deletedAt: null, ...(input.query.serviceTypeId ? { tipoServicioId: input.query.serviceTypeId } : {}), ...(input.query.orderStatus ? { status: input.query.orderStatus } : {}) } } } : {}),
        };
        const [technicians, orders, activities, recurrences, officialResults] = await Promise.all([
          transaction.tecnico.findMany({ where: technicianWhere, select: { id: true, code: true, fullName: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }] }),
          transaction.ordenTrabajo.findMany({ where: scopedOrderWhere, select: { id: true, status: true, scheduledFor: true, endedAt: true, totalMinutes: true }, orderBy: [{ endedAt: "asc" }, { id: "asc" }] }),
          transaction.actividad.findMany({ where: activityWhere, select: { id: true, ordenId: true, startedAt: true, endedAt: true, pausedMinutes: true, productiveMinutes: true, tecnicos: { select: { tecnicoId: true, participationPercentage: true } }, pausas: { select: { startedAt: true, endedAt: true } } }, orderBy: [{ endedAt: "asc" }, { id: "asc" }] }),
          transaction.reincidencia.findMany({ where: { status: "CLOSED", responsibility: "TECHNICAL_WORK", ordenOriginal: { is: scopedOrderWhere } }, select: { id: true, originalOrderId: true, tecnicos: { where: { affectsQuality: true }, select: { tecnicoId: true } } }, orderBy: { id: "asc" } }),
          transaction.resultadoKPI.findMany({ where: { isCurrent: true, periodStart: { gte: new Date(`${input.period.periodStart}T00:00:00.000Z`) }, periodEnd: { lte: new Date(`${input.period.periodEnd}T00:00:00.000Z`) }, ...(input.scope.kind === "TECHNICIAN" ? { tecnicoId: input.scope.technicianId } : {}), ...(input.query.technicianId ? { tecnicoId: input.query.technicianId } : {}) }, orderBy: [{ periodStart: "asc" }, { tecnicoId: "asc" }] }),
        ]);
        const allowedIds = new Set(technicians.map(({ id }) => id));
        return {
          technicians,
          orders,
          activities: activities.flatMap((activity) => {
            if (!activity.startedAt || !activity.endedAt) return [];
            const pausedMinutes = activityPauseMinutes(activity);
            const grossMinutes = Math.max(0, Math.round((activity.endedAt.getTime() - activity.startedAt.getTime()) / minute) - pausedMinutes);
            return activity.tecnicos.filter(({ tecnicoId }) => allowedIds.has(tecnicoId)).map(({ tecnicoId, participationPercentage }) => {
              const ratio = participationPercentage.toNumber() / 100;
              return { id: `${activity.id}:${tecnicoId}`, orderId: activity.ordenId, technicianId: tecnicoId, registeredMinutes: Math.round(grossMinutes * ratio), productiveMinutes: activity.productiveMinutes === null ? null : Math.round(activity.productiveMinutes * ratio), pausedMinutes: Math.round(pausedMinutes * ratio) };
            });
          }),
          recurrences: recurrences.map((recurrence) => ({ id: recurrence.id, originalOrderId: recurrence.originalOrderId, technicianIds: recurrence.tecnicos.map(({ tecnicoId }) => tecnicoId).filter((id) => allowedIds.has(id)) })).filter((recurrence) => recurrence.technicianIds.length > 0),
          officialResults,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    },
  };
}
