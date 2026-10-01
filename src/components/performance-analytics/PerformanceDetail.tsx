import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { PerformanceTechnicianRow } from "../../models/performance-analytics";
import "./performance-analytics.css";

const dimensions: Array<[keyof PerformanceTechnicianRow["dimensions"], string]> = [["productivity", "Productividad"], ["compliance", "Cumplimiento"], ["efficiency", "Eficiencia"], ["quality", "Calidad"]];
function percent(value: number | null) { return value === null ? "Sin dato" : `${value.toFixed(1)}%`; }
function supportingMetric(row: PerformanceTechnicianRow, code: string) {
  if (code.includes("RECURRENCE")) return `Reincidencias atribuibles: ${row.attributableRecurrences} · tasa ${percent(row.recurrenceRate)}`;
  if (code.includes("QUALITY")) return `Calidad: ${percent(row.dimensions.quality)}`;
  if (code.includes("PRODUCTIVITY")) return `Productividad: ${percent(row.dimensions.productivity)}`;
  if (code.includes("COMPLIANCE")) return `Cumplimiento: ${percent(row.dimensions.compliance)}`;
  return `Eficiencia: ${percent(row.dimensions.efficiency)}`;
}

export function PerformanceDetail({ row, onClose }: { row: PerformanceTechnicianRow; onClose(): void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="performance-detail-backdrop" role="presentation"><aside className="performance-detail" role="dialog" aria-modal="true" aria-label={`Detalle de ${row.fullName}`}>
    <header><div><p className="eyebrow">Lectura individual</p><h2>{row.fullName}</h2><span>{row.code} · {row.completedJobs} trabajos finalizados</span></div><button ref={closeButton} className="icon-button" type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={19} /></button></header>
    <div className="performance-detail__body"><section className="performance-detail__score"><span>Puntaje global</span><strong>{percent(row.overallScore)}</strong><small>{row.comparison === null ? "Sin comparación previa" : `${row.comparison >= 0 ? "+" : ""}${row.comparison.toFixed(1)} puntos frente al periodo anterior`}</small></section>
      <section className="performance-detail__metrics" aria-label="Dimensiones de desempeño">{dimensions.map(([key, title]) => <div key={key}><span>{title}</span><strong>{percent(row.dimensions[key])}</strong></div>)}</section>
      <section className="performance-detail__facts"><div><span>Tiempo registrado</span><b>{row.registeredMinutes} min</b></div><div><span>Tiempo productivo</span><b>{row.productiveMinutes} min</b></div><div><span>Pausas</span><b>{row.pausedMinutes} min</b></div></section>
      {row.officialFacts && <section className="performance-detail__facts" aria-label="Base del resultado oficial"><div><span>Meta aplicada</span><b>{row.officialFacts.appliedTarget.toFixed(2)} créditos</b></div><div><span>Créditos completados</span><b>{row.officialFacts.completedCredits.toFixed(2)}</b></div><div><span>Elegibles a tiempo</span><b>{row.officialFacts.onTimeEligibleCredits.toFixed(2)} / {row.officialFacts.eligibleCredits.toFixed(2)}</b></div><div><span>Créditos de reincidencia</span><b>{row.officialFacts.attributableRecurrenceCredits.toFixed(2)}</b></div><div><span>Cobertura oficial</span><b>{row.officialFacts.coverage} semanas</b></div></section>}
      <section className="performance-detail__alerts" aria-label="Alertas y evidencia"><h3>Señales a revisar</h3>{row.alerts.length ? row.alerts.map((alert) => <article key={alert.code} className={`performance-detail__alert performance-detail__alert--${alert.level.toLowerCase()}`}><strong>{alert.message}</strong><span>{supportingMetric(row, alert.code)}</span></article>) : <p>Sin alertas activas para este técnico.</p>}</section>
    </div>
  </aside></div>;
}
