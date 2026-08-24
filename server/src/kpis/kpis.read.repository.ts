import type { PrismaClient } from "../../generated/prisma/client.js";
import { ApiError } from "../utils/api-error.js";
import type { KpiFactsRepository } from "./kpis.repository.types.js";

const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function createKpiReadRepository(database: PrismaClient): KpiFactsRepository {
  return {
    async loadWeeklySources(week, scope) {
      const periodStart = dateOnly(week.periodStart);
      const periodEnd = dateOnly(week.periodEnd);
      const technicians = await database.tecnico.findMany({
        where: {
          deletedAt: null,
          status: { not: "INACTIVE" },
          ...(scope.kind === "TECHNICIAN" ? { id: scope.technicianId } : {}),
        },
        select: {
          id: true,
          code: true,
          fullName: true,
          metas: {
            where: { periodStart, periodEnd },
            select: { targetJobs: true },
            take: 1,
          },
        },
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
      });
      const technicianIds = technicians.map(({ id }) => id);
      const [configuration, orders, recurrences] = await Promise.all([
        database.configuracionKPI.findFirst({
          where: {
            isActive: true,
            validFrom: { lte: periodStart },
            OR: [{ validTo: null }, { validTo: { gte: periodStart } }],
          },
          orderBy: [{ validFrom: "desc" }, { version: "desc" }],
        }),
        database.ordenTrabajo.findMany({
          where: {
            status: "COMPLETED",
            deletedAt: null,
            endedAt: { gte: week.startInclusive, lt: week.endExclusive },
          },
          select: {
            id: true,
            scheduledFor: true,
            endedAt: true,
            actividades: {
              where: { status: "COMPLETED", deletedAt: null },
              select: {
                id: true,
                startedAt: true,
                endedAt: true,
                pausedMinutes: true,
                productiveMinutes: true,
                tecnicos: {
                  where: { tecnicoId: { in: technicianIds } },
                  select: { tecnicoId: true, participationPercentage: true },
                },
              },
            },
          },
        }),
        database.reincidencia.findMany({
          where: {
            status: "CLOSED",
            responsibility: "TECHNICAL_WORK",
            ordenOriginal: {
              endedAt: { gte: week.startInclusive, lt: week.endExclusive },
              deletedAt: null,
            },
          },
          select: {
            id: true,
            originalOrderId: true,
            tecnicos: {
              where: { affectsQuality: true, tecnicoId: { in: technicianIds } },
              select: { tecnicoId: true },
            },
          },
        }),
      ]);
      if (!configuration) {
        throw new ApiError(409, "No existe una configuración KPI vigente para la semana", "KPI_CONFIG_MISSING");
      }

      return {
        technicians: technicians.map((technician) => ({
          id: technician.id,
          code: technician.code,
          fullName: technician.fullName,
          targetJobs: technician.metas[0]?.targetJobs ?? null,
        })),
        weights: {
          productivity: configuration.productivityWeight.toFixed(4),
          compliance: configuration.complianceWeight.toFixed(4),
          efficiency: configuration.efficiencyWeight.toFixed(4),
          quality: configuration.qualityWeight.toFixed(4),
        },
        orders: orders.flatMap((order) => order.endedAt ? [{
          id: order.id,
          scheduledFor: order.scheduledFor,
          endedAt: order.endedAt,
        }] : []),
        activities: orders.flatMap((order) => order.actividades.flatMap((activity) => {
          if (!activity.startedAt || !activity.endedAt) return [];
          const gross = Math.max(0, Math.round(
            (activity.endedAt.getTime() - activity.startedAt.getTime()) / 60_000,
          ) - activity.pausedMinutes);
          const productive = activity.productiveMinutes ?? gross;
          return activity.tecnicos.map((technician) => {
            const ratio = technician.participationPercentage.toNumber() / 100;
            return {
              id: `${activity.id}:${technician.tecnicoId}`,
              orderId: order.id,
              technicianId: technician.tecnicoId,
              registeredMinutes: Math.round(gross * ratio),
              productiveMinutes: Math.round(productive * ratio),
            };
          });
        })),
        recurrences: recurrences.map((recurrence) => ({
          id: recurrence.id,
          originalOrderId: recurrence.originalOrderId,
          attributableTechnicianIds: recurrence.tecnicos.map(({ tecnicoId }) => tecnicoId),
        })),
      };
    },
  };
}
