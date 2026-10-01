import type { PerformanceTechnicianRow } from "../../models/performance-analytics";
import "./performance-analytics.css";

const label: Record<keyof PerformanceTechnicianRow["dimensions"], string> = { productivity: "Productividad", compliance: "Cumplimiento", efficiency: "Eficiencia", quality: "Calidad" };
export function PerformanceTable({ rows, showTeam, onSelect }: { rows: PerformanceTechnicianRow[]; showTeam: boolean; onSelect(row: PerformanceTechnicianRow): void }) {
  return <section className="performance-table" aria-label={showTeam ? "Comparativa de técnicos" : "Mi rendimiento"}>{rows.map((row) => <button className="performance-row" type="button" key={row.technicianId} onClick={() => onSelect(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row); } }} aria-label={`Ver detalle de ${row.fullName}`}>
    <span className="performance-row__identity"><b>{row.fullName}</b><small>{row.code} · {row.completedJobs} trabajos</small></span><span className="performance-row__score">{row.overallScore?.toFixed(1) ?? "—"}<small>puntaje</small></span>
    <span className="performance-row__dimensions">{(Object.keys(label) as Array<keyof typeof label>).map((key) => <i key={key}>{label[key]} {row.dimensions[key] === null ? "—" : `${row.dimensions[key]!.toFixed(1)}%`}</i>)}</span>
    <span className="performance-row__alert">{row.alerts[0]?.message ?? "Sin alertas activas"}</span>
  </button>)}</section>;
}
