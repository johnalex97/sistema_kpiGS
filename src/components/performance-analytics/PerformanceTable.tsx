import { useMemo, useState } from "react";
import type { PerformanceTechnicianRow } from "../../models/performance-analytics";
import "./performance-analytics.css";

const label: Record<keyof PerformanceTechnicianRow["dimensions"], string> = { productivity: "Productividad", compliance: "Cumplimiento", efficiency: "Eficiencia", quality: "Calidad" };
type SortKey = "overall" | "quality" | "productivity" | "efficiency" | "recurrences";
const sortOptions: Array<[SortKey, string]> = [["overall", "Puntaje general"], ["quality", "Calidad"], ["productivity", "Productividad"], ["efficiency", "Eficiencia"], ["recurrences", "Reincidencias atribuibles"]];

function sortValue(row: PerformanceTechnicianRow, key: SortKey): number | null {
  if (key === "overall") return row.overallScore;
  if (key === "recurrences") return row.attributableRecurrences;
  return row.dimensions[key];
}
export function PerformanceTable({ rows: inputRows, showTeam, onSelect }: { rows: PerformanceTechnicianRow[]; showTeam: boolean; onSelect(row: PerformanceTechnicianRow): void }) {
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const sortedRows = useMemo(() => showTeam ? [...inputRows].sort((left, right) => {
    const leftValue = sortValue(left, sortKey); const rightValue = sortValue(right, sortKey);
    if (leftValue === null) return rightValue === null ? left.fullName.localeCompare(right.fullName) : 1;
    if (rightValue === null) return -1;
    return rightValue - leftValue || left.fullName.localeCompare(right.fullName);
  }) : inputRows, [inputRows, showTeam, sortKey]);
  const rows = sortedRows;
  const sortControl = showTeam && <label className="performance-table__sort"><span>Ordenar comparativa por</span><select aria-label="Ordenar comparativa por" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>{sortOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  return <section className="performance-table" aria-label={showTeam ? "Comparativa de técnicos" : "Mi rendimiento"}>{sortControl}{rows.map((row) => <button className="performance-row" type="button" key={row.technicianId} onClick={() => onSelect(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row); } }} aria-label={`Ver detalle de ${row.fullName}`}>
    <span className="performance-row__identity"><b>{row.fullName}</b><small>{row.code} · {row.completedJobs} trabajos</small></span><span className="performance-row__score">{row.overallScore?.toFixed(1) ?? "—"}<small>puntaje</small></span>
    <span className="performance-row__dimensions">{(Object.keys(label) as Array<keyof typeof label>).map((key) => <i key={key}>{label[key]} {row.dimensions[key] === null ? "—" : `${row.dimensions[key]!.toFixed(1)}%`}</i>)}</span>
    <span className="performance-row__alert">{row.alerts[0]?.message ?? "Sin alertas activas"}</span>
  </button>)}</section>;
}
