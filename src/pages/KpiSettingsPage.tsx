import { useEffect, useState, type FormEvent } from "react";
import { createKpiApi, createKpiManagementApi, type KpiTargetRecord, type KpiConfigurationRecord } from "../api/kpis";
import { createTechnicianApi } from "../api/technicians";
import { useAuth } from "../auth/useAuth";
import { currentWeekStart } from "../hooks/technician-workspace.helpers";
import { KpiConfigurationForm } from "../components/kpis/KpiConfigurationForm";
import type { Technician } from "../models/technician";
import "../components/kpis/kpi-settings.css";

const api = createKpiApi();
const management = createKpiManagementApi();
const technicians = createTechnicianApi();
export function KpiSettingsPage({ onSavingChange }: { onSavingChange?: (saving: boolean) => void }) {
  const { hasPermission, user } = useAuth();
  const canTargets = hasPermission("KPI_MANAGE_TARGETS");
  const canConfiguration = hasPermission("KPI_MANAGE_CONFIGURATION");
  const [tab, setTab] = useState(canTargets ? "targets" : "weights");
  const [week, setWeek] = useState(currentWeekStart(new Date()));
  const [revision, setRevision] = useState(0);
  const [targets, setTargets] = useState<KpiTargetRecord[]>([]);
  const [configurations, setConfigurations] = useState<KpiConfigurationRecord[]>([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<Technician[]>([]);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<{ id: string; fullName: string; code: string } | null>(null);
  const [editing, setEditing] = useState<KpiTargetRecord | null>(null);
  const [jobs, setJobs] = useState("");
  const [minutes, setMinutes] = useState("");
  const [observation, setObservation] = useState("");
  const scopeKey = `${user?.id}:${user?.permissions.join(",")}`;
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const request = tab === "targets" && canTargets ? management.targets(week, controller.signal).then(data => { if (active) setTargets(data); }) : tab === "weights" && canConfiguration ? management.configurations(controller.signal).then(data => { if (active) setConfigurations(data); }) : Promise.resolve();
    request.then(() => { if (active) setStatus("ready"); }).catch(reason => { if (active) { setStatus("error"); setError(reason instanceof Error ? reason.message : "No se pudo consultar KPI"); } });
    return () => { active = false; controller.abort(); };
  }, [tab, week, revision, canTargets, canConfiguration, scopeKey]);
  useEffect(() => {
    if (!canTargets || !hasPermission("TECHNICIANS_VIEW") || !search.trim() || selected) return;
    const controller = new AbortController(); let active = true;
    const timer = window.setTimeout(() => {
      technicians.list({ search, page: 1, pageSize: 20, includeInactive: false }, controller.signal).then(data => { if (active) setMatches(data.items); }).catch(reason => { if (active) setSearchError(reason instanceof Error ? reason.message : "No se pudo buscar técnicos"); });
    }, 250);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [search, selected, canTargets, hasPermission, scopeKey]);
  function reload() { setStatus("loading"); setError(""); setRevision(value => value + 1); }
  function reset() { setEditing(null); setSelected(null); setSearch(""); setMatches([]); setJobs(""); setMinutes(""); setObservation(""); }
  function changeTab(value: string) { if (value === tab) return; setTab(value); setStatus("loading"); setError(""); setNotice(""); reset(); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending || !selected) return;
    setPending(true); onSavingChange?.(true); setError(""); setNotice("");
    try {
      const payload = { targetJobs: Number(jobs), targetProductiveMinutes: Number(minutes), observation };
      if (editing) await management.updateTarget(editing.id, payload);
      else { const end = new Date(`${week}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 6); await api.createTarget({ ...payload, technicianId: selected.id, periodStart: week, periodEnd: end.toISOString().slice(0, 10) }); }
      reset(); setNotice("Meta guardada"); reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la meta"); }
    finally { setPending(false); onSavingChange?.(false); }
  }
  if (!canTargets && !canConfiguration) return <p>No tienes permiso para administrar KPI.</p>;
  return <section className="kpi-settings" aria-label="Administración KPI">
    <header><p className="eyebrow">Control de desempeño</p><h2>Metas y ponderaciones</h2><p>Define objetivos semanales y conserva el historial de medición del equipo.</p></header>
    <nav aria-label="Administración KPI">{canTargets && <button type="button" disabled={pending} aria-pressed={tab === "targets"} onClick={() => changeTab("targets")}>Metas semanales</button>}{canConfiguration && <button type="button" disabled={pending} aria-pressed={tab === "weights"} onClick={() => changeTab("weights")}>Ponderaciones</button>}</nav>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {status === "loading" && <p role="status">Consultando administración KPI…</p>}
    {status === "error" && <button type="button" onClick={reload}>Reintentar consulta</button>}
    {tab === "targets" && canTargets && <>
      <label className="field"><span>Semana desde (lunes)</span><input aria-label="Semana desde (lunes)" type="date" value={week} disabled={pending} onChange={event => { setWeek(event.target.value); setStatus("loading"); reset(); }} required /></label>
      {status === "ready" && <div className="kpi-settings__targets">{targets.length === 0 ? <p>Sin metas para esta semana. Asigna el primer objetivo.</p> : targets.map(target => <article key={target.id}><div><strong>{target.tecnico.fullName}</strong><small>{target.tecnico.code} · {target.targetJobs} trabajos · {target.targetProductiveMinutes} min</small></div><button type="button" disabled={pending} aria-label={`Editar meta de ${target.tecnico.fullName}`} onClick={() => { setEditing(target); setSelected({ id: target.tecnicoId, ...target.tecnico }); setJobs(String(target.targetJobs)); setMinutes(String(target.targetProductiveMinutes)); setObservation(target.observation ?? ""); setMatches([]); setError(""); }}>Editar meta</button></article>)}</div>}
      {status === "ready" && <form onSubmit={save}><fieldset disabled={pending}><legend>{editing ? "Editar meta semanal" : "Asignar meta semanal"}</legend>
        {!editing && <label className="field"><span>Buscar técnico</span><input aria-label="Buscar técnico" value={search} disabled={!hasPermission("TECHNICIANS_VIEW")} onChange={event => { setSearch(event.target.value); setSelected(null); setMatches([]); setSearchError(""); }} autoComplete="off" /></label>}
        {!hasPermission("TECHNICIANS_VIEW") && !editing && <p>Necesitas permiso de consulta de técnicos para asignar una nueva meta.</p>}
        {searchError && <p role="alert">{searchError}</p>}
        {matches.length > 0 && <div className="kpi-settings__matches">{matches.map(tech => <button type="button" key={tech.id} onClick={() => { setSelected(tech); setSearch(tech.fullName); setMatches([]); }}>{tech.fullName} · {tech.code}</button>)}</div>}
        {selected && <p className="kpi-settings__selection">Técnico seleccionado: {selected.fullName} · {selected.code}</p>}
        <div className="kpi-form-grid"><label className="field"><span>Trabajos objetivo</span><input aria-label="Trabajos objetivo" type="number" min="1" step="1" required value={jobs} onChange={event => setJobs(event.target.value)} /></label><label className="field"><span>Minutos productivos</span><input aria-label="Minutos productivos" type="number" min="1" step="1" required value={minutes} onChange={event => setMinutes(event.target.value)} /></label><label className="field"><span>Observación</span><input value={observation} maxLength={500} onChange={event => setObservation(event.target.value)} /></label></div>
      </fieldset><button className="button button--primary" disabled={pending || !selected}>{pending ? "Guardando…" : editing ? "Guardar cambios de meta" : "Guardar meta semanal"}</button>{editing && <button type="button" disabled={pending} onClick={reset}>Cancelar edición</button>}</form>}
      <p>Las metas de semanas cerradas están protegidas. El servidor rechazará su edición y solicitará recálculo.</p>
    </>}
    {tab === "weights" && canConfiguration && status === "ready" && <>
      {configurations.length === 0 ? <p>Sin configuración KPI. Prepara la configuración inicial para medir esta semana.</p> : <div className="kpi-settings__targets">{configurations.map(config => <article key={config.id}><div><strong>Versión {config.version}{config.isActive && config.validFrom.slice(0, 10) <= currentWeekStart(new Date()) && (!config.validTo || config.validTo.slice(0, 10) >= currentWeekStart(new Date())) ? " · Vigente" : ""}</strong><small>{config.validFrom.slice(0, 10)} → {config.validTo?.slice(0, 10) ?? "Sin fecha final"}</small><small>Productividad {Number(config.productivityWeight) * 100}% · Cumplimiento {Number(config.complianceWeight) * 100}% · Eficiencia {Number(config.efficiencyWeight) * 100}% · Calidad {Number(config.qualityWeight) * 100}%</small></div></article>)}</div>}
      <KpiConfigurationForm key={revision} api={api} periodStart={currentWeekStart(new Date())} initialize={configurations.length === 0} onSavingChange={saving => { setPending(saving); onSavingChange?.(saving); }} onSaved={() => { setNotice("Ponderaciones guardadas"); reload(); }} />
    </>}
  </section>;
}
