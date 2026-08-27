import { useEffect, useRef } from "react";
import { Clock3, MapPin, Pause, X } from "lucide-react";
import { useAuth } from "../../auth/useAuth";
import { activityElapsedMs, formatActivityDuration } from "../../hooks/activity-workspace.helpers";
import type { ActivityDetail as ActivityDetailModel, ActivityDetailAction, ActivityStatus } from "../../models/activity";

const statusLabel: Record<ActivityStatus, string> = {
  PENDING: "Pendiente", IN_PROGRESS: "En curso", PAUSED: "Pausada", COMPLETED: "Completada", CANCELLED: "Cancelada",
};

export interface ActivityDetailProps {
  activity: ActivityDetailModel;
  now: Date;
  pending?: boolean;
  closeOnEscape?: boolean;
  onClose(): void;
  onAction(action: ActivityDetailAction): void;
}

export function ActivityDetail({ activity, now, pending = false, closeOnEscape = true, onClose, onAction }: ActivityDetailProps) {
  const { hasPermission } = useAuth();
  const panelRef = useRef<HTMLElement>(null);
  const canManage = hasPermission("ACTIVITIES_MANAGE");
  const canCreate = canManage || hasPermission("ACTIVITIES_CREATE_OWN");
  const canOperate = canManage || hasPermission("ACTIVITIES_OPERATE_OWN");

  useEffect(() => {
    panelRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && closeOnEscape) onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeOnEscape, onClose]);

  const actions: Array<{ action: ActivityDetailAction; label: string; primary?: boolean }> = [];
  if (activity.status === "PENDING") {
    if (canOperate) actions.push({ action: "start", label: "Iniciar", primary: true });
    if (canCreate) actions.push({ action: "edit", label: "Editar actividad" }, { action: "cancel", label: "Cancelar actividad" });
    if (canManage) actions.push({ action: "team", label: "Editar equipo" });
  }
  if (activity.status === "IN_PROGRESS" && canOperate) actions.push({ action: "pause", label: "Pausar" }, { action: "complete", label: "Completar", primary: true });
  if (activity.status === "PAUSED" && canOperate) actions.push({ action: "resume", label: "Reanudar", primary: true }, { action: "complete", label: "Completar" });
  if (activity.status === "COMPLETED" && canManage) actions.push({ action: "adjust", label: "Ajustar actividad", primary: true });

  return <aside className="activity-detail" role="dialog" aria-labelledby="activity-detail-title" aria-modal="false" tabIndex={-1} ref={panelRef}>
    <header className="activity-detail__head"><div><p className="eyebrow">Bitácora #{activity.version}</p><h2 id="activity-detail-title">Detalle de actividad</h2></div><button className="icon-button" type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={18} /></button></header>
    <div className={`activity-detail__signal activity-detail__signal--${activity.status.toLowerCase()}`}><span><i aria-hidden="true" />{statusLabel[activity.status]}</span><strong><Clock3 size={17} aria-hidden="true" />{formatActivityDuration(activityElapsedMs(activity, now))}</strong></div>
    <div className="activity-detail__body">
      <section><span className="activity-detail__label">Trabajo</span><h3>{activity.description}</h3><p className="activity-detail__location"><MapPin size={13} aria-hidden="true" />{activity.branch.client.tradeName} · {activity.branch.name}</p><dl className="activity-detail__facts"><div><dt>Origen</dt><dd>{activity.order?.orderNumber ?? "Trabajo en sucursal"}</dd></div><div><dt>Tipo</dt><dd>{activity.activityType.name}</dd></div><div><dt>Resultado</dt><dd>{activity.result ?? "Pendiente de registrar"}</dd></div><div><dt>Observaciones</dt><dd>{activity.observations ?? "Sin observaciones"}</dd></div></dl></section>
      <section><span className="activity-detail__label">Equipo técnico</span>{activity.team.length === 0 ? <p className="activity-detail__muted">Sin equipo registrado</p> : <ul className="activity-detail__team">{activity.team.map((member) => <li key={member.technician.id}><span className="avatar avatar--small" aria-hidden="true">{member.technician.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{member.technician.fullName}</strong><small>{member.role === "RESPONSIBLE" ? "Responsable" : "Participante"}</small></span><b>{member.participationPercentage}%</b></li>)}</ul>}</section>
      {activity.pauses.length > 0 && <section><span className="activity-detail__label">Pausas</span><ul className="activity-detail__pauses">{activity.pauses.map((pause) => <li key={pause.id}><Pause size={13} aria-hidden="true" /><span>{pause.reason}</span><small>{pause.endedAt ? "Finalizada" : "En curso"}</small></li>)}</ul></section>}
    </div>
    {actions.length > 0 && <footer className="activity-detail__actions">{actions.map(({ action, label, primary }) => <button key={action} className={`button ${primary ? "button--primary" : "button--ghost"}`} type="button" disabled={pending} onClick={() => onAction(action)}>{label}</button>)}</footer>}
  </aside>;
}
