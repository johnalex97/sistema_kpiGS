import type { PerformanceAnalyticsQuery, PerformanceGranularity } from "../../models/performance-analytics";
import "./performance-analytics.css";

export function PerformanceFilters({ query, onChange, onExport, disabled = false }: { query: PerformanceAnalyticsQuery; onChange(query: PerformanceAnalyticsQuery): void; onExport(): void; disabled?: boolean }) {
  return <section className="performance-filters" aria-label="Filtros de rendimiento">
    <label><span>Periodo</span><select aria-label="Periodo" value={query.granularity} disabled={disabled} onChange={(event) => onChange({ ...query, granularity: event.target.value as PerformanceGranularity })}><option value="WEEK">Semana</option><option value="MONTH">Mes</option><option value="YEAR">Año</option></select></label>
    <label><span>Fecha de inicio</span><input aria-label="Fecha de inicio" type="date" value={query.periodStart} disabled={disabled} onChange={(event) => onChange({ ...query, periodStart: event.target.value })} /></label>
    <button className="button performance-filters__export" type="button" disabled={disabled} onClick={onExport}>Exportar CSV</button>
  </section>;
}
