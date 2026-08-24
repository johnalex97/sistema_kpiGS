import { ApiError } from "../utils/api-error.js";
import { calculateWeeklyKpi } from "./kpis.calculator.js";
import { buildWeeklyFacts } from "./kpis.facts.js";
import { parseWeekStart } from "./kpis.period.js";
import type { KpiFactsRepository, KpiAccessScope } from "./kpis.repository.types.js";
import type { KpiActorContext } from "./kpis.types.js";

function accessScope(actor: KpiActorContext): KpiAccessScope {
  if (actor.permissions.includes("KPI_VIEW_ALL")) return { kind: "ALL" };
  if (actor.permissions.includes("KPI_VIEW_OWN") && actor.technicianId) {
    return { kind: "TECHNICIAN", technicianId: actor.technicianId };
  }
  throw new ApiError(403, "No tiene permiso para consultar indicadores KPI", "FORBIDDEN");
}

export function createKpiService(repository: KpiFactsRepository, timeZone: string) {
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
  };
}
