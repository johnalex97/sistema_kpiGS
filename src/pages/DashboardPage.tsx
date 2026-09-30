import { createKpiApi, type KpiApi } from "../api/kpis";
import { createOperationalDashboardApi, type OperationalDashboardApi } from "../api/dashboard";
import { OperationalTeamBoard } from "../components/dashboard/OperationalTeamBoard";
import { RecentActivityTable } from "../components/dashboard/RecentActivityTable";
import { RecurrenceFocusPanel } from "../components/dashboard/RecurrenceFocusPanel";
import { KpiPeriodToolbar } from "../components/kpis/KpiPeriodToolbar";
import { KpiRanking } from "../components/kpis/KpiRanking";
import { KpiScoreCards } from "../components/kpis/KpiScoreCards";
import { KpiTrend } from "../components/kpis/KpiTrend";
import { KpiManagementPanel } from "../components/kpis/KpiManagementPanel";
import { useKpiDashboard } from "../hooks/useKpiDashboard";
import { useOperationalDashboard } from "../hooks/useOperationalDashboard";

interface DashboardPageProps { onGoRecurrence: () => void; onGoActivities: () => void; onGoTechnicians: () => void; kpiApi?: KpiApi; operationalApi?: OperationalDashboardApi; }
const defaultKpiApi = createKpiApi();
const defaultOperationalApi = createOperationalDashboardApi();

export function DashboardPage({ onGoRecurrence, onGoActivities, onGoTechnicians, kpiApi = defaultKpiApi, operationalApi = defaultOperationalApi }: DashboardPageProps) {
  const dashboard = useKpiDashboard(kpiApi, { periodStart: "2026-08-24", granularity: "WEEK" });
  const operational = useOperationalDashboard(operationalApi);
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
    {operational.state.status === "loading" && !operational.state.data && <div className="kpi-message" role="status">Cargando jornada operativa…</div>}
    {operational.state.status === "error" && <div className="kpi-message kpi-message--error" role="alert">{operational.state.message}<button onClick={operational.retry}>Reintentar</button></div>}
    {operational.state.data && <>{operational.state.data.capabilities.team && <OperationalTeamBoard team={operational.state.data.team} generatedAt={operational.state.data.generatedAt} onGoTechnicians={onGoTechnicians} />}<section className="bottom-grid">{operational.state.data.capabilities.recentActivities && <RecentActivityTable activities={operational.state.data.recentActivities} onGoActivities={onGoActivities} />}{operational.state.data.capabilities.recurrences && <RecurrenceFocusPanel focus={operational.state.data.recurrences} onGoRecurrences={onGoRecurrence} />}</section></>}
  </>;
}
