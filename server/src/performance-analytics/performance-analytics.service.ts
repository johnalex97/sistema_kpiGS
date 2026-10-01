import { ApiError } from "../utils/api-error.js";
import { consolidateOfficialWeeks } from "../kpis/kpis.consolidation.js";
import { createPerformanceAlerts, type PerformanceAlert, type PerformanceAlertThresholds } from "./performance-analytics.alerts.js";
import { resolvePerformancePeriod } from "./performance-analytics.period.js";
import type { PerformanceAnalyticsRepository } from "./performance-analytics.repository.types.js";
import type { PerformanceAccessScope, PerformanceActorContext, PerformanceAnalyticsQuery } from "./performance-analytics.types.js";
import { hasPerformanceOperationalFilters } from "./performance-analytics.types.js";

export interface PerformanceTechnicianRow {
  technicianId: string; code: string; fullName: string;
  completedJobs: number; registeredMinutes: number; productiveMinutes: number; pausedMinutes: number;
  attributableRecurrences: number; recurrenceRate: number | null;
  overallScore: number | null;
  comparison: number | null;
  officialFacts?: {
    appliedTarget: number;
    completedCredits: number;
    eligibleCredits: number;
    onTimeEligibleCredits: number;
    attributableRecurrenceCredits: number;
    coverage: string;
  };
  dimensions: Record<"productivity" | "compliance" | "efficiency" | "quality", number | null>;
  alerts: PerformanceAlert[];
}

export interface PerformanceAnalyticsSummary {
  status: "OFFICIAL" | "PREVIEW";
  period: { granularity: string; periodStart: string; periodEnd: string };
  teamAverage: number | null;
  rows: PerformanceTechnicianRow[];
  generatedAt: string;
}

function scopeFor(actor: PerformanceActorContext): PerformanceAccessScope {
  if (actor.permissions.includes("KPI_VIEW_ALL")) return { kind: "GLOBAL" };
  if (actor.permissions.includes("KPI_VIEW_OWN") && actor.technicianId) return { kind: "TECHNICIAN", technicianId: actor.technicianId };
  throw new ApiError(403, "No tiene permiso para consultar análisis de rendimiento", "FORBIDDEN");
}

function expectedOfficialWeekStarts(period: { granularity: string; periodStart: string }): string[] {
  if (period.granularity === "WEEK") return [period.periodStart];
  const requested = new Date(`${period.periodStart}T00:00:00.000Z`);
  const start = period.granularity === "MONTH"
    ? new Date(Date.UTC(requested.getUTCFullYear(), requested.getUTCMonth(), 1))
    : new Date(Date.UTC(requested.getUTCFullYear(), 0, 1));
  const end = period.granularity === "MONTH"
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    : new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() - 6);
  while (cursor.getUTCDay() !== 1) cursor.setUTCDate(cursor.getUTCDate() + 1);
  const weeks: string[] = [];
  while (cursor < end) {
    const sunday = new Date(cursor); sunday.setUTCDate(sunday.getUTCDate() + 6);
    if (sunday >= start && sunday < end) weeks.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return weeks;
}

function snapshotThresholds(result: { calculationMetadata: unknown } | undefined): PerformanceAlertThresholds | null {
  if (!result || typeof result.calculationMetadata !== "object" || result.calculationMetadata === null) return null;
  const metadata = result.calculationMetadata as Record<string, unknown>;
  if (metadata.alertThresholdSource !== "SNAPSHOT" || typeof metadata.alertThresholds !== "object" || metadata.alertThresholds === null) return null;
  const raw = metadata.alertThresholds as Record<string, unknown>;
  const keys = ["qualityCriticalThreshold", "recurrenceCriticalThreshold", "productivityAttentionThreshold", "complianceAttentionThreshold", "efficiencyAttentionThreshold"] as const;
  const values = keys.map((key) => Number(raw[key]));
  if (values.some((value) => !Number.isFinite(value))) return null;
  return Object.fromEntries(keys.map((key, index) => [key, values[index]!])) as unknown as PerformanceAlertThresholds;
}

