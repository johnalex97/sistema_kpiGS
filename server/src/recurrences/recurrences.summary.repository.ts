import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { RecurrencesRepository } from "./recurrences.repository.types.js";
import { recurrenceWhere } from "./recurrences.read.repository.js";
import type {
  RecurrenceAccessScope,
  RecurrenceSummaryFilters,
} from "./recurrences.types.js";

type RecurrencesSummaryRepository = Pick<RecurrencesRepository, "summarizeRecurrences">;

function baseOrderWhere(
  filters: RecurrenceSummaryFilters,
  scope: RecurrenceAccessScope,
): Prisma.OrdenTrabajoWhereInput {
  const constraints: Prisma.OrdenTrabajoWhereInput[] = [
    { status: "COMPLETED", deletedAt: null },
  ];

  if (filters.detectedFrom || filters.detectedTo) {
    constraints.push({
      endedAt: {
        ...(filters.detectedFrom && { gte: filters.detectedFrom }),
        ...(filters.detectedTo && { lte: filters.detectedTo }),
      },
    });
  }
  if (filters.clientId) {
    constraints.push({ sucursal: { clienteId: filters.clientId } });
  }
  if (filters.branchId) {
    constraints.push({ sucursalId: filters.branchId });
  }
  if (filters.technicianId) {
    constraints.push({ tecnicos: { some: { tecnicoId: filters.technicianId } } });
  }
  if (scope.kind === "TECHNICIAN") {
    constraints.push({ tecnicos: { some: { tecnicoId: scope.technicianId } } });
  }

  return { AND: constraints };
}

export function createRecurrencesSummaryRepository(
  database: PrismaClient,
): RecurrencesSummaryRepository {
  return {
    async summarizeRecurrences(filters, scope) {
      const where = recurrenceWhere(filters, scope);
      const [totals, openCases, highImpactCases, additionalVisits, completedBaseOrders] =
        await database.$transaction([
          database.reincidencia.aggregate({
            where,
            _count: { _all: true },
            _sum: { additionalMinutes: true, estimatedCost: true },
          }),
          database.reincidencia.count({
            where: {
              AND: [where, { status: { in: ["OPEN", "ANALYSIS", "CORRECTION"] } }],
            },
          }),
          database.reincidencia.count({
            where: { AND: [where, { impact: "HIGH" }] },
          }),
          database.reincidenciaOrden.count({
            where: { reincidencia: where },
          }),
          database.ordenTrabajo.count({
            where: baseOrderWhere(filters, scope),
          }),
        ]);
      const totalCases = totals._count._all;
      const estimatedCost = totals._sum.estimatedCost ?? new Prisma.Decimal(0);
      const recurrenceRate = completedBaseOrders === 0
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(totalCases).mul(100).div(completedBaseOrders);

      return {
        totalCases,
        openCases,
        highImpactCases,
        additionalVisits,
        additionalMinutes: totals._sum.additionalMinutes ?? 0,
        estimatedCost: estimatedCost.toFixed(2),
        completedBaseOrders,
        recurrenceRate: recurrenceRate.toFixed(2),
      };
    },
  };
}
