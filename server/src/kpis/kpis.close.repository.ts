import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { calculateWeeklyKpi } from "./kpis.calculator.js";
import { buildWeeklyFacts } from "./kpis.facts.js";
import { resolveWeek } from "./kpis.period.js";
import { createKpiReadRepository } from "./kpis.read.repository.js";
import type { CloseWeekInput, CloseWeekResult, KpiCloseRepository } from "./kpis.repository.types.js";

const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function serializable<T>(database: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await database.$transaction(operation, txOptions); }
    catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("Unreachable KPI close transaction state");
}

function sameSnapshot(current: { [key: string]: unknown }, data: Record<string, unknown>): boolean {
  const decimalFields = [
    "completedCredits", "eligibleCredits", "onTimeEligibleCredits", "attributableRecurrenceCredits",
    "productivityScore", "complianceScore", "efficiencyScore", "qualityScore", "overallScore",
    "productivityWeight", "complianceWeight", "efficiencyWeight", "qualityWeight",
    "productivityEffectiveWeight", "complianceEffectiveWeight", "efficiencyEffectiveWeight", "qualityEffectiveWeight",
  ];
  for (const key of decimalFields) {
    const left = current[key]; const right = data[key];
    if (left === null || right === null) { if (left !== right) return false; }
    else if (!new Prisma.Decimal(String(left)).equals(new Prisma.Decimal(String(right)))) return false;
  }
  return current.appliedTarget === data.appliedTarget
    && current.registeredMinutes === data.registeredMinutes
    && current.productiveMinutes === data.productiveMinutes
    && current.complianceApplicability === data.complianceApplicability
    && current.qualityApplicability === data.qualityApplicability;
}

