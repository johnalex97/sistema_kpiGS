import { AlertTriangle, ArrowRight } from "lucide-react";
import { createKpiApi, type KpiApi } from "../api/kpis";
import { RecentWorkTable } from "../components/dashboard/RecentWorkTable";
import { Avatar } from "../components/common/Avatar";
import { PanelTitle } from "../components/common/PanelTitle";
import { KpiPeriodToolbar } from "../components/kpis/KpiPeriodToolbar";
import { KpiRanking } from "../components/kpis/KpiRanking";
import { KpiScoreCards } from "../components/kpis/KpiScoreCards";
import { KpiTrend } from "../components/kpis/KpiTrend";
import { KpiManagementPanel } from "../components/kpis/KpiManagementPanel";
import { useKpiDashboard } from "../hooks/useKpiDashboard";
import { technicians } from "../mocks/data";
import type { Work } from "../models/app";

interface DashboardPageProps { works: Work[]; onGoRecurrence: () => void; kpiApi?: KpiApi; }
const defaultKpiApi = createKpiApi();

export function DashboardPage({ works, onGoRecurrence, kpiApi = defaultKpiApi }: DashboardPageProps) {
  const dashboard = useKpiDashboard(kpiApi, { periodStart: "2026-08-24", granularity: "WEEK" });
  const data = dashboard.state.data;
  const lead = data?.items[0];
  return <>
    <KpiPeriodToolbar period={dashboard.period} setGranularity={dashboard.setGranularity} previous={dashboard.previous} next={dashboard.next} />
    {data && <KpiManagementPanel api={kpiApi} periodStart={dashboard.period.periodStart} capabilities={data.capabilities} onChanged={dashboard.retry} />}
    {dashboard.state.status === "loading" && !data && <div className="kpi-message" role="status">Calculando indicadores del periodo…</div>}
    {dashboard.state.status === "error" && <div className="kpi-message kpi-message--error" role="status" aria-live="polite"><span>{dashboard.state.message}</span><button onClick={dashboard.retry}>Reintentar</button></div>}
    {dashboard.state.status === "empty" && <div className="kpi-message">Todavía no hay resultados KPI para este periodo.</div>}
    {data && lead && <>
      <div className={`kpi-status kpi-status--${data.status.toLowerCase()}`}><strong>{data.status === "PREVIEW" ? "Vista previa" : data.status === "REVISED" ? "Resultado revisado" : "Resultado oficial"}</strong><span>{data.status === "PREVIEW" ? "Aún no se ha cerrado la semana" : `Oficial hasta ${lead.periodEnd ?? dashboard.period.periodStart}`}</span></div>
      {data.warnings.some(({ code }) => code === "MISSING_TARGET") && <div className="kpi-message kpi-message--warning">Hay técnicos sin meta configurada en este periodo.</div>}
      <KpiScoreCards item={lead} />
      <section className="dashboard-grid kpi-analysis-grid"><KpiTrend items={data.items} /><KpiRanking items={data.items} /></section>
    </>}
    <section className="panel team-board"><PanelTitle eyebrow="Ritmo del equipo" title="Jornada en progreso" action="Ver técnicos" /><div className="time-ruler"><span>8 AM</span><span>10 AM</span><span>12 PM</span><span>2 PM</span><span>4 PM</span><i className="now-line"><b>AHORA</b></i></div><div className="team-lanes">{technicians.map((tech, index) => <div className="team-lane" key={tech.id}><div className="tech-name"><Avatar initials={tech.initials} color={tech.color} /><span>{tech.name}<small>{tech.done} de {tech.goal} tareas</small></span></div><div className="lane-track"><i className="lane-chunk support" style={{ left: `${3 + index * 2}%`, width: `${19 - index}%` }} /><i className="lane-chunk delivery" style={{ left: `${27 + index * 3}%`, width: `${13 + index}%` }} /><i className="lane-chunk install" style={{ left: `${48 + index}%`, width: `${22 - index * 2}%` }} /></div><b className="lane-percent">{Math.round((tech.done / tech.goal) * 100)}%</b></div>)}</div><div className="legend"><span><i className="support" />Soporte</span><span><i className="install" />Instalación</span><span><i className="delivery" />Entrega</span><span><i className="repeat" />Reincidencia</span></div></section>
    <section className="bottom-grid"><div className="panel activity-panel"><PanelTitle eyebrow="Hoy · actualización en vivo" title="Actividad reciente" action="Ver todas" /><RecentWorkTable works={works.slice(0, 5)} /></div><div className="panel focus-panel"><div className="focus-head"><span><AlertTriangle size={19} /></span><div><p>Foco de atención</p><h2>Reincidencias</h2></div><b>4 casos</b></div><div className="focus-metric"><strong>3</strong><span>visitas promedio<small>por caso reincidente</small></span><i>+0.7</i></div><div className="focus-case"><div><span>OT-1831 · ALTO</span><strong>Pérdida intermitente de conexión</strong><p>Café Central · 3 visitas</p></div><div className="avatar-stack"><Avatar initials="LR" color="#e9a23b" small /><Avatar initials="CM" color="#29b8aa" small /></div></div><button className="button button--dark" type="button" onClick={onGoRecurrence}>Analizar reincidencias <ArrowRight size={16} /></button></div></section>
  </>;
}
