import { getOperationalDayBounds } from "./dashboard.time.js";
import type { DashboardReadRepository } from "./dashboard.repository.types.js";
import type { DashboardActorContext, OperationalDashboardQuery, PublicOperationalDashboard } from "./dashboard.types.js";

function has(actor: DashboardActorContext, permission: string) {
  return actor.permissions.includes(permission);
}

function dateFor(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function createDashboardService(
  repository: DashboardReadRepository,
  timeZone: string,
  now: () => Date = () => new Date(),
) {
  return {
    async getOperationalDashboard(query: OperationalDashboardQuery, actor: DashboardActorContext): Promise<PublicOperationalDashboard> {
      const date = query.date ?? dateFor(now(), timeZone);
      const activityAll = has(actor, "ACTIVITIES_VIEW_ALL");
      const activityOwn = actor.technicianId !== null && (has(actor, "ACTIVITIES_CREATE_OWN") || has(actor, "ACTIVITIES_OPERATE_OWN"));
      const recentActivities = activityAll || activityOwn;
      const team = has(actor, "TECHNICIANS_VIEW") && recentActivities;
      const recurrences = has(actor, "RECURRENCES_VIEW_ALL") || (actor.technicianId !== null && has(actor, "RECURRENCES_VIEW_OWN"));
      const records = await repository.readOperationalDashboard({
        ...getOperationalDayBounds(date, timeZone),
        activityTechnicianId: activityAll ? null : actor.technicianId,
        recurrenceTechnicianId: has(actor, "RECURRENCES_VIEW_ALL") ? null : actor.technicianId,
        includeTeam: team,
        includeRecurrences: recurrences,
      });
      return {
        date,
        generatedAt: now().toISOString(),
        capabilities: { team, recentActivities, recurrences },
        team: team ? records.team : [],
        recentActivities: recentActivities ? records.activities : [],
        recurrences: recurrences ? records.recurrences : null,
      };
    },
  };
}
