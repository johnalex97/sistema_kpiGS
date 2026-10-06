import { RefreshCw } from "lucide-react";
import { useWeeklyGoal } from "../components/reports/WeeklyGoalContext";
import { formatCredits } from "../components/reports/goal-format";
import { KpiManagementPanel } from "../components/kpis/KpiManagementPanel";
import { PerformanceAnalyticsPage } from "./PerformanceAnalyticsPage";
import "../components/reports/reports.css";

export function ReportsPage() {
  const goal = useWeeklyGoal();
  return <div className="reports-workspace">
    {goal && <section className="weekly-goals" aria-label="Metas de esta semana">
      <header><div><p className="eyebrow">Semana actual · Honduras</p><h2>Metas de esta semana</h2><p>Desde {goal.weekStart} · Trabajos completados acreditados por participación.</p></div><button className="button button--ghost" type="button" onClick={goal.refresh} disabled={goal.status === "loading"}><RefreshCw size={16} />Actualizar metas</button></header>
      <p className="weekly-goals__note">Un trabajo compartido se reparte según los minutos productivos de cada técnico; no se cuenta como un trabajo completo para cada participante.</p>
      {goal.status === "loading" && <p role="status">Consultando metas reales…</p>}
      {goal.status === "error" && <p role="alert">{goal.errorCode === "KPI_CONFIG_MISSING" ? "No existe configuración KPI vigente para esta semana. Un administrador debe preparar la configuración inicial; no se mostrarán porcentajes hasta entonces." : "No fue posible consultar las metas. Usa Actualizar metas para reintentar."}</p>}
      {goal.status === "ready" && goal.data && <>
        <p className="weekly-goals__source">{goal.data.status === "PREVIEW" ? "Avance provisional de la semana abierta" : "Resultado oficial de la semana"}</p>
        {goal.data.warnings.some(warning => warning.code === "MISSING_TARGET") && <p role="status">Hay técnicos sin meta configurada; el avance solo incluye a quienes tienen meta.</p>}
        {goal.data.items.length === 0 ? <p>Sin meta configurada. Un usuario autorizado puede asignarla desde Administrar KPI.</p> : <div className="weekly-goals__rows">{goal.data.items.map(item => <article className="weekly-goals__row" key={item.technicianId}>
          <div><strong>{item.fullName}</strong><small>{item.code}</small></div><div><span>Trabajos acreditados</span><b>{formatCredits(Number(item.completedCredits))} / {formatCredits(item.appliedTarget ?? 0)}</b></div><div><span>Avance</span><b>{item.appliedTarget ? `${Math.round(Number(item.completedCredits) / item.appliedTarget * 100)}%` : "Sin meta"}</b></div>
        </article>)}</div>}
        <KpiManagementPanel api={goal.api} periodStart={goal.weekStart} capabilities={goal.data.capabilities} onChanged={goal.refresh} />
      </>}
    </section>}
    <PerformanceAnalyticsPage reportMode />
  </div>;
}
