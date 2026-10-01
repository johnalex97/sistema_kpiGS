import { useState, type FormEvent } from "react";
import type { KpiApi } from "../../api/kpis";

export function KpiConfigurationForm({ api, periodStart, onSaved }: { api: KpiApi; periodStart: string; onSaved(): void }) {
  const [weights, setWeights] = useState({ productivity: 20, compliance: 25, efficiency: 25, quality: 30 });
  const [limits, setLimits] = useState({ qualityCriticalThreshold: 60, recurrenceCriticalThreshold: 10, productivityAttentionThreshold: 70, complianceAttentionThreshold: 70, efficiencyAttentionThreshold: 70 });
  const [error, setError] = useState(""); const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const field = (key: keyof typeof weights, label: string) => <label className="field"><span>{label}</span><input aria-label={`${label} (%)`} type="number" min="0" max="100" value={weights[key]} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>;
  const limit = (key: keyof typeof limits, label: string) => <label className="field"><span>{label}</span><input aria-label={`${label} (%)`} type="number" min="0" max="100" step="0.01" value={limits[key]} onChange={(event) => setLimits((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>;
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try {
    const start = new Date(`${periodStart}T00:00:00Z`); start.setUTCDate(start.getUTCDate() + 7);
    await api.createConfiguration({ validFrom: start.toISOString().slice(0, 10), productivityWeight: (weights.productivity / 100).toFixed(4), complianceWeight: (weights.compliance / 100).toFixed(4), efficiencyWeight: (weights.efficiency / 100).toFixed(4), qualityWeight: (weights.quality / 100).toFixed(4), ...Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, value.toFixed(2)])), description: "Configuración creada desde el dashboard" }); onSaved();
  } catch (reason) { setError(reason instanceof Error ? reason.message : "No se guardó la configuración"); } }
  return <form className="kpi-management-form" onSubmit={submit}><div className="kpi-form-grid">{field("productivity", "Productividad")}{field("compliance", "Cumplimiento")}{field("efficiency", "Eficiencia")}{field("quality", "Calidad")}</div><p className={total === 100 ? "kpi-total is-valid" : "kpi-total"}>Total: {total}%</p><fieldset><legend>Límites de alerta</legend><div className="kpi-form-grid">{limit("qualityCriticalThreshold", "Calidad mínima")}{limit("recurrenceCriticalThreshold", "Reincidencia máxima")}{limit("productivityAttentionThreshold", "Productividad mínima")}{limit("complianceAttentionThreshold", "Cumplimiento mínimo")}{limit("efficiencyAttentionThreshold", "Eficiencia mínima")}</div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary" disabled={total !== 100}>Guardar ponderaciones</button></form>;
}
