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
      const teamRecords = records.team as Array<{ id: string; code: string; fullName: string; specialty: string | null; status: "AVAILABLE" | "BUSY" | "ON_ROUTE"; actividades: Array<{ actividad: { status: "IN_PROGRESS" | "PAUSED"; description: string; startedAt: Date | null; pausedMinutes: number; tipoActividad: { name: string }; sucursal: { name: string; cliente: { tradeName: string } } } }> }>;
      const activityRecords = records.activities as Array<{ id: string; status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED"; description: string; startedAt: Date | null; endedAt: Date | null; pausedMinutes: number; productiveMinutes: number | null; updatedAt: Date; tipoActividad: { name: string }; sucursal: { name: string; cliente: { tradeName: string } }; orden: { orderNumber: string } | null; tecnicos: Array<{ tecnico: { fullName: string } }> }>;
      const recurrenceRecords = records.recurrences as Array<{ id: string; recurrenceNumber: string; detectedProblem: string; status: string; impact: "LOW" | "MEDIUM" | "HIGH"; ordenes: Array<{ id: string }>; ordenOriginal: { sucursal: { cliente: { tradeName: string } } }; tecnicos: Array<{ tecnico: { fullName: string } }> }>;
      return {
        date,
        generatedAt: now().toISOString(),
        capabilities: { team, recentActivities, recurrences },
        team: team ? teamRecords.map((record) => {
          const active = record.actividades[0]?.actividad;
          return { id: record.id, code: record.code, fullName: record.fullName, specialty: record.specialty, status: record.status, activeActivity: active && active.startedAt ? { status: active.status, type: active.tipoActividad.name, client: active.sucursal.cliente.tradeName, branch: active.sucursal.name, description: active.description, startedAt: active.startedAt.toISOString(), pausedMinutes: active.pausedMinutes } : null };
        }) : [],
        recentActivities: recentActivities ? activityRecords.map((record) => ({ id: record.id, type: record.tipoActividad.name, description: record.description, orderNumber: record.orden?.orderNumber ?? null, client: record.sucursal.cliente.tradeName, branch: record.sucursal.name, responsible: record.tecnicos[0]?.tecnico.fullName ?? null, status: record.status, startedAt: record.startedAt?.toISOString() ?? null, endedAt: record.endedAt?.toISOString() ?? null, pausedMinutes: record.pausedMinutes, productiveMinutes: record.productiveMinutes, updatedAt: record.updatedAt.toISOString(), isRecurrenceRelated: false })) : [],
        recurrences: recurrences ? { openCases: recurrenceRecords.length, highImpactOpenCases: recurrenceRecords.filter((record) => record.impact === "HIGH").length, averageVisits: recurrenceRecords.length === 0 ? 0 : Math.round(recurrenceRecords.reduce((total, record) => total + record.ordenes.length, 0) / recurrenceRecords.length), priorityCase: recurrenceRecords[0] ? { id: recurrenceRecords[0].id, number: recurrenceRecords[0].recurrenceNumber, problem: recurrenceRecords[0].detectedProblem, client: recurrenceRecords[0].ordenOriginal.sucursal.cliente.tradeName, visits: recurrenceRecords[0].ordenes.length, impact: recurrenceRecords[0].impact, status: recurrenceRecords[0].status, technicians: recurrenceRecords[0].tecnicos.map(({ tecnico }) => tecnico.fullName) } : null } : null,
      };
    },
  };
}
