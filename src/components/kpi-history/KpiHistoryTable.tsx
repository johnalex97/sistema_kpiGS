import type { HistoryGranularity, HistoryPoint } from "../../models/kpi-history";
import { historyMetrics, historyPeriod, historyScore } from "./history-format";
export function KpiHistoryTable({ points, granularity }: { points: HistoryPoint[]; granularity: HistoryGranularity }) {
  return <div className="kpi-history__table" role="region" aria-label="Tabla de historial, desplazable horizontalmente" tabIndex={0}>
    <table aria-label="Historial oficial por periodo"><thead><tr><th scope="col">Periodo</th>{historyMetrics.map(([key, label]) => <th key={key} scope="col">{label}</th>)}<th scope="col">Cobertura</th><th scope="col">Estado</th></tr></thead><tbody>{points.map(p => <tr key={p.periodStart}><th scope="row">{historyPeriod(p, granularity)}<small>{p.periodStart} — {p.periodEnd}</small></th>{historyMetrics.map(([key]) => <td key={key}>{historyScore(p, key)}</td>)}<td>{p.officialWeeks} / {p.expectedWeeks}{p.partial ? " · Parcial" : " · Completa"}</td><td>{p.status === "NO_DATA" ? "Sin datos" : p.status === "REVISED" ? "Revisado" : "Oficial"}</td></tr>)}</tbody></table>
  </div>;
}
