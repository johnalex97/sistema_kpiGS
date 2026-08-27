import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Plus, RefreshCw, Search } from "lucide-react";
import { createActivityApi, type ActivityApi } from "../api/activities";
import { createActivityLookupApi, type ActivityLookupApi } from "../api/activity-lookups";
import { useAuth } from "../auth/useAuth";
import { ActivityActionDialog } from "../components/activities/ActivityActionDialog";
import { ActivityDetail } from "../components/activities/ActivityDetail";
import { ActivityForm } from "../components/activities/ActivityForm";
import { ActivityTable } from "../components/activities/ActivityTable";
import { ActivityTeamEditor } from "../components/activities/ActivityTeamEditor";
import { tegucigalpaDayRange } from "../hooks/activity-workspace.helpers";
import { useActivitiesWorkspace, type ActivitiesWorkspace } from "../hooks/useActivitiesWorkspace";
import type { ActivityDetailAction, ActivityStatus, ActivitySummary, ActivityTeamInput, ActivityType, TechnicianOption } from "../models/activity";

const defaultActivityApi = createActivityApi();
const defaultLookupApi = createActivityLookupApi();

interface ActivitiesPageProps {
  search: string;
  api?: ActivityApi;
  lookupApi?: ActivityLookupApi;
  workspace?: ActivitiesWorkspace;
  onAction?(action: ActivityDetailAction): void;
}

function ConnectedActivitiesPage({ search, api, lookupApi, onAction }: Omit<ActivitiesPageProps, "workspace">) {
  const activityApi = api ?? defaultActivityApi;
  const workspace = useActivitiesWorkspace({ api: activityApi, search });
  return <ActivitiesWorkspaceView workspace={workspace} api={activityApi} lookupApi={lookupApi ?? defaultLookupApi} onAction={onAction} />;
}

export function ActivitiesPage({ workspace, ...props }: ActivitiesPageProps) {
  return workspace ? <ActivitiesWorkspaceView workspace={workspace} api={props.api ?? defaultActivityApi} lookupApi={props.lookupApi ?? defaultLookupApi} onAction={props.onAction} /> : <ConnectedActivitiesPage {...props} />;
}

type ActivityEditor = "create" | "edit" | "team" | Exclude<ActivityDetailAction, "edit" | "team"> | null;

function TeamDialog({ pending, onClose, children }: { pending: boolean; onClose(): void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('select:not([disabled]), button:not([disabled]), input:not([disabled])')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !pendingRef.current) closeRef.current(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); previouslyFocused?.focus(); };
  }, []);
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="modal-backdrop"><div className="activity-team-dialog" role="dialog" aria-modal="true" aria-label="Editar equipo" ref={dialogRef} onKeyDown={trapFocus}>{children}</div></div>;
}

