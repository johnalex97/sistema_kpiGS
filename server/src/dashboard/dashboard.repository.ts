import { Prisma } from "../../generated/prisma/client.js";
import type { EstadoReincidencia, PrismaClient } from "../../generated/prisma/client.js";
import type { DashboardReadRepository } from "./dashboard.repository.types.js";

const readOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

const openRecurrenceStatuses: EstadoReincidencia[] = ["OPEN", "ANALYSIS", "CORRECTION"];

export function createDashboardReadRepository(database: PrismaClient): DashboardReadRepository {
  return {
    async readOperationalDashboard(input) {
      const recurrenceScope = {
        status: { in: openRecurrenceStatuses },
        ...(input.recurrenceTechnicianId && {
          OR: [
            { tecnicos: { some: { tecnicoId: input.recurrenceTechnicianId } } },
            { reportedBy: { tecnico: { id: input.recurrenceTechnicianId } } },
          ],
        }),
      };
      return database.$transaction(async (transaction) => {
        const [team, activities, recurrences] = await Promise.all([
          input.includeTeam
            ? transaction.tecnico.findMany({
              where: { deletedAt: null, status: { not: "INACTIVE" }, ...(input.activityTechnicianId ? { id: input.activityTechnicianId } : {}) },
              select: { id: true, code: true, fullName: true, specialty: true, status: true, actividades: { where: { actividad: { deletedAt: null, status: { in: ["IN_PROGRESS", "PAUSED"] }, tipoActividad: { deletedAt: null }, sucursal: { deletedAt: null, isActive: true, cliente: { deletedAt: null, isActive: true } }, AND: [{ OR: [{ ordenId: null }, { orden: { is: { deletedAt: null } } }] }] } }, take: 1, select: { actividad: { select: { status: true, description: true, startedAt: true, pausedMinutes: true, pausas: { where: { startedAt: { lte: input.generatedAt } }, orderBy: [{ startedAt: "asc" }, { id: "asc" }], select: { startedAt: true, endedAt: true } }, tipoActividad: { select: { name: true } }, sucursal: { select: { name: true, cliente: { select: { tradeName: true } } } } } } } } },
              orderBy: [{ fullName: "asc" }, { id: "asc" }],
            })
            : [],
          transaction.actividad.findMany({
            where: {
              deletedAt: null,
              sucursal: {
                deletedAt: null,
                isActive: true,
                cliente: { deletedAt: null, isActive: true },
              },
              tipoActividad: { deletedAt: null },
              OR: [
                { startedAt: { gte: input.start, lt: input.end } },
                { updatedAt: { gte: input.start, lt: input.end } },
              ],
              AND: [
                { OR: [{ ordenId: null }, { orden: { is: { deletedAt: null } } }] },
                ...(input.activityTechnicianId ? [{
                  OR: [
                    { tecnicos: { some: { tecnicoId: input.activityTechnicianId } } },
                    { visibilidadTecnicos: { some: { tecnicoId: input.activityTechnicianId } } },
                  ],
                }] : []),
              ],
            },
            select: {
              id: true, status: true, description: true, startedAt: true, endedAt: true,
              pausedMinutes: true, productiveMinutes: true, updatedAt: true,
              tipoActividad: { select: { code: true, name: true } },
              sucursal: { select: { name: true, cliente: { select: { tradeName: true } } } },
              orden: {
                select: {
                  orderNumber: true,
                  ...(input.includeRecurrences && {
                    reincidenciasOriginales: { where: recurrenceScope, select: { id: true } },
                    visitasReincidencia: {
                      where: { reincidencia: recurrenceScope },
                      select: { id: true },
                    },
                  }),
                },
              },
              tecnicos: { where: { role: "RESPONSIBLE" }, take: 1, select: { tecnico: { select: { fullName: true } } } },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 5,
          }),
          input.includeRecurrences
            ? transaction.reincidencia.findMany({
              where: {
                ...recurrenceScope,
                ordenOriginal: { deletedAt: null, sucursal: { deletedAt: null, isActive: true, cliente: { deletedAt: null, isActive: true } } },
              },
              select: {
                id: true, recurrenceNumber: true, detectedProblem: true, status: true,
                impact: true,
                updatedAt: true,
                ordenes: { select: { id: true } },
                ordenOriginal: { select: { sucursal: { select: { cliente: { select: { tradeName: true } } } } } },
                tecnicos: { select: { tecnico: { select: { fullName: true } } } },
              },
              orderBy: [{ impact: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
            })
            : [],
        ]);
        return { team, activities, recurrences };
      }, readOptions);
    },
  };
}
