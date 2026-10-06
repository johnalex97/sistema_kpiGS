import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { createKpiHistoryApi, type KpiHistoryApi } from "../../api/kpi-history";
import { useKpiHistory } from "../../hooks/useKpiHistory";
import type { HistoryGranularity, HistoryMetric, HistoryTechnician } from "../../models/kpi-history";
import { HistoryTechnicianPicker } from "./HistoryTechnicianPicker";
import { KpiHistoryChart } from "./KpiHistoryChart";
import { KpiHistoryTable } from "./KpiHistoryTable";
import { historyMetrics } from "./history-format";
import "./kpi-history.css";

function today() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function KpiHistoryPanel({ api, initialTechnicianId = null }: { api?: KpiHistoryApi; initialTechnicianId?: string | null }) {
  const { user } = useAuth();
  const session = JSON.stringify([user?.id, user?.technicianId, user?.permissions]);
  // A new authenticated identity never inherits a previous selection, even before effects run.
  const [initialSession] = useState(session);
  return <HistoryPanelSession key={session} api={api} initialTechnicianId={session === initialSession ? initialTechnicianId : null} />;
}
function HistoryPanelSession({ api, initialTechnicianId }: { api?: KpiHistoryApi; initialTechnicianId: string | null }) {
  const { user } = useAuth(); const [defaultApi] = useState(createKpiHistoryApi);
  const currentApi = api ?? defaultApi;
  const all = Boolean(user?.permissions.includes("KPI_VIEW_ALL")); const own = Boolean(user?.permissions.includes("KPI_VIEW_OWN"));
  const [selectedId, setSelectedId] = useState(initialTechnicianId); const [selected, setSelected] = useState<HistoryTechnician | null>(null);
  const [granularity, setGranularity] = useState<HistoryGranularity>("WEEK"); const [metric, setMetric] = useState<HistoryMetric>("overall"); const [endDate, setEndDate] = useState(today);
  const id = all ? selectedId : own ? user?.technicianId ?? null : null;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate <= today();
  const session = JSON.stringify([user?.id, user?.technicianId, user?.permissions]);
  const { state, retry } = useKpiHistory(currentApi, validDate ? id : null, { granularity, endDate }, session);
  const data = state.data;
  return <section className="kpi-history" aria-labelledby="kpi-history-title"><header><div><p className="eyebrow">Evolución oficial</p><h3 id="kpi-history-title">Historial del técnico</h3><p>Compara su ejecución y calidad a lo largo del tiempo, independientemente de los filtros de arriba.</p></div><span className="kpi-history__window">{granularity === "YEAR" ? "5 años" : granularity === "MONTH" ? "12 meses" : "12 semanas"}</span></header>
    {all && <HistoryTechnicianPicker api={currentApi} value={data?.technician ?? selected} onSelect={t => { setSelected(t); setSelectedId(t.id); }} />}
    {!all && own && !id ? <p role="status">Tu cuenta no tiene un técnico vinculado. Pide al administrador que vincule tu perfil en Técnicos.</p> : !all && !own ? <p>No tienes permiso para consultar este historial.</p> : <>
      <div className="kpi-history__controls"><label>Periodo del historial<select value={granularity} onChange={e => setGranularity(e.target.value as HistoryGranularity)}><option value="WEEK">Semana</option><option value="MONTH">Mes</option><option value="YEAR">Año</option></select></label><label>Hasta · Honduras<input type="date" value={endDate} max={today()} onChange={e => setEndDate(e.target.value)} /></label><label>Indicador del historial<select value={metric} onChange={e => setMetric(e.target.value as HistoryMetric)}>{historyMetrics.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
      {!validDate && <p role="alert">Selecciona una fecha válida, no posterior a hoy.</p>}
      {validDate && state.status === "idle" && <p className="kpi-history__empty">Selecciona un técnico para consultar su historial oficial.</p>}
      {state.status === "loading" && <p role="status">Cargando historial oficial…</p>}
      {state.status === "error" && <div role="alert"><p>No fue posible cargar el historial. {state.error}</p><button type="button" onClick={retry}>Reintentar historial</button></div>}
      {data && <><div className="kpi-history__identity"><strong>{data.technician.fullName}</strong><span>{data.technician.code}{data.technician.inactive ? " · Inactivo con historial" : ""} · Referencia: {data.referenceDate}</span></div>
        {data.points.every(p => p.status === "NO_DATA") && <p className="kpi-history__empty">No hay resultados oficiales en esta ventana. Aparecerán al cerrar semanas; esto no significa rendimiento cero.</p>}
        <KpiHistoryChart points={data.points} metric={metric} granularity={granularity} />
        <p className="kpi-history__coverage">Cobertura = semanas oficiales / semanas del periodo completo. Una cobertura parcial puede incluir semanas pendientes y no significa bajo rendimiento. Meses y años agrupan cada semana por su domingo.</p>
        <KpiHistoryTable points={data.points} granularity={granularity} />
      </>}
    </>}
  </section>;
}