export function createPerformanceAnalyticsService(repository: PerformanceAnalyticsRepository, timeZone: string, now: () => Date = () => new Date()) {
  return {
    async getSummary(query: PerformanceAnalyticsQuery, actor: PerformanceActorContext): Promise<PerformanceAnalyticsSummary> {
      const scope = scopeFor(actor);
      const period = resolvePerformancePeriod(query, timeZone);
      const snapshot = await repository.readSnapshot({ query, period, scope });
      const technicians = scope.kind === "TECHNICIAN" ? snapshot.technicians.filter(({ id }) => id === scope.technicianId) : snapshot.technicians;
      const officialCompatible = !hasPerformanceOperationalFilters(query);
      const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
      const consolidated = officialCompatible ? consolidateOfficialWeeks({
        weeks: snapshot.officialResults.map((result) => ({
          technicianId: result.tecnicoId,
          code: technicianById.get(result.tecnicoId)?.code ?? "",
          fullName: technicianById.get(result.tecnicoId)?.fullName ?? "",
          periodStart: result.periodStart.toISOString().slice(0, 10),
          periodEnd: result.periodEnd.toISOString().slice(0, 10),
          revision: result.revision,
          isCurrent: result.isCurrent,
          appliedTarget: result.appliedTarget,
          completedCredits: result.completedCredits.toFixed(4),
          eligibleCredits: result.eligibleCredits.toFixed(4),
          onTimeEligibleCredits: result.onTimeEligibleCredits.toFixed(4),
          registeredMinutes: result.registeredMinutes,
          productiveMinutes: result.productiveMinutes,
          attributableRecurrenceCredits: result.attributableRecurrenceCredits.toFixed(4),
          overallScore: result.overallScore.toFixed(2),
          qualityScore: result.qualityScore?.toFixed(2) ?? null,
        })),
        expectedWeeks: expectedOfficialWeekStarts(period),
      }) : null;
      const officialByTechnician = new Map(consolidated?.items.map((item) => [item.technicianId, item]) ?? []);
      const rows = technicians.map((technician) => {
        const activities = snapshot.activities.filter(({ technicianId }) => technicianId === technician.id);
        const orderIds = new Set([
          ...activities.map(({ orderId }) => orderId).filter((id): id is string => id !== null),
          ...snapshot.orders.filter(({ technicianIds }) => technicianIds?.includes(technician.id)).map(({ id }) => id),
        ]);
        const orders = snapshot.orders.filter(({ id }) => orderIds.has(id));
        const completedJobs = orders.filter(({ status }) => status === "COMPLETED").length;
        const registeredMinutes = activities.reduce((sum, item) => sum + item.registeredMinutes, 0);
        const productiveMinutes = activities.reduce((sum, item) => sum + (item.productiveMinutes ?? item.registeredMinutes), 0);
        const pausedMinutes = activities.reduce((sum, item) => sum + item.pausedMinutes, 0);
        const attributableRecurrences = snapshot.recurrences.filter((recurrence) => recurrence.technicianIds.includes(technician.id)).length;
        const recurrenceRate = completedJobs === 0 ? null : attributableRecurrences / completedJobs * 100;
        const result = officialByTechnician.get(technician.id);
        const dimensions = result ? { productivity: Number(result.productivityScore), compliance: result.complianceScore === null ? null : Number(result.complianceScore), efficiency: Number(result.efficiencyScore), quality: result.qualityScore === null ? null : Number(result.qualityScore) } : { productivity: null, compliance: null, efficiency: registeredMinutes === 0 ? null : productiveMinutes / registeredMinutes * 100, quality: completedJobs === 0 ? null : Math.max(0, 100 - (recurrenceRate ?? 0)) };
        const overallScore = result ? Number(result.overallScore) : null;
        const previous = officialCompatible ? snapshot.previousResults.find((item) => item.tecnicoId === technician.id) : undefined;
        const comparison = overallScore === null || !previous ? null : overallScore - Number(previous.overallScore.toFixed(2));
        const officialFacts = result ? {
          appliedTarget: result.appliedTarget,
          completedCredits: Number(result.completedCredits),
          eligibleCredits: Number(result.eligibleCredits),
          onTimeEligibleCredits: Number(result.onTimeEligibleCredits),
          attributableRecurrenceCredits: Number(result.attributableRecurrenceCredits),
          coverage: result.coverage,
        } : undefined;
        const officialThresholds = snapshotThresholds(snapshot.officialResults.find((item) => item.tecnicoId === technician.id));
        return { technicianId: technician.id, code: technician.code, fullName: technician.fullName, completedJobs, registeredMinutes, productiveMinutes, pausedMinutes, attributableRecurrences, recurrenceRate, overallScore, comparison, ...(officialFacts ? { officialFacts } : {}), dimensions, alerts: createPerformanceAlerts({ dimensions, applicability: { productivity: dimensions.productivity !== null, compliance: dimensions.compliance !== null, efficiency: dimensions.efficiency !== null, quality: dimensions.quality !== null }, recurrenceRate, hasGoal: Boolean(result), hasData: activities.length > 0 || orders.length > 0, thresholds: officialThresholds ?? snapshot.previewThresholds }) };
      });
      const scores = rows.map((row) => row.overallScore).filter((value): value is number => value !== null);
      return { status: officialCompatible && !consolidated?.warnings.length && scores.length > 0 ? "OFFICIAL" : "PREVIEW", period: { granularity: period.granularity, periodStart: period.periodStart, periodEnd: period.periodEnd }, teamAverage: scope.kind === "GLOBAL" && scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null, rows, generatedAt: now().toISOString() };
    },
  };
}
