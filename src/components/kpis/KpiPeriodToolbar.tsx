import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KpiGranularity, KpiPeriod } from "../../models/kpi";
export function KpiPeriodToolbar({ period, setGranularity, previous, next }: { period: KpiPeriod; setGranularity(value: KpiGranularity): void; previous(): void; next(): void }) {
  return <div className="kpi-period-toolbar" aria-label="Periodo KPI">
    <div className="kpi-granularity">{(["WEEK", "MONTH", "YEAR"] as const).map((value) => <button key={value} className={period.granularity === value ? "is-active" : ""} onClick={() => setGranularity(value)}>{value === "WEEK" ? "Semana" : value === "MONTH" ? "Mes" : "Año"}</button>)}</div>
    <div className="kpi-period-nav"><button aria-label="Periodo anterior" onClick={previous}><ChevronLeft size={16} /></button><time>{period.periodStart}</time><button aria-label="Periodo siguiente" onClick={next}><ChevronRight size={16} /></button></div>
  </div>;
}
