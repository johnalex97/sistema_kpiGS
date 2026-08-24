import type { KpiDashboardItem } from "../../models/kpi";
export function KpiRanking({ items }: { items: KpiDashboardItem[] }) {
  const ranked = [...items].sort((a, b) => Number(b.overallScore) - Number(a.overallScore));
  return <div className="panel ranking"><div className="panel-heading"><p className="eyebrow">Calidad + rendimiento</p><h2>Clasificación</h2></div><div className="ranking-list">{ranked.map((item, index) => <div className="ranking-row" key={item.technicianId}><b className="rank-num">{String(index + 1).padStart(2, "0")}</b><span className="rank-name">{item.fullName}<small>{item.code}</small></span><strong className="kpi-rank-score">{item.overallScore}</strong></div>)}</div></div>;
}
