import { ApiError } from "../utils/api-error.js";
import { calculateWeeklyKpi } from "./kpis.calculator.js";
import { buildWeeklyFacts } from "./kpis.facts.js";
import { parseWeekStart } from "./kpis.period.js";
import type { CreateConfigurationInput, CreateTargetInput, UpdateTargetInput } from "./kpis.schemas.js";
import type { KpiCloseRepository, KpiFactsRepository, KpiAccessScope, KpiManagementRepository } from "./kpis.repository.types.js";
import type { KpiActorContext } from "./kpis.types.js";

function accessScope(actor: KpiActorContext): KpiAccessScope {
  if (actor.permissions.includes("KPI_VIEW_ALL")) return { kind: "ALL" };
  if (actor.permissions.includes("KPI_VIEW_OWN") && actor.technicianId) {
    return { kind: "TECHNICIAN", technicianId: actor.technicianId };
  }
  throw new ApiError(403, "No tiene permiso para consultar indicadores KPI", "FORBIDDEN");
}

type ServiceRepository = KpiFactsRepository & Partial<KpiManagementRepository & KpiCloseRepository>;

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

export function createKpiService(repository: ServiceRepository, timeZone: string) {
  return {
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
