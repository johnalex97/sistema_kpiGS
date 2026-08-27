import { useEffect, useRef } from "react";
import { Clock3, UserRound, X } from "lucide-react";
import type { KpiDashboardItem } from "../../models/kpi";
import type { Technician, TechnicianStatus } from "../../models/technician";

export type TechnicianDetailAction = "edit" | "status" | "deactivate" | "reactivate";

const actionLabel: Record<TechnicianDetailAction, string> = { edit: "Editar", status: "Cambiar estado", deactivate: "Desactivar", reactivate: "Reactivar" };
const technicianStatusLabel: Record<TechnicianStatus, string> = { AVAILABLE: "Disponible", BUSY: "Ocupado", ON_ROUTE: "En ruta", INACTIVE: "Inactivo" };
const score = (value: string | null | undefined) => value === null ? "No aplica" : value ?? "Sin cálculo";
const formatProductiveMinutes = (minutes: number | undefined) => minutes === undefined ? "Sin cálculo" : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("es-HN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`)) : "Sin registrar";
const updatedLabel = (value: string) => new Intl.DateTimeFormat("es-HN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export interface TechnicianDetailProps {
  technician: Technician;
  kpi?: KpiDashboardItem;
  showKpi: boolean;
  actions?: TechnicianDetailAction[];
  onClose(): void;
  onAction(action: TechnicianDetailAction): void;
}

export function TechnicianDetail({ technician, kpi, showKpi, actions = [], onClose, onAction }: TechnicianDetailProps) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return <aside className="technician-detail" role="dialog" aria-labelledby="technician-detail-title" aria-modal="false" tabIndex={-1} ref={panelRef}>
    <header className="technician-detail__head"><div><p className="eyebrow">Ficha laboral · v{technician.version}</p><h2 id="technician-detail-title">Detalle del técnico</h2></div><button className="icon-button" type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <div className={`technician-detail__signal technician-detail__signal--${technician.status.toLowerCase()}`}><span><i aria-hidden="true" />{technicianStatusLabel[technician.status]}</span><strong>{technician.code}</strong></div>
    <div className="technician-detail__body">
      <section aria-labelledby="technician-identity-title"><span className="technician-detail__label">Identidad operativa</span><h3 id="technician-identity-title">{technician.fullName}</h3><p>{technician.specialty ?? "Sin especialidad registrada"}</p><dl className="technician-detail__facts"><div><dt>Teléfono laboral</dt><dd>{technician.workPhone ?? "Sin registrar"}</dd></div><div><dt>Correo laboral</dt><dd>{technician.workEmail ?? "Sin registrar"}</dd></div><div><dt>Fecha de ingreso</dt><dd>{dateLabel(technician.hiredOn)}</dd></div><div><dt>Fecha de retiro</dt><dd>{dateLabel(technician.leftOn)}</dd></div></dl></section>
      <section aria-labelledby="technician-user-title"><span className="technician-detail__label">Acceso vinculado</span><h3 id="technician-user-title"><UserRound size={15} aria-hidden="true" />Usuario del sistema</h3>{technician.user ? <dl className="technician-detail__facts"><div><dt>Nombre</dt><dd>{technician.user.displayName}</dd></div><div><dt>Correo</dt><dd>{technician.user.email}</dd></div></dl> : <p className="technician-detail__muted">Este perfil laboral no tiene un usuario vinculado.</p>}</section>
      {showKpi && <section aria-labelledby="technician-kpi-title"><span className="technician-detail__label">Semana vigente</span><h3 id="technician-kpi-title"><Clock3 size={15} aria-hidden="true" />Señal KPI</h3><dl className="technician-detail__kpis"><div><dt>Productividad</dt><dd>{score(kpi?.productivityScore)}</dd></div><div><dt>Cumplimiento</dt><dd>{score(kpi?.complianceScore)}</dd></div><div><dt>Eficiencia</dt><dd>{score(kpi?.efficiencyScore)}</dd></div><div><dt>Calidad</dt><dd>{score(kpi?.qualityScore)}</dd></div><div><dt>Puntaje general</dt><dd>{score(kpi?.overallScore)}</dd></div><div><dt>Tiempo productivo</dt><dd>{formatProductiveMinutes(kpi?.productiveMinutes)}</dd></div></dl></section>}
      <p className="technician-detail__audit">Última actualización: <time dateTime={technician.updatedAt}>{updatedLabel(technician.updatedAt)}</time></p>
    </div>
    {actions.length > 0 && <footer className="technician-detail__actions">{actions.map((action) => <button key={action} className={`button ${action === "edit" || action === "reactivate" ? "button--primary" : "button--ghost"}`} type="button" onClick={() => onAction(action)}>{actionLabel[action]}</button>)}</footer>}
  </aside>;
}
