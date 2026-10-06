import type { HistoryGranularity, HistoryMetric, HistoryPoint } from "../../models/kpi-history";
export const historyMetrics: Array<[HistoryMetric, string]> = [["overall", "Índice general"], ["productivity", "Productividad"], ["compliance", "Cumplimiento"], ["efficiency", "Eficiencia"], ["quality", "Calidad"]];
export function historyPeriod(point: HistoryPoint, granularity: HistoryGranularity) {
  const format = new Intl.DateTimeFormat("es-HN", { timeZone: "UTC", ...(granularity === "YEAR" ? { year: "numeric" as const } : granularity === "MONTH" ? { month: "short" as const, year: "numeric" as const } : { day: "2-digit" as const, month: "short" as const }) });
  const start = format.format(new Date(`${point.periodStart}T00:00:00Z`));
  return granularity === "WEEK" ? `${start} – ${format.format(new Date(`${point.periodEnd}T00:00:00Z`))}` : start;
}
export function historyScore(point: HistoryPoint, metric: HistoryMetric) {
  const value = point.scores[metric];
  return value === null ? point.status === "NO_DATA" ? "Sin datos" : "No aplica" : `${Number(value).toFixed(2)}%`;
}
