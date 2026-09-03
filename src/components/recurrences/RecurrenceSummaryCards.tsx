import { AlertTriangle, RefreshCw } from "lucide-react";
import type { LoadState } from "../../hooks/useRecurrencesWorkspace";
import type { RecurrenceSummaryMetrics } from "../../models/recurrence";
import { formatCount, formatCurrency, formatMinutes } from "./recurrence-format";

export interface RecurrenceSummaryCardsProps {
  metrics: RecurrenceSummaryMetrics | null;
  state: LoadState;
  onRetry(): void;
}

export function RecurrenceSummaryCards({ metrics, state, onRetry }: RecurrenceSummaryCardsProps) {
  if (!metrics && state === "loading") {
    return <div className="recurrence-summary-state" role="status" aria-label="Cargando resumen"><span aria-hidden="true" />Cargando resumen de reincidencias…</div>;
  }

  if (!metrics && state === "error") {
    return <div className="recurrence-summary-state recurrence-summary-state--error" role="alert"><AlertTriangle size={19} aria-hidden="true" /><span><strong>No fue posible cargar el resumen</strong><small>Reintenta para recuperar los indicadores del periodo.</small></span><button className="button button--ghost" type="button" onClick={onRetry}>Reintentar resumen</button></div>;
  }

  if (!metrics) return null;

  return <section className="recurrence-summary" aria-label="Resumen de reincidencias">
    <div className="recurrence-summary__primary"><span className="recurrence-summary__label">Tasa del periodo</span><strong>{metrics.recurrenceRate}%</strong><small>{formatCount(metrics.totalCases)} casos sobre {formatCount(metrics.completedBaseOrders)} órdenes terminadas</small></div>
    <div><span className="recurrence-summary__label">Casos detectados</span><strong>{formatCount(metrics.totalCases)}</strong><small>{formatCount(metrics.openCases)} abiertos · {formatCount(metrics.highImpactCases)} de impacto alto</small></div>
    <div><span className="recurrence-summary__label">Carga adicional</span><strong>{formatCount(metrics.additionalVisits)}</strong><small>{formatCount(metrics.additionalVisits)} visitas · {formatMinutes(metrics.additionalMinutes)}</small></div>
    <div><span className="recurrence-summary__label">Costo estimado</span><strong>{formatCurrency(metrics.estimatedCost)}</strong><small>Acumulado del periodo filtrado</small></div>
    {state === "loading" && <p className="recurrence-summary__refreshing" role="status"><RefreshCw size={13} aria-hidden="true" />Actualizando resumen…</p>}
    {state === "error" && <p className="recurrence-summary__warning" role="status"><AlertTriangle size={13} aria-hidden="true" />El resumen visible puede estar desactualizado. <button type="button" onClick={onRetry}>Reintentar</button></p>}
  </section>;
}
