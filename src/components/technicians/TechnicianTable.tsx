import { ArrowRight, Clock3 } from "lucide-react";
import type { KpiDashboardItem } from "../../models/kpi";
import type { Technician, TechnicianStatus } from "../../models/technician";

const technicianStatusLabel: Record<TechnicianStatus, string> = {
  AVAILABLE: "Disponible", BUSY: "Ocupado", ON_ROUTE: "En ruta", INACTIVE: "Inactivo",
};

function formatProductiveMinutes(minutes: number | undefined): string {
  if (minutes === undefined) return "Sin cálculo";
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function creditsAgainstTarget(kpi: KpiDashboardItem | undefined): string {
  if (!kpi) return "Sin cálculo";
  return kpi.appliedTarget === undefined ? `${kpi.completedCredits} / Sin meta` : `${kpi.completedCredits} / ${kpi.appliedTarget}`;
}

export interface TechnicianTableProps {
  technicians: Technician[];
  kpis: Map<string, KpiDashboardItem>;
  showKpi: boolean;
  onSelect(id: string): void;
}

export function TechnicianTable({ technicians, kpis, showKpi, onSelect }: TechnicianTableProps) {
  return <div className="technicians-table-wrap"><table className="technicians-table">
    <thead><tr><th>Técnico</th><th>Especialidad</th><th>Estado</th>{showKpi && <><th>KPI semanal</th><th>Completado / meta</th><th>Tiempo productivo</th></>}<th>Usuario vinculado</th><th><span className="sr-only">Detalle</span></th></tr></thead>
    <tbody>{technicians.map((technician) => {
      const kpi = kpis.get(technician.id);
      return <tr key={technician.id} data-status={technician.status.toLowerCase()}>
        <td data-label="Técnico"><span className="technicians-table__identity"><strong>{technician.fullName}</strong><small>{technician.code}</small></span></td>
        <td data-label="Especialidad">{technician.specialty ?? "Sin especialidad"}</td>
        <td data-label="Estado"><span className={`technician-state technician-state--${technician.status.toLowerCase()}`}><i aria-hidden="true" />{technicianStatusLabel[technician.status]}</span></td>
        {showKpi && <><td data-label="KPI semanal" className="technicians-table__score">{kpi?.overallScore ?? "Sin cálculo"}</td><td data-label="Completado / meta">{creditsAgainstTarget(kpi)}</td><td data-label="Tiempo productivo" className="technicians-table__time"><Clock3 size={13} aria-hidden="true" />{formatProductiveMinutes(kpi?.productiveMinutes)}</td></>}
        <td data-label="Usuario vinculado">{technician.user ? <span className="technicians-table__user"><strong>{technician.user.displayName}</strong><small>{technician.user.email}</small></span> : "Sin vincular"}</td>
        <td data-label="Detalle"><button className="technicians-table__open" type="button" aria-label={`Ver técnico ${technician.fullName}`} onClick={() => onSelect(technician.id)}><ArrowRight size={16} aria-hidden="true" /></button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
