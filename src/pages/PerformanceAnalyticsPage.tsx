import { useEffect, useState } from "react";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { createPerformanceAnalyticsApi, type PerformanceAnalyticsApi } from "../api/performance-analytics";
import { createOrderLookupApi, type OrderLookupApi } from "../api/order-lookups";
import { PerformanceDetail } from "../components/performance-analytics/PerformanceDetail";
import { PerformanceFilters } from "../components/performance-analytics/PerformanceFilters";
import { PerformanceSummary } from "../components/performance-analytics/PerformanceSummary";
import { PerformanceTable } from "../components/performance-analytics/PerformanceTable";
import "../components/performance-analytics/performance-analytics.css";
import { usePerformanceAnalytics } from "../hooks/usePerformanceAnalytics";
import type { PerformanceAnalyticsQuery, PerformanceGranularity } from "../models/performance-analytics";

function mondayOfCurrentWeek() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function queryFromLocation(): PerformanceAnalyticsQuery {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("granularity")?.toUpperCase();
  const granularity: PerformanceGranularity = candidate === "MONTH" || candidate === "YEAR" || candidate === "WEEK" ? candidate : "WEEK";
  const optional = (key: "clientId" | "branchId" | "serviceTypeId" | "orderStatus") => params.get(key) || undefined;
  return { granularity, periodStart: params.get("periodStart") || mondayOfCurrentWeek(), clientId: optional("clientId"), branchId: optional("branchId"), serviceTypeId: optional("serviceTypeId"), orderStatus: optional("orderStatus") };
}

export function PerformanceAnalyticsPage({ api, lookupApi }: { api?: PerformanceAnalyticsApi; lookupApi?: OrderLookupApi }) {
  const { user } = useAuth();
  const [defaultApi] = useState(() => createPerformanceAnalyticsApi());
  const [defaultLookupApi] = useState(() => createOrderLookupApi());
  const [initialQuery] = useState(() => queryFromLocation());
  const { state, query, setQuery, retry, exportCsv } = usePerformanceAnalytics(api ?? defaultApi, initialQuery);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const showTeam = Boolean(user?.permissions.includes("KPI_VIEW_ALL"));
  const selected = state.status === "success"
    ? state.data.rows.find(({ technicianId }) => technicianId === selectedTechnicianId) ?? null
    : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("granularity", query.granularity);
    params.set("periodStart", query.periodStart);
    for (const key of ["clientId", "branchId", "serviceTypeId", "orderStatus"] as const) {
      if (query[key]) params.set(key, query[key]); else params.delete(key);
    }
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [query]);

  const download = async () => {
    setDownloadError(null);
    try {
      const file = await exportCsv();
      if (typeof URL.createObjectURL !== "function") return;
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename || "rendimiento-tecnico.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("No fue posible preparar el archivo. Intenta exportarlo nuevamente.");
    }
  };

  return <div className="performance-workspace">
    <section className="performance-workspace__heading"><div><p className="eyebrow">Bitácora de desempeño</p><h2>Lectura de ejecución y calidad</h2><p>Relaciona el resultado de cada técnico con las señales que requieren seguimiento.</p></div><span className="performance-workspace__key"><i aria-hidden="true" />Datos autorizados</span></section>
    <PerformanceFilters query={query} onChange={(nextQuery) => { setSelectedTechnicianId(null); setQuery(nextQuery); }} onExport={() => { void download(); }} exportDisabled={state.status !== "success"} lookupApi={lookupApi ?? defaultLookupApi} />
    {downloadError && <p className="performance-feedback" role="alert"><AlertTriangle size={17} />{downloadError}</p>}
    {state.data && <PerformanceSummary summary={state.data} showTeam={showTeam} />}
    {state.status === "loading" && !state.data && <section className="performance-state" role="status" aria-label="Cargando rendimiento"><span aria-hidden="true" />Consultando desempeño autorizado…</section>}
    {state.status === "error" && <section className="performance-state performance-state--error" role="alert"><AlertTriangle size={18} /><div><strong>No fue posible cargar el análisis</strong><p>{state.message}</p></div><button className="button" type="button" onClick={retry}><RefreshCw size={16} />Reintentar</button></section>}
    {state.status === "empty" && <section className="performance-state" role="status" aria-label="Sin datos de rendimiento"><Download size={18} /><div><strong>No hay trabajo registrado en este periodo.</strong><p>Cambia la fecha o consulta otra ventana de rendimiento.</p></div></section>}
    {state.data && state.data.rows.length > 0 && <section className="performance-results"><header><div><p className="eyebrow">{showTeam ? "Comparativa autorizada" : "Tu lectura individual"}</p><h3>{showTeam ? "Rendimiento por técnico" : "Mi rendimiento"}</h3></div><span>{state.data.rows.length} registro{state.data.rows.length === 1 ? "" : "s"}</span></header><PerformanceTable rows={state.data.rows} showTeam={showTeam} onSelect={(row) => setSelectedTechnicianId(row.technicianId)} /></section>}
    {selected && <PerformanceDetail row={selected} onClose={() => setSelectedTechnicianId(null)} />}
  </div>;
}
