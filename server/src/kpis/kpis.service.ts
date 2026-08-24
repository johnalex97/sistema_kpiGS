import { ApiError } from "../utils/api-error.js";
import { calculateWeeklyKpi } from "./kpis.calculator.js";
import { buildWeeklyFacts } from "./kpis.facts.js";
import { parseWeekStart } from "./kpis.period.js";
import type { CreateConfigurationInput, CreateTargetInput, UpdateTargetInput } from "./kpis.schemas.js";
import type { KpiPeriodQuery } from "./kpis.schemas.js";
import type { KpiCloseRepository, KpiFactsRepository, KpiAccessScope, KpiManagementRepository, KpiQueryRepository } from "./kpis.repository.types.js";
import type { KpiActorContext } from "./kpis.types.js";
import { mapKpiResult } from "./kpis.mapper.js";
import { consolidateOfficialWeeks } from "./kpis.consolidation.js";

function accessScope(actor: KpiActorContext): KpiAccessScope {
  if (actor.permissions.includes("KPI_VIEW_ALL")) return { kind: "ALL" };
  if (actor.permissions.includes("KPI_VIEW_OWN") && actor.technicianId) {
    return { kind: "TECHNICIAN", technicianId: actor.technicianId };
  }
  throw new ApiError(403, "No tiene permiso para consultar indicadores KPI", "FORBIDDEN");
}

type ServiceRepository = KpiFactsRepository & Partial<KpiManagementRepository & KpiCloseRepository & KpiQueryRepository>;

function requirePermission(actor: KpiActorContext, permission: string): void {
  if (!actor.permissions.includes(permission)) {
    throw new ApiError(403, "No tiene permiso para administrar indicadores KPI", "FORBIDDEN");
  }
}

function management(repository: ServiceRepository): KpiManagementRepository {
  if (!repository.listTargets || !repository.createTarget || !repository.updateTarget
    || !repository.listConfigurations || !repository.createConfiguration) {
    throw new Error("KPI management repository is not configured");
  }
  return repository as KpiFactsRepository & KpiManagementRepository;
}

