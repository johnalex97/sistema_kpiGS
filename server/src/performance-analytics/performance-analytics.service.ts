import { ApiError } from "../utils/api-error.js";
import { createPerformanceAlerts, type PerformanceAlert } from "./performance-analytics.alerts.js";
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

export function createPerformanceAnalyticsService(repository: PerformanceAnalyticsRepository, timeZone: string, now: () => Date = () => new Date()) {
  return {
    async getSummary(query: PerformanceAnalyticsQuery, actor: PerformanceActorContext): Promise<PerformanceAnalyticsSummary> {
      const scope = scopeFor(actor);
      const period = resolvePerformancePeriod(query, timeZone);
      const snapshot = await repository.readSnapshot({ query, period, scope });
      const technicians = scope.kind === "TECHNICIAN" ? snapshot.technicians.filter(({ id }) => id === scope.technicianId) : snapshot.technicians;
      const officialCompatible = !hasPerformanceOperationalFilters(query);
      const rows = technicians.map((technician) => {
        const activities = snapshot.activities.filter(({ technicianId }) => technicianId === technician.id);
        const orderIds = new Set(activities.map(({ orderId }) => orderId).filter((id): id is string => id !== null));
        const orders = snapshot.orders.filter(({ id }) => orderIds.has(id));
        const completedJobs = orders.filter(({ status }) => status === "COMPLETED").length;
        const registeredMinutes = activities.reduce((sum, item) => sum + item.registeredMinutes, 0);
        const productiveMinutes = activities.reduce((sum, item) => sum + (item.productiveMinutes ?? 0), 0);
        const pausedMinutes = activities.reduce((sum, item) => sum + item.pausedMinutes, 0);
        const attributableRecurrences = snapshot.recurrences.filter((recurrence) => recurrence.technicianIds.includes(technician.id)).length;
        const recurrenceRate = completedJobs === 0 ? null : attributableRecurrences / completedJobs * 100;
        const result = officialCompatible ? snapshot.officialResults.find((item) => item.tecnicoId === technician.id && item.periodStart.toISOString().slice(0, 10) === period.periodStart && item.periodEnd.toISOString().slice(0, 10) === period.periodEnd) : undefined;
        const value = (item: { toFixed: (digits: number) => string } | null) => item === null ? null : Number(item.toFixed(2));
        const dimensions = result ? { productivity: value(result.productivityScore), compliance: result.complianceApplicability === "APPLICABLE" ? value(result.complianceScore) : null, efficiency: value(result.efficiencyScore), quality: result.qualityApplicability === "APPLICABLE" ? value(result.qualityScore) : null } : { productivity: null, compliance: null, efficiency: registeredMinutes === 0 ? null : productiveMinutes / registeredMinutes * 100, quality: completedJobs === 0 ? null : Math.max(0, 100 - (recurrenceRate ?? 0)) };
        const overallScore = result ? value(result.overallScore) : null;
        const previous = officialCompatible ? snapshot.previousResults.find((item) => item.tecnicoId === technician.id) : undefined;
        const comparison = overallScore === null || !previous ? null : overallScore - Number(previous.overallScore.toFixed(2));
        return { technicianId: technician.id, code: technician.code, fullName: technician.fullName, completedJobs, registeredMinutes, productiveMinutes, pausedMinutes, attributableRecurrences, recurrenceRate, overallScore, comparison, dimensions, alerts: createPerformanceAlerts({ dimensions, applicability: { productivity: dimensions.productivity !== null, compliance: dimensions.compliance !== null, efficiency: dimensions.efficiency !== null, quality: dimensions.quality !== null }, recurrenceRate, hasGoal: Boolean(result), hasData: activities.length > 0 || orders.length > 0 }) };
      });
      const scores = rows.map((row) => row.overallScore).filter((value): value is number => value !== null);
      return { status: officialCompatible && scores.length > 0 ? "OFFICIAL" : "PREVIEW", period: { granularity: period.granularity, periodStart: period.periodStart, periodEnd: period.periodEnd }, teamAverage: scope.kind === "GLOBAL" && scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null, rows, generatedAt: now().toISOString() };
    },
  };
}
