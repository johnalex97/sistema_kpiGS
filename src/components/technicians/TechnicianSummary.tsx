import type { KpiDashboardItem } from "../../models/kpi";
import type { Technician } from "../../models/technician";

export interface TechnicianSummaryProps {
  technicians: Technician[];
  kpis: Map<string, KpiDashboardItem>;
  showKpi: boolean;
}

export function TechnicianSummary({ technicians, kpis, showKpi }: TechnicianSummaryProps) {
  const active = technicians.filter(({ status }) => status !== "INACTIVE").length;
  const available = technicians.filter(({ status }) => status === "AVAILABLE").length;
  const deployed = technicians.filter(({ status }) => status === "BUSY" || status === "ON_ROUTE").length;
  const scores = technicians.map(({ id }) => Number(kpis.get(id)?.overallScore)).filter((score) => Number.isFinite(score));
  const average = scores.length > 0 ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2) : "Sin cálculo";

  return <section className="technicians-summary" aria-label="Resultados visibles">
    <header className="technicians-summary__heading"><p className="eyebrow">Resultados visibles</p><span>Lectura de la página actual</span></header>
    <dl className="technicians-summary__signals">
      <div><dt>Activos</dt><dd>{active}</dd></div>
      <div><dt>Disponibles</dt><dd>{available}</dd></div>
      <div><dt>Ocupados o en ruta</dt><dd>{deployed}</dd></div>
      {showKpi && <div className="technicians-summary__kpi"><dt>KPI semanal promedio</dt><dd>{average}</dd></div>}
    </dl>
  </section>;
}
