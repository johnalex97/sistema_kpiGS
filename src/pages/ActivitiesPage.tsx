import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, RefreshCw, Search } from "lucide-react";
import { createActivityApi, type ActivityApi } from "../api/activities";
import type { ActivityLookupApi } from "../api/activity-lookups";
import { ActivityDetail } from "../components/activities/ActivityDetail";
import { ActivityTable } from "../components/activities/ActivityTable";
import { tegucigalpaDayRange } from "../hooks/activity-workspace.helpers";
import { useActivitiesWorkspace, type ActivitiesWorkspace } from "../hooks/useActivitiesWorkspace";
import type { ActivityDetailAction, ActivityStatus, ActivitySummary } from "../models/activity";

const defaultActivityApi = createActivityApi();

interface ActivitiesPageProps {
  search: string;
  api?: ActivityApi;
  lookupApi?: ActivityLookupApi;
  workspace?: ActivitiesWorkspace;
  onAction?(action: ActivityDetailAction): void;
}

function ConnectedActivitiesPage({ search, api, onAction }: Omit<ActivitiesPageProps, "workspace">) {
  const workspace = useActivitiesWorkspace({ api: api ?? defaultActivityApi, search });
  return <ActivitiesWorkspaceView workspace={workspace} onAction={onAction} />;
}

export function ActivitiesPage({ workspace, ...props }: ActivitiesPageProps) {
  return workspace ? <ActivitiesWorkspaceView workspace={workspace} onAction={props.onAction} /> : <ConnectedActivitiesPage {...props} />;
}

function ActivitiesWorkspaceView({ workspace, onAction }: { workspace: ActivitiesWorkspace; onAction?: (action: ActivityDetailAction) => void }) {
  const [now, setNow] = useState(() => new Date());
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const openActivity = useCallback((activity: ActivitySummary, trigger: HTMLButtonElement) => {
    lastTrigger.current = trigger;
    workspace.select(activity.id);
  }, [workspace]);
  const closeDetail = useCallback(() => {
    workspace.closeDetail();
    lastTrigger.current?.focus();
  }, [workspace]);
  const statuses: ActivityStatus[] = workspace.query.view === "open" ? ["PENDING", "IN_PROGRESS", "PAUSED"] : ["COMPLETED", "CANCELLED"];
  const singleStatus = workspace.query.filters.status?.length === 1 ? workspace.query.filters.status[0] : "";
  const pagination = workspace.page?.pagination;

  return <section className="panel full-panel activities-workspace">
    <header className="activities-toolbar"><div className="activities-tabs" role="tablist" aria-label="Vista de actividades"><button type="button" role="tab" aria-selected={workspace.query.view === "open"} onClick={() => workspace.setView("open")}>Abiertas</button><button type="button" role="tab" aria-selected={workspace.query.view === "history"} onClick={() => workspace.setView("history")}>Historial</button></div><div className="activities-count"><b>{pagination?.totalItems ?? 0}</b><span>actividades<br />en esta vista</span></div></header>
    <div className="activities-filters">
      <label><span>Estado</span><select aria-label="Estado" value={singleStatus} onChange={(event) => workspace.setFilters({ status: event.target.value ? [event.target.value as ActivityStatus] : statuses })}><option value="">Todos</option>{statuses.map((status) => <option key={status} value={status}>{status === "PENDING" ? "Pendiente" : status === "IN_PROGRESS" ? "En curso" : status === "PAUSED" ? "Pausada" : status === "COMPLETED" ? "Completada" : "Cancelada"}</option>)}</select></label>
      {workspace.query.view === "history" && <label><span>Rango</span><select aria-label="Rango de fechas" value={workspace.query.filters.startedFrom ? "today" : "all"} onChange={(event) => workspace.setFilters(event.target.value === "today" ? tegucigalpaDayRange(now) : { startedFrom: undefined, startedTo: undefined })}><option value="today">Hoy</option><option value="all">Todas las fechas</option></select></label>}
      <button className="button button--ghost activities-refresh" type="button" onClick={() => void workspace.refresh()}><RefreshCw size={15} />Actualizar</button>
    </div>
    {workspace.query.view === "history" && <p className="activities-date-note"><CalendarDays size={14} aria-hidden="true" />Las cancelaciones sin inicio aparecen al elegir “Todas las fechas”.</p>}
    {workspace.stale && <div className="activities-banner" role="status"><AlertTriangle size={15} aria-hidden="true" /><span>Los datos pueden estar desactualizados. {workspace.listError}</span><button type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "loading" && !workspace.page && <div className="activities-loading" role="status"><span aria-hidden="true" />Cargando actividades…</div>}
    {workspace.listState === "error" && !workspace.page && <div className="activities-error" role="alert"><AlertTriangle size={22} aria-hidden="true" /><strong>No fue posible cargar las actividades</strong><p>{workspace.listError}</p><button className="button button--ghost" type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "empty" && <div className="empty-state"><Search size={25} aria-hidden="true" /><strong>No hay actividades para estos filtros</strong><p>Cambia la vista o ajusta los filtros para continuar.</p></div>}
    {workspace.page && workspace.page.items.length > 0 && <ActivityTable items={workspace.page.items} now={now} onOpen={openActivity} />}
    {pagination && pagination.totalPages > 1 && <nav className="activities-pagination" aria-label="Paginación de actividades"><button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => workspace.setFilters({ page: pagination.page - 1 })}>Página anterior</button><span>Página <b>{pagination.page}</b> de {pagination.totalPages}</span><button className="button button--ghost" type="button" aria-label="Página siguiente" disabled={pagination.page >= pagination.totalPages} onClick={() => workspace.setFilters({ page: pagination.page + 1 })}>Siguiente</button></nav>}
    {workspace.detailState === "loading" && <div className="activity-detail-loading" role="status">Cargando detalle…</div>}
    {workspace.selected && <div className="activity-detail-backdrop"><ActivityDetail activity={workspace.selected} now={now} onClose={closeDetail} onAction={(action) => onAction?.(action)} /></div>}
  </section>;
}
