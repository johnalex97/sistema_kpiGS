import { useState, type FormEvent } from "react";
import type { KpiApi } from "../../api/kpis";
export function KpiTargetForm({ api, periodStart, onSaved }: { api: KpiApi; periodStart: string; onSaved(): void }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const end = new Date(`${periodStart}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 6); setError(""); try {
    await api.createTarget({ technicianId: data.get("technicianId"), periodStart, periodEnd: end.toISOString().slice(0, 10), targetJobs: Number(data.get("targetJobs")), targetProductiveMinutes: Number(data.get("targetMinutes")), observation: data.get("observation") }); onSaved();
  } catch (reason) { setError(reason instanceof Error ? reason.message : "No se guardó la meta"); } }
  return <form className="kpi-management-form" onSubmit={submit}><div className="kpi-form-grid"><label className="field"><span>ID del técnico</span><input name="technicianId" required /></label><label className="field"><span>Trabajos objetivo</span><input name="targetJobs" type="number" min="1" required /></label><label className="field"><span>Minutos productivos</span><input name="targetMinutes" type="number" min="1" required /></label><label className="field"><span>Observación</span><input name="observation" maxLength={500} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary">Guardar meta semanal</button></form>;
}
