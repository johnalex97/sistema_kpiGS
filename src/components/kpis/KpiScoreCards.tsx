import type { KpiDashboardItem } from "../../models/kpi";
const dimensions = [
  ["Productividad", "productivityScore", "productivity"], ["Cumplimiento", "complianceScore", "compliance"],
  ["Eficiencia", "efficiencyScore", "efficiency"], ["Calidad", "qualityScore", "quality"],
] as const;
export function KpiScoreCards({ item }: { item: KpiDashboardItem }) {
  return <section className="kpi-score-grid" aria-label="Indicadores principales">
    <article className="kpi-score-card kpi-score-card--overall"><p>Índice general</p><strong>{item.overallScore}</strong><span>de 100 puntos</span></article>
    {dimensions.map(([label, scoreKey, weightKey]) => <article className="kpi-score-card" key={label}><p>{label}</p><strong>{item[scoreKey] ?? "No aplica"}</strong><span>Peso {Number(item.weights?.[weightKey] ?? 0) * 100}%</span><details><summary>Ver fórmula</summary><small>Calculado con los datos oficiales del periodo.</small></details></article>)}
  </section>;
}
