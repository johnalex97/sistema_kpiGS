import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  recurrenceCauseSelect,
  recurrenceDetailSelect,
  recurrenceSummarySelect,
  type PageRecord,
  type RecurrenceCauseRecord,
  type RecurrenceDetailRecord,
  type RecurrenceSummaryRecord,
  type RecurrencesRepository,
} from "./recurrences.repository.types.js";
import type {
  RecurrenceAccessScope,
  RecurrenceListFilters,
} from "./recurrences.types.js";

type RecurrencesReadRepository = Pick<
  RecurrencesRepository,
  "listCauses" | "listRecurrences" | "findRecurrence"
>;

const consistentReadOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

function scopedRecurrenceWhere(
  scope: RecurrenceAccessScope,
): Prisma.ReincidenciaWhereInput {
  if (scope.kind === "ALL") return {};

  return {
    OR: [
      { reportedBy: { tecnico: { id: scope.technicianId } } },
      { tecnicos: { some: { tecnicoId: scope.technicianId } } },
    ],
  };
}

function listRecurrenceWhere(
  filters: RecurrenceListFilters,
  scope: RecurrenceAccessScope,
): Prisma.ReincidenciaWhereInput {
  const constraints: Prisma.ReincidenciaWhereInput[] = [
    scopedRecurrenceWhere(scope),
  ];

  if (filters.status) constraints.push({ status: { in: filters.status } });
  if (filters.impact) constraints.push({ impact: { in: filters.impact } });
  if (filters.responsibility) {
    constraints.push({ responsibility: { in: filters.responsibility } });
  }
  if (filters.originalOrderId) {
    constraints.push({ originalOrderId: filters.originalOrderId });
  }
  if (filters.technicianId) {
    constraints.push({ tecnicos: { some: { tecnicoId: filters.technicianId } } });
  }
  if (filters.detectedFrom || filters.detectedTo) {
    constraints.push({
      detectedAt: {
        ...(filters.detectedFrom && { gte: filters.detectedFrom }),
        ...(filters.detectedTo && { lte: filters.detectedTo }),
      },
    });
  }
  if (filters.search) {
    constraints.push({
      OR: [
        { recurrenceNumber: { contains: filters.search, mode: "insensitive" } },
        { detectedProblem: { contains: filters.search, mode: "insensitive" } },
        { ordenOriginal: { orderNumber: { contains: filters.search, mode: "insensitive" } } },
        { ordenOriginal: { sucursal: { name: { contains: filters.search, mode: "insensitive" } } } },
        { ordenOriginal: { sucursal: { cliente: { tradeName: { contains: filters.search, mode: "insensitive" } } } } },
      ],
    });
  }

  return { AND: constraints };
}

async function loadRecurrencePage(
  transaction: Prisma.TransactionClient,
  where: Prisma.ReincidenciaWhereInput,
  filters: RecurrenceListFilters,
): Promise<PageRecord<RecurrenceSummaryRecord>> {
  const items = await transaction.reincidencia.findMany({
    where,
    select: recurrenceSummarySelect,
    orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });
  const totalItems = await transaction.reincidencia.count({ where });
  return { items: items as RecurrenceSummaryRecord[], totalItems };
}

export function createRecurrencesReadRepository(
  database: PrismaClient,
): RecurrencesReadRepository {
  return {
    async listCauses(): Promise<RecurrenceCauseRecord[]> {
      const records = await database.causaReincidencia.findMany({
        where: { isActive: true, deletedAt: null },
        select: recurrenceCauseSelect,
        orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
      });
      return records as RecurrenceCauseRecord[];
    },

    async listRecurrences(filters, scope) {
      const where = listRecurrenceWhere(filters, scope);
      return database.$transaction(
        (transaction) => loadRecurrencePage(transaction, where, filters),
        consistentReadOptions,
      );
    },

    async findRecurrence(id, scope) {
      const record = await database.reincidencia.findFirst({
        where: { AND: [{ id }, scopedRecurrenceWhere(scope)] },
        select: recurrenceDetailSelect,
      });
      return record as RecurrenceDetailRecord | null;
    },
  };
}
