import { Clock3, MapPin } from "lucide-react";
import type { ActivityStatus, ActivitySummary } from "../../models/activity";
import { formatActivityDuration } from "../../hooks/activity-workspace.helpers";

const statusLabel: Record<ActivityStatus, string> = {
  PENDING: "Pendiente", IN_PROGRESS: "En curso", PAUSED: "Pausada", COMPLETED: "Completada", CANCELLED: "Cancelada",
};

function summaryDuration(activity: ActivitySummary, now: Date): string {
  if (activity.productiveMinutes !== null) return formatActivityDuration(activity.productiveMinutes * 60_000);
  if (!activity.startedAt) return "—";
  if (activity.status === "PAUSED") return "Pausada";
  const end = activity.endedAt ? Date.parse(activity.endedAt) : now.getTime();
  return formatActivityDuration(end - Date.parse(activity.startedAt) - activity.pausedMinutes * 60_000);
}

export interface ActivityTableProps {
  items: ActivitySummary[];
  now: Date;
  onOpen(activity: ActivitySummary, trigger: HTMLButtonElement): void;
}

export function ActivityTable({ items, now, onOpen }: ActivityTableProps) {
  return <div className="activity-table-wrap"><table className="activity-table">
    <thead><tr><th>Actividad</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th>Tiempo</th></tr></thead>
    <tbody>{items.map((activity) => <tr key={activity.id} data-status={activity.status.toLowerCase()}>
      <td data-label="Actividad"><button className="activity-row-trigger" type="button" onClick={(event) => onOpen(activity, event.currentTarget)} aria-label={`Ver actividad ${activity.description}`}>
        <span className="activity-row-trigger__mark" aria-hidden="true" /><span><strong>{activity.description}</strong><small><MapPin size={11} aria-hidden="true" />{activity.order?.orderNumber ?? activity.branch.code} · {activity.branch.client.tradeName}</small></span>
      </button></td>
      <td data-label="Tipo"><span className="activity-type-code">{activity.activityType.name}</span></td>
      <td data-label="Responsable">{activity.responsible?.fullName ?? "Sin asignar"}</td>
      <td data-label="Estado"><span className={`activity-state activity-state--${activity.status.toLowerCase()}`}><i aria-hidden="true" />{statusLabel[activity.status]}</span></td>
      <td data-label="Tiempo" className="activity-time"><Clock3 size={12} aria-hidden="true" />{summaryDuration(activity, now)}</td>
    </tr>)}</tbody>
  </table></div>;
}
