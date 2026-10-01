import type { PerformanceAnalyticsSummary } from "../../models/performance-analytics";
import "./performance-analytics.css";

function score(value: number | null) { return value === null ? "—" : `${value.toFixed(1)}%`; }

export function PerformanceSummary({ summary, showTeam }: { summary: PerformanceAnalyticsSummary; showTeam: boolean }) {
  const start = new Intl.DateTimeFormat("es-HN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${summary.period.periodStart}T12:00:00`));
  const end = new Intl.DateTimeFormat("es-HN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${summary.period.periodEnd}T12:00:00`));
  return <section className="performance-summary" aria-label="Resumen del periodo">
    <div className="performance-summary__period"><span>Ventana de lectura</span><strong>{start} — {end}</strong><small>{summary.status === "OFFICIAL" ? "Resultado oficial" : "Vista previa mientras se consolida el periodo"}</small></div>
    {showTeam && <div><span>Promedio del equipo</span><strong>{score(summary.teamAverage)}</strong><small>{summary.rows.length} técnicos incluidos</small></div>}
    <div><span>Trabajos finalizados</span><strong>{summary.rows.reduce((total, row) => total + row.completedJobs, 0)}</strong><small>registrados en este periodo</small></div>
  </section>;
}
