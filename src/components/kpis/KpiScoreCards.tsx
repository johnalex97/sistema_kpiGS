import type { KpiDashboardData, KpiDashboardItem } from "../../models/kpi";
const dimensions = [
  ["Índice general", "overallScore"], ["Productividad", "productivityScore"], ["Cumplimiento", "complianceScore"],
  ["Eficiencia", "efficiencyScore"], ["Calidad", "qualityScore"],
] as const;
export function KpiScoreCards({ items, status }: { items: KpiDashboardItem[]; status: KpiDashboardData["status"] }) {
  return <section className="kpi-score-grid" aria-label="Indicadores principales del equipo">
    {dimensions.map(([label, scoreKey]) => {
      const values = items.map((item) => item[scoreKey]).filter((value): value is string => value !== null && value.trim() !== "" && Number.isFinite(Number(value))).map(Number);
      const average = values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2) : "No aplica";
      return <article className={`kpi-score-card${scoreKey === "overallScore" ? " kpi-score-card--overall" : ""}`} key={scoreKey}>
        <p>{label} · equipo</p><strong>{average}</strong>
        <span>{values.length} {values.length === 1 ? "técnico" : "técnicos"} con indicador</span>
        <details><summary>Ver cálculo</summary><small>Promedio simple de los indicadores {status === "PREVIEW" ? "preliminares" : "oficiales"} disponibles del periodo. Cada técnico cuenta una vez; «No aplica» se excluye. No sustituye el resultado individual.</small></details>
      </article>;
    })}
  </section>;
}