function ActivitiesWorkspaceView({ workspace, api, lookupApi, onAction }: { workspace: ActivitiesWorkspace; api: ActivityApi; lookupApi: ActivityLookupApi; onAction?: (action: ActivityDetailAction) => void }) {
  const { user, hasPermission } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [editor, setEditor] = useState<ActivityEditor>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [team, setTeam] = useState<ActivityTeamInput[]>([]);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (editor !== "create" && editor !== "edit") return;
    const controller = new AbortController();
    api.listTypes(controller.signal).then(setActivityTypes).catch(() => undefined);
    return () => controller.abort();
  }, [api, editor]);

  useEffect(() => {
    if (editor !== "team") return;
    const controller = new AbortController();
    lookupApi.technicians("", 1, controller.signal).then((result) => setTechnicians(result.items)).catch(() => undefined);
    return () => controller.abort();
  }, [editor, lookupApi]);

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
  const canManage = hasPermission("ACTIVITIES_MANAGE");
  const canCreate = canManage || hasPermission("ACTIVITIES_CREATE_OWN");
  const actor = { technicianId: user?.technicianId ?? null, canManage };
  const mutationPending = workspace.mutation?.pending ?? false;
  const closeEditor = () => { if (mutationPending) return; setEditor(null); workspace.clearMutationError(); };
  const chooseAction = (action: ActivityDetailAction) => {
    onAction?.(action);
    if (action === "team" && workspace.selected) setTeam(workspace.selected.team.map((member) => ({ technicianId: member.technician.id, role: member.role, participationPercentage: member.participationPercentage })));
    setEditor(action);
    workspace.clearMutationError();
  };

  return <section className="panel full-panel activities-workspace">
    <header className="activities-toolbar"><div className="activities-tabs" role="tablist" aria-label="Vista de actividades"><button type="button" role="tab" aria-selected={workspace.query.view === "open"} onClick={() => workspace.setView("open")}>Abiertas</button><button type="button" role="tab" aria-selected={workspace.query.view === "history"} onClick={() => workspace.setView("history")}>Historial</button></div><div className="activities-count"><b>{pagination?.totalItems ?? 0}</b><span>actividades<br />en esta vista</span></div></header>
    <div className="activities-filters">
      <label><span>Estado</span><select name="activityStatus" aria-label="Estado" value={singleStatus} onChange={(event) => workspace.setFilters({ status: event.target.value ? [event.target.value as ActivityStatus] : statuses })}><option value="">Todos</option>{statuses.map((status) => <option key={status} value={status}>{status === "PENDING" ? "Pendiente" : status === "IN_PROGRESS" ? "En curso" : status === "PAUSED" ? "Pausada" : status === "COMPLETED" ? "Completada" : "Cancelada"}</option>)}</select></label>
      {workspace.query.view === "history" && <label><span>Rango</span><select name="activityDateRange" aria-label="Rango de fechas" value={workspace.query.filters.startedFrom ? "today" : "all"} onChange={(event) => workspace.setFilters(event.target.value === "today" ? tegucigalpaDayRange(now) : { startedFrom: undefined, startedTo: undefined })}><option value="today">Hoy</option><option value="all">Todas las fechas</option></select></label>}
      <button className="button button--ghost activities-refresh" type="button" onClick={() => void workspace.refresh()}><RefreshCw size={15} />Actualizar</button>{canCreate && <button className="button button--primary" type="button" onClick={() => { workspace.clearMutationError(); setEditor("create"); }}><Plus size={15} />Nueva actividad</button>}
    </div>
    {workspace.query.view === "history" && <p className="activities-date-note"><CalendarDays size={14} aria-hidden="true" />Las cancelaciones sin inicio aparecen al elegir “Todas las fechas”.</p>}
    {workspace.stale && <div className="activities-banner" role="status"><AlertTriangle size={15} aria-hidden="true" /><span>Los datos pueden estar desactualizados. {workspace.listError}</span><button type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "loading" && !workspace.page && <div className="activities-loading" role="status"><span aria-hidden="true" />Cargando actividades…</div>}
    {workspace.listState === "error" && !workspace.page && <div className="activities-error" role="alert"><AlertTriangle size={22} aria-hidden="true" /><strong>No fue posible cargar las actividades</strong><p>{workspace.listError}</p><button className="button button--ghost" type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "empty" && <div className="empty-state"><Search size={25} aria-hidden="true" /><strong>No hay actividades para estos filtros</strong><p>Cambia la vista o ajusta los filtros para continuar.</p></div>}
    {workspace.page && workspace.page.items.length > 0 && <ActivityTable items={workspace.page.items} now={now} onOpen={openActivity} />}
    {pagination && pagination.totalPages > 1 && <nav className="activities-pagination" aria-label="Paginación de actividades"><button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => workspace.setFilters({ page: pagination.page - 1 })}>Página anterior</button><span>Página <b>{pagination.page}</b> de {pagination.totalPages}</span><button className="button button--ghost" type="button" aria-label="Página siguiente" disabled={pagination.page >= pagination.totalPages} onClick={() => workspace.setFilters({ page: pagination.page + 1 })}>Siguiente</button></nav>}
    {workspace.detailState === "loading" && <div className="activity-detail-loading" role="status">Cargando detalle…</div>}
    {workspace.selected && <div className="activity-detail-backdrop"><ActivityDetail activity={workspace.selected} now={now} pending={mutationPending} closeOnEscape={!editor} onClose={closeDetail} onAction={chooseAction} /></div>}
    {editor === "create" && <div className="modal-backdrop"><ActivityForm activityTypes={activityTypes} lookupApi={lookupApi} actor={actor} onCancel={closeEditor} onSubmit={async (value) => { if (await workspace.createActivity(value)) setEditor(null); }} />{workspace.mutation?.error && <p className="activity-overlay-error" role="alert">{workspace.mutation.error}</p>}</div>}
    {editor === "edit" && workspace.selected && <div className="modal-backdrop"><ActivityForm variant="edit" initialActivity={workspace.selected} activityTypes={activityTypes} lookupApi={lookupApi} actor={actor} onCancel={closeEditor} onSubmit={async (value) => { if (await workspace.updateActivity(value)) setEditor(null); }} />{workspace.mutation?.error && <p className="activity-overlay-error" role="alert">{workspace.mutation.error}</p>}</div>}
    {editor === "team" && workspace.selected && <TeamDialog pending={mutationPending} onClose={closeEditor}><ActivityTeamEditor members={team} technicians={technicians} onChange={setTeam} pending={mutationPending} error={workspace.mutation?.error} onConfirm={async (members) => { if (await workspace.replaceActivityTeam(members)) setEditor(null); }} /><button className="button button--ghost" type="button" disabled={mutationPending} onClick={closeEditor}>Volver</button></TeamDialog>}
    {editor && editor !== "create" && editor !== "edit" && editor !== "team" && workspace.selected && <ActivityActionDialog action={editor} activity={workspace.selected} pending={mutationPending} error={workspace.mutation?.error ?? null} onCancel={closeEditor} onConfirm={async (command) => { if (await workspace.runAction(command)) setEditor(null); }} />}
  </section>;
}