function expectedWeekStarts(query: KpiPeriodQuery): string[] {
  const requested = new Date(`${query.periodStart}T00:00:00.000Z`);
  if (query.granularity === "WEEK") return [query.periodStart];
  const start = query.granularity === "MONTH"
    ? new Date(Date.UTC(requested.getUTCFullYear(), requested.getUTCMonth(), 1))
    : new Date(Date.UTC(requested.getUTCFullYear(), 0, 1));
  const end = query.granularity === "MONTH"
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

export function createKpiService(repository: ServiceRepository, timeZone: string) {
  async function converge(): Promise<void> {
    if (repository.processRevisionRequests) await repository.processRevisionRequests(10, new Date());
  }
  function queryRepository(): KpiQueryRepository {
    if (!repository.findCurrentResults || !repository.findTechnicianHistory || !repository.findVersions) {
      throw new Error("KPI query repository is not configured");
    }
    return repository as KpiFactsRepository & KpiQueryRepository;
  }
  return {
    async getDashboard(query: KpiPeriodQuery, actor: KpiActorContext) {
      await converge();
      const scope = accessScope(actor);
      const results = await queryRepository().findCurrentResults(query, scope);
      const capabilities = {
        manageTargets: actor.permissions.includes("KPI_MANAGE_TARGETS"),
        manageConfiguration: actor.permissions.includes("KPI_MANAGE_CONFIGURATION"),
        closeWeek: actor.permissions.includes("KPI_CLOSE_WEEK"),
        recalculate: actor.permissions.includes("KPI_RECALCULATE"),
      };
      if (query.granularity === "WEEK") {
        if (results.length === 0) return { ...(await this.previewWeekly(query.periodStart, actor)), capabilities };
        return { status: results.some(({ revision }) => revision > 1) ? "REVISED" as const : "OFFICIAL" as const,
          granularity: query.granularity, items: results.map((result) => ({ ...mapKpiResult(result), code: result.tecnico.code, fullName: result.tecnico.fullName })),
          warnings: [], capabilities };
      }
      const weeks = results.map((result) => ({
        technicianId: result.tecnicoId, code: result.tecnico.code, fullName: result.tecnico.fullName,
        periodStart: result.periodStart.toISOString().slice(0, 10), periodEnd: result.periodEnd.toISOString().slice(0, 10),
        revision: result.revision, isCurrent: result.isCurrent, appliedTarget: result.appliedTarget,
        completedCredits: result.completedCredits.toFixed(4), eligibleCredits: result.eligibleCredits.toFixed(4),
        onTimeEligibleCredits: result.onTimeEligibleCredits.toFixed(4), registeredMinutes: result.registeredMinutes,
        productiveMinutes: result.productiveMinutes, attributableRecurrenceCredits: result.attributableRecurrenceCredits.toFixed(4),
        overallScore: result.overallScore.toFixed(2), qualityScore: result.qualityScore?.toFixed(2) ?? null,
      }));
      const expectedWeeks = expectedWeekStarts(query);
      return { status: "OFFICIAL" as const, granularity: query.granularity,
        ...consolidateOfficialWeeks({ weeks, expectedWeeks }), capabilities };
    },
    async getRanking(query: KpiPeriodQuery, actor: KpiActorContext) {
      const dashboard = await this.getDashboard(query, actor);
      return { ...dashboard, items: [...dashboard.items].sort((left, right) => {
        const overall = Number(right.overallScore) - Number(left.overallScore);
        if (overall !== 0) return overall;
        const leftQuality = "qualityScore" in left ? left.qualityScore : left.scores.quality;
        const rightQuality = "qualityScore" in right ? right.qualityScore : right.scores.quality;
        const quality = Number(rightQuality ?? -1) - Number(leftQuality ?? -1);
        if (quality !== 0) return quality;
        const leftCompleted = "completedCredits" in left ? left.completedCredits : left.facts.completedCredits;
        const rightCompleted = "completedCredits" in right ? right.completedCredits : right.facts.completedCredits;
        const completed = Number(rightCompleted) - Number(leftCompleted);
        return completed !== 0 ? completed : String(left.code).localeCompare(String(right.code));
      }) };
    },
    async getTechnicianHistory(technicianId: string, actor: KpiActorContext) {
      await converge();
      const rows = await queryRepository().findTechnicianHistory(technicianId, accessScope(actor));
      if (rows.length === 0) throw new ApiError(404, "El historial KPI solicitado no existe", "KPI_NOT_FOUND");
      return rows.map((row) => ({ ...mapKpiResult(row), code: row.tecnico.code, fullName: row.tecnico.fullName }));
    },
    async getTechnicianDetails(technicianId: string, periodStart: string, actor: KpiActorContext) {
      const history = await this.getTechnicianHistory(technicianId, actor);
      const result = history.find((item) => item.periodStart === periodStart);
      if (!result) throw new ApiError(404, "El detalle KPI solicitado no existe", "KPI_NOT_FOUND");
      return { status: result.revision > 1 ? "REVISED" as const : "OFFICIAL" as const, ...result };
    },
    async getVersions(weekStart: string, actor: KpiActorContext) {
      requirePermission(actor, "KPI_VIEW_AUDIT");
      const week = parseWeekStart(weekStart, timeZone);
      if ("kind" in week) throw new ApiError(400, "La semana debe iniciar un lunes válido", "VALIDATION_ERROR");
      return (await queryRepository().findVersions(week, accessScope(actor)))
        .map((row) => ({ ...mapKpiResult(row), code: row.tecnico.code, fullName: row.tecnico.fullName }));
    },
    async previewWeekly(weekStart: string, actor: KpiActorContext) {
      const week = parseWeekStart(weekStart, timeZone);
      if ("kind" in week) {
        throw new ApiError(400, "La semana debe iniciar un lunes válido", "VALIDATION_ERROR");
      }
      const rows = await repository.loadWeeklySources(week, accessScope(actor));
      const facts = buildWeeklyFacts(rows);
      const warnings = rows.technicians
        .filter((technician) => technician.targetJobs === null)
        .map((technician) => ({ code: "MISSING_TARGET" as const, technicianId: technician.id }));
      const items = rows.technicians
        .filter((technician) => technician.targetJobs !== null)
        .map((technician) => {
          const fact = facts.get(technician.id)!;
          return {
            technicianId: technician.id,
            code: technician.code,
            fullName: technician.fullName,
            ...calculateWeeklyKpi(fact),
            facts: fact,
          };
        });
      return { status: "PREVIEW" as const, periodStart: week.periodStart, periodEnd: week.periodEnd, items, warnings };
    },
    async listTargets(weekStart: string, actor: KpiActorContext) {
      requirePermission(actor, "KPI_MANAGE_TARGETS");
      const week = parseWeekStart(weekStart, timeZone);
      if ("kind" in week) throw new ApiError(400, "La semana debe iniciar un lunes válido", "VALIDATION_ERROR");
      if (!repository.listTargets) throw new Error("KPI management repository is not configured");
      return repository.listTargets(week);
    },
    async createTarget(input: CreateTargetInput, actor: KpiActorContext) {
      requirePermission(actor, "KPI_MANAGE_TARGETS");
      return management(repository).createTarget(input, actor);
    },
    async updateTarget(targetId: string, input: UpdateTargetInput, actor: KpiActorContext) {
      requirePermission(actor, "KPI_MANAGE_TARGETS");
      return management(repository).updateTarget(targetId, input, actor);
    },
    async listConfigurations(actor: KpiActorContext) {
      requirePermission(actor, "KPI_MANAGE_CONFIGURATION");
      if (!repository.listConfigurations) throw new Error("KPI management repository is not configured");
      return repository.listConfigurations();
    },
    async createConfiguration(input: CreateConfigurationInput, actor: KpiActorContext) {
      requirePermission(actor, "KPI_MANAGE_CONFIGURATION");
      return management(repository).createConfiguration(input, actor);
    },
    async closeWeek(weekStart: string, actor: KpiActorContext) {
      requirePermission(actor, "KPI_CLOSE_WEEK");
      const week = parseWeekStart(weekStart, timeZone);
      if ("kind" in week) throw new ApiError(400, "La semana debe iniciar un lunes válido", "VALIDATION_ERROR");
      if (!repository.closeWeek) throw new Error("KPI close repository is not configured");
      return repository.closeWeek({ week, actor });
    },
    async recalculateWeek(weekStart: string, reason: string, actor: KpiActorContext) {
      requirePermission(actor, "KPI_RECALCULATE");
      const week = parseWeekStart(weekStart, timeZone);
      if ("kind" in week) throw new ApiError(400, "La semana debe iniciar un lunes válido", "VALIDATION_ERROR");
      if (!repository.recalculateWeek) throw new Error("KPI close repository is not configured");
      return repository.recalculateWeek({ week, actor, reason, calculationType: "MANUAL_RECALCULATION" });
    },
  };
}
