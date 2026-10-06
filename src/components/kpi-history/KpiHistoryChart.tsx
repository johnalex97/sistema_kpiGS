import type { HistoryGranularity, HistoryMetric, HistoryPoint } from "../../models/kpi-history";
import { historyMetrics, historyPeriod, historyScore } from "./history-format";

export function KpiHistoryChart({ points, metric, granularity }: { points: HistoryPoint[]; metric: HistoryMetric; granularity: HistoryGranularity }) {
  const label = historyMetrics.find(([key]) => key === metric)?.[1] ?? "Indicador";
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  const locations: Array<{ x: number; y: number } | null> = [];
  for (const [index, point] of points.entries()) {
    const x = 48 + index * 600 / Math.max(1, points.length - 1);
    const value = point.scores[metric];
    if (value === null) { if (segment.length) segments.push(segment); segment = []; locations.push(null); continue; }
    const location = { x, y: 190 - Number(value) * 1.6 };
    segment.push(location); locations.push(location);
  }
  if (segment.length) segments.push(segment);
  return <div className="kpi-history__chart" role="region" aria-label="Gráfica del historial, desplazable horizontalmente en móvil" tabIndex={0}><svg viewBox="0 0 690 240" role="img" aria-label={`${label}: evolución de 0 a 100 por periodo. Consulta todos los valores en la tabla.`}>
    <title>{label}: historial oficial</title>
    {[0, 25, 50, 75, 100].map(value => <g key={value}><line x1="48" x2="648" y1={190 - value * 1.6} y2={190 - value * 1.6} className="kpi-history__grid" /><text x="35" y={194 - value * 1.6} textAnchor="end">{value}</text></g>)}
    {segments.filter(s => s.length > 1).map((s, index) => <polyline key={index} points={s.map(p => `${p.x},${p.y}`).join(" ")} className="kpi-history__line" />)}
    {locations.map((location, index) => location && <circle key={points[index]!.periodStart} cx={location.x} cy={location.y} r="4" data-value={Number(points[index]!.scores[metric])}><title>{points[index]!.periodStart} — {points[index]!.periodEnd}: {historyScore(points[index]!, metric)}</title></circle>)}
    {points.map((p, index) => (index === 0 || index === points.length - 1 || index % 3 === 0) && <text key={p.periodStart} x={48 + index * 600 / Math.max(1, points.length - 1)} y="220" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{historyPeriod(p, granularity)}</text>)}
  </svg><p>Los espacios sin puntos indican datos ausentes o indicadores no aplicables, no resultados en cero.</p></div>;
}
