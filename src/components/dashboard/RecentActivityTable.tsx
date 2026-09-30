import type { OperationalActivity } from "../../models/dashboard";

function activityDuration(activity: OperationalActivity): string {
  if (activity.productiveMinutes === null) return "En curso";
  return `${Math.floor(activity.productiveMinutes / 60)} h ${activity.productiveMinutes % 60} min`;
}

export function RecentActivityTable({ activities, onGoActivities }: { activities: OperationalActivity[]; onGoActivities(): void }) {
  return <section className="panel operational-activities" aria-label="Actividad reciente"><header className="operational-heading"><div><p className="eyebrow">Hoy · actualización en vivo</p><h2>Actividad reciente</h2></div><button className="button button--ghost" type="button" onClick={onGoActivities}>Ver actividades</button></header>
    {activities.length === 0 ? <p className="empty-state">No hay actividad reciente para esta fecha.</p> : <div className="table-wrap"><table><thead><tr><th>Actividad</th><th>Responsable</th><th>Hora</th><th>Estado</th><th>Duración</th></tr></thead><tbody>{activities.map((activity) => <tr key={activity.id}><td><strong>{activity.type}</strong><small>{activity.orderNumber ?? activity.id} · {activity.client} · {activity.branch}</small></td><td>{activity.responsible ?? "Sin responsable visible"}</td><td>{activity.startedAt ? new Date(activity.startedAt).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" }) : "Sin inicio"}</td><td>{activity.status}</td><td>{activityDuration(activity)}</td></tr>)}</tbody></table></div>}
  </section>;
}