export function createKpiCloseRepository(database: PrismaClient, timeZone: string): KpiCloseRepository {
  async function persist(input: CloseWeekInput): Promise<CloseWeekResult> {
    return serializable(database, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.week.periodStart}))`;
      const periodStart = dateOnly(input.week.periodStart);
      const periodEnd = dateOnly(input.week.periodEnd);
      const rows = await createKpiReadRepository(tx).loadWeeklySources(input.week, { kind: "ALL" });
      const configuration = await tx.configuracionKPI.findFirstOrThrow({
        where: { isActive: true, validFrom: { lte: periodStart }, OR: [{ validTo: null }, { validTo: { gte: periodStart } }] },
        orderBy: [{ validFrom: "desc" }, { version: "desc" }],
      });
      const facts = buildWeeklyFacts(rows);
      const warnings = rows.technicians.filter(({ targetJobs }) => targetJobs === null)
        .map(({ id }) => ({ code: "MISSING_TARGET" as const, technicianId: id }));
      const currentRows = await tx.resultadoKPI.findMany({
        where: { periodStart, periodEnd, isCurrent: true }, orderBy: { tecnicoId: "asc" },
      });
      const currentByTechnician = new Map(currentRows.map((result) => [result.tecnicoId, result]));
      const snapshots = rows.technicians.filter(({ targetJobs }) => targetJobs !== null).map((technician) => {
        const fact = facts.get(technician.id)!;
        const calculation = calculateWeeklyKpi(fact);
        return { technician, fact, calculation, data: {
          tecnicoId: technician.id, configuracionId: configuration.id, periodStart, periodEnd,
          completedCredits: fact.completedCredits, appliedTarget: fact.targetJobs,
          registeredMinutes: fact.registeredMinutes, productiveMinutes: fact.productiveMinutes,
          eligibleCredits: fact.eligibleCredits, onTimeEligibleCredits: fact.onTimeEligibleCredits,
          attributableRecurrenceCredits: fact.attributableRecurrenceCredits,
          productivityScore: calculation.scores.productivity, complianceScore: calculation.scores.compliance,
          efficiencyScore: calculation.scores.efficiency, qualityScore: calculation.scores.quality,
          overallScore: calculation.overallScore,
          productivityWeight: rows.weights.productivity, complianceWeight: rows.weights.compliance,
          efficiencyWeight: rows.weights.efficiency, qualityWeight: rows.weights.quality,
          productivityEffectiveWeight: calculation.dimensions.productivity.effectiveWeight,
          complianceEffectiveWeight: calculation.dimensions.compliance.effectiveWeight,
          efficiencyEffectiveWeight: calculation.dimensions.efficiency.effectiveWeight,
          qualityEffectiveWeight: calculation.dimensions.quality.effectiveWeight,
          complianceApplicability: calculation.dimensions.compliance.applicability,
          qualityApplicability: calculation.dimensions.quality.applicability,
        } };
      });
      if (currentRows.length === snapshots.length && snapshots.every(({ technician, data }) => {
        const current = currentByTechnician.get(technician.id);
        return current !== undefined && sameSnapshot(current as unknown as { [key: string]: unknown }, data);
      })) return { kind: "UNCHANGED", results: currentRows, warnings };

      const results = [];
      for (const snapshot of snapshots.sort((a, b) => a.technician.id.localeCompare(b.technician.id))) {
        const previous = currentByTechnician.get(snapshot.technician.id);
        if (previous) await tx.resultadoKPI.update({ where: { id: previous.id }, data: { isCurrent: false } });
        const result = await tx.resultadoKPI.create({ data: {
          ...snapshot.data,
          revision: (previous?.revision ?? 0) + 1,
          isCurrent: true,
          calculationType: input.calculationType ?? (previous ? "AUTOMATIC_REVISION" : "OFFICIAL"),
          ...(input.reason !== undefined && { calculationReason: input.reason }),
          calculatedById: input.actor.userId,
          ...(previous !== undefined && { previousResultId: previous.id }),
          calculationMetadata: {
            orderIds: rows.orders.map(({ id }) => id),
            recurrenceIds: rows.recurrences.map(({ id }) => id),
          },
        } });
        await tx.auditoria.create({ data: {
          userId: input.actor.userId,
          action: previous ? "KPI_RESULT_REVISED" : "KPI_WEEK_CLOSED",
          entity: "resultado_kpi", entityId: result.id,
          afterData: { technicianId: result.tecnicoId, periodStart: input.week.periodStart, revision: result.revision },
          ...(input.reason !== undefined && { reason: input.reason }), requestId: input.actor.requestId,
        } });
        results.push(result);
      }
      return { kind: currentRows.length ? "REVISED" : "CLOSED", results, warnings };
    });
  }

  return {
    closeWeek: persist,
    recalculateWeek: (input) => persist({ ...input, calculationType: input.calculationType ?? "MANUAL_RECALCULATION" }),
    async processRevisionRequests(limit, now) {
      const requests = await database.solicitudRevisionKPI.findMany({ where: { status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "asc" }, take: limit });
      let processed = 0; let failed = 0;
      for (const request of requests) {
        try {
          const order = await database.ordenTrabajo.findUniqueOrThrow({ where: { id: request.originalOrderId }, select: { endedAt: true } });
          if (!order.endedAt) throw new Error("ORDER_WITHOUT_END_DATE");
          const actorId = request.requestedById ?? (await database.usuario.findFirstOrThrow({ where: { status: "ACTIVE" }, select: { id: true } })).id;
          await persist({
            week: resolveWeek(order.endedAt, timeZone),
            actor: { userId: actorId, technicianId: null, permissions: ["KPI_RECALCULATE"], requestId: request.id },
            reason: "Revisión automática por reincidencia técnica cerrada",
            calculationType: "AUTOMATIC_REVISION",
          });
          await database.solicitudRevisionKPI.update({ where: { id: request.id }, data: { status: "PROCESSED", processedAt: now, attempts: { increment: 1 }, lastErrorCode: null } });
          processed += 1;
        } catch (error) {
          await database.solicitudRevisionKPI.update({ where: { id: request.id }, data: { status: "FAILED", attempts: { increment: 1 }, lastErrorCode: error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN" } });
          failed += 1;
        }
      }
      return { processed, failed };
    },
  };
}
