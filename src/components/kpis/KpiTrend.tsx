import type { KpiDashboardItem } from "../../models/kpi";
export function KpiTrend({ items }: { items: KpiDashboardItem[] }) {
  const values = items.map(({ overallScore }) => Number(overallScore));
  const points = values.map((value, index) => `${20 + index * (260 / Math.max(1, values.length - 1))},${100 - value * .75}`).join(" ");
  return <div className="panel kpi-trend"><div><p className="eyebrow">Pulso técnico</p><h2>Comportamiento del periodo</h2></div><svg viewBox="0 0 300 120" role="img" aria-label="Tendencia KPI del periodo"><line x1="20" y1="100" x2="280" y2="100" /><polyline points={points || "20,100"} />{values.map((value, index) => <g key={index}><circle cx={20 + index * (260 / Math.max(1, values.length - 1))} cy={100 - value * .75} r="4" /><text x={20 + index * (260 / Math.max(1, values.length - 1))} y={112}>{value}</text></g>)}</svg></div>;
}
