import { useState, type FormEvent } from "react";
import type { KpiApi } from "../../api/kpis";
export function KpiConfigurationForm({ api, periodStart, onSaved }: { api: KpiApi; periodStart: string; onSaved(): void }) {
  const [values, setValues] = useState({ productivity: 20, compliance: 25, efficiency: 25, quality: 30 });
  const [error, setError] = useState("");
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  const field = (key: keyof typeof values, label: string) => <label className="field"><span>{label}</span><input aria-label={`${label} (%)`} type="number" min="0" max="100" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>;
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try {
    const start = new Date(`${periodStart}T00:00:00Z`); start.setUTCDate(start.getUTCDate() + 7);
    await api.createConfiguration({ validFrom: start.toISOString().slice(0, 10), productivityWeight: (values.productivity / 100).toFixed(4), complianceWeight: (values.compliance / 100).toFixed(4), efficiencyWeight: (values.efficiency / 100).toFixed(4), qualityWeight: (values.quality / 100).toFixed(4), description: "Configuración creada desde el dashboard" }); onSaved();
  } catch (reason) { setError(reason instanceof Error ? reason.message : "No se guardaron las ponderaciones"); } }
  return <form className="kpi-management-form" onSubmit={submit}><div className="kpi-form-grid">{field("productivity", "Productividad")}{field("compliance", "Cumplimiento")}{field("efficiency", "Eficiencia")}{field("quality", "Calidad")}</div><p className={total === 100 ? "kpi-total is-valid" : "kpi-total"}>Total: {total}%</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary" disabled={total !== 100}>Guardar ponderaciones</button></form>;
}
