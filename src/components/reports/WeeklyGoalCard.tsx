import { ArrowRight } from "lucide-react";
import { useWeeklyGoal } from "./WeeklyGoalContext";
import { formatCredits } from "./goal-format";

export function WeeklyGoalCard({ onDetail }: { onDetail: () => void }) {
  const goal = useWeeklyGoal();
  if (!goal) return null;
  const items = goal.data?.items ?? [];
  const target = items.reduce((sum, item) => sum + (item.appliedTarget ?? 0), 0);
  const completed = items.reduce((sum, item) => sum + Number(item.completedCredits), 0);
  const percent = target > 0 ? Math.round(completed / target * 100) : null;
  const incomplete = goal.data?.warnings.some(warning => warning.code === "MISSING_TARGET");
  return <section className="sidebar-card" aria-label="Avance semanal">
    <div className="sidebar-card__head"><span>Meta semanal</span>{goal.status === "ready" && percent !== null && <b>{percent}%</b>}</div>
    {goal.status === "loading" && <p role="status">Consultando meta…</p>}
    {goal.status === "error" && <><p role="status">{goal.errorCode === "KPI_CONFIG_MISSING" ? "Falta configuración KPI vigente." : "No se pudo consultar la meta."}</p><button type="button" onClick={goal.refresh}>Reintentar meta</button></>}
    {goal.status === "ready" && (percent === null ? <p>Sin meta configurada</p> : <>
      <div className="mini-progress" role="progressbar" aria-label="Meta semanal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-valuetext={`${percent}% de la meta`}><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
      <p>{formatCredits(completed)} de {formatCredits(target)} trabajos acreditados</p>
    </>)}
    {incomplete && target > 0 && <p>Avance parcial: hay técnicos sin meta.</p>}
    <button type="button" onClick={onDetail}>Ver detalle <ArrowRight size={14} /></button>
  </section>;
}
