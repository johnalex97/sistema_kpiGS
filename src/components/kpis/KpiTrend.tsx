import type { KpiDashboardItem } from "../../models/kpi";
import "./kpi-comparison.css";
export function KpiTrend({ items }: { items: KpiDashboardItem[] }) {
  return <section className="panel kpi-comparison" aria-label="Comparación entre técnicos">
    <p className="eyebrow">Pulso del equipo</p><h2>Comparación entre técnicos</h2>
    <p className="kpi-comparison-note">Índice general del periodo seleccionado · escala de 0 a 100.</p>
    <ul>{items.map((item) => <li key={item.technicianId}>
      <div className="kpi-comparison-label"><span>{item.fullName}<small>{item.code}</small></span><strong>{item.overallScore}</strong></div>
      <meter min="0" max="100" value={Number(item.overallScore)} aria-label={`Índice general de ${item.fullName}`} />
    </li>)}</ul>
    {items.length === 0 && <p>No hay técnicos con resultados en este periodo.</p>}
  </section>;
}
