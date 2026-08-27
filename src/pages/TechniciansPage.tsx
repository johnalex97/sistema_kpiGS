import { useCallback, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Search, UserPlus } from "lucide-react";
import { createKpiApi, type KpiApi } from "../api/kpis";
import { createTechnicianApi, type TechnicianApi } from "../api/technicians";
import { useAuth } from "../auth/useAuth";
import { TechnicianDetail, type TechnicianDetailAction } from "../components/technicians/TechnicianDetail";
import { TechnicianForm } from "../components/technicians/TechnicianForm";
import { TechnicianSummary } from "../components/technicians/TechnicianSummary";
import { TechnicianTable } from "../components/technicians/TechnicianTable";
import { useTechniciansWorkspace, type TechniciansWorkspace } from "../hooks/useTechniciansWorkspace";
import type { TechnicianStatus } from "../models/technician";

const defaultTechnicianApi = createTechnicianApi();
const defaultKpiApi = createKpiApi();

export interface TechniciansPageProps {
  search?: string;
  api?: TechnicianApi;
  kpiApi?: KpiApi;
  now?: () => Date;
  workspace?: TechniciansWorkspace;
  onAction?(action: TechnicianDetailAction): void;
}

function ConnectedTechniciansPage({ search = "", api, kpiApi, now, onAction }: Omit<TechniciansPageProps, "workspace">) {
  const { hasPermission } = useAuth();
  const workspace = useTechniciansWorkspace({
    api: api ?? defaultTechnicianApi,
    kpiApi: kpiApi ?? defaultKpiApi,
    search,
    canViewKpi: hasPermission("KPI_VIEW_ALL"),
    now,
  });
  return <TechniciansWorkspaceView workspace={workspace} api={api ?? defaultTechnicianApi} onAction={onAction} />;
}

export function TechniciansPage({ workspace, ...props }: TechniciansPageProps) {
  return workspace ? <TechniciansWorkspaceView workspace={workspace} api={props.api ?? defaultTechnicianApi} onAction={props.onAction} /> : <ConnectedTechniciansPage {...props} />;
}

function TechniciansWorkspaceView({ workspace, api, onAction }: { workspace: TechniciansWorkspace; api: TechnicianApi; onAction?: (action: TechnicianDetailAction) => void }) {
  const { hasPermission } = useAuth();
  const canViewKpi = hasPermission("KPI_VIEW_ALL");
  const canManage = hasPermission("TECHNICIANS_MANAGE");
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const pagination = workspace.page?.pagination;
  const selectedKpi = workspace.selected ? workspace.kpis.get(workspace.selected.id) : undefined;
  const selectTechnician = workspace.select;
  const closeWorkspaceDetail = workspace.closeDetail;

  const openTechnician = useCallback((id: string) => {
    lastTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    selectedIdRef.current = id;
    selectTechnician(id);
  }, [selectTechnician]);
  const closeDetail = useCallback(() => {
    selectedIdRef.current = null;
    closeWorkspaceDetail();
    lastTriggerRef.current?.focus();
  }, [closeWorkspaceDetail]);
  const retryDetail = useCallback(() => {
    if (selectedIdRef.current) selectTechnician(selectedIdRef.current);
  }, [selectTechnician]);
  const openForm = (kind: "create" | "edit") => {
    workspace.clearMutationError();
    setForm(kind);
  };
  const closeForm = () => {
    workspace.clearMutationError();
    setForm(null);
  };
  const detailAction = (action: TechnicianDetailAction) => {
    if (action === "edit" && canManage) openForm("edit");
    onAction?.(action);
  };

  return <section className="panel full-panel technicians-workspace">
    <header className="technicians-toolbar"><div><p className="eyebrow">Operación de campo</p><h2>Catálogo técnico</h2><p>Disponibilidad laboral y rendimiento de la semana vigente.</p></div><button className="button button--ghost" type="button" onClick={workspace.retryList}><RefreshCw size={15} aria-hidden="true" />Actualizar</button></header>
    {canManage && <div className="technicians-toolbar__primary"><button className="button button--primary" type="button" onClick={() => openForm("create")}><UserPlus size={16} aria-hidden="true" />Nuevo técnico</button></div>}
    <div className="technicians-filters">
      <label><span>Estado</span><select name="technicianStatus" aria-label="Estado del técnico" value={workspace.query.filters.status ?? ""} onChange={(event) => workspace.setFilters({ status: event.target.value ? event.target.value as TechnicianStatus : undefined })}><option value="">Todos</option><option value="AVAILABLE">Disponible</option><option value="BUSY">Ocupado</option><option value="ON_ROUTE">En ruta</option><option value="INACTIVE">Inactivo</option></select></label>
      <label className="technicians-filters__inactive"><input type="checkbox" checked={workspace.query.filters.includeInactive} onChange={(event) => workspace.setFilters({ includeInactive: event.target.checked })} /><span>Incluir técnicos inactivos</span></label>
    </div>
    {workspace.page && <TechnicianSummary technicians={workspace.page.items} kpis={workspace.kpis} showKpi={canViewKpi} />}
    {workspace.kpiState === "error" && canViewKpi && <p className="technicians-kpi-notice" role="status">El KPI semanal no está disponible. El catálogo laboral sigue operativo.</p>}
    {workspace.stale && <div className="technicians-banner" role="status"><AlertTriangle size={15} aria-hidden="true" /><span>Los datos pueden estar desactualizados. {workspace.listError}</span><button type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "loading" && !workspace.page && <div className="technicians-loading" role="status"><span aria-hidden="true" />Cargando técnicos…</div>}
    {workspace.listState === "loading" && workspace.page && <div className="technicians-refreshing" role="status"><RefreshCw size={14} aria-hidden="true" /><span>Actualizando técnicos…</span></div>}
    {workspace.listState === "error" && !workspace.page && <div className="technicians-error" role="alert"><AlertTriangle size={22} aria-hidden="true" /><strong>No fue posible cargar los técnicos</strong><p>{workspace.listError}</p><button className="button button--ghost" type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "empty" && <div className="empty-state"><Search size={25} aria-hidden="true" /><strong>No hay técnicos para estos filtros</strong><p>Ajusta el estado o incluye perfiles inactivos para ampliar la búsqueda.</p></div>}
    {workspace.page && workspace.page.items.length > 0 && <TechnicianTable technicians={workspace.page.items} kpis={workspace.kpis} showKpi={canViewKpi} onSelect={openTechnician} />}
    {pagination && pagination.totalPages > 1 && <nav className="technicians-pagination" aria-label="Paginación de técnicos"><button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => workspace.setFilters({ page: pagination.page - 1 })}>Página anterior</button><span>Página <b>{pagination.page}</b> de {pagination.totalPages}</span><button className="button button--ghost" type="button" aria-label="Página siguiente" disabled={pagination.page >= pagination.totalPages} onClick={() => workspace.setFilters({ page: pagination.page + 1 })}>Siguiente</button></nav>}
    {workspace.detailState === "loading" && <div className="technician-detail-loading" role="status">Cargando detalle del técnico…</div>}
    {workspace.detailState === "error" && !workspace.selected && <div className="technician-detail-error" role="alert"><span>No fue posible cargar el detalle del técnico.</span><button type="button" onClick={retryDetail}>Reintentar detalle</button><button type="button" onClick={closeDetail}>Cerrar</button></div>}
    {workspace.selected && form !== "edit" && <div className="technician-detail-backdrop"><TechnicianDetail technician={workspace.selected} kpi={selectedKpi} showKpi={canViewKpi} actions={canManage ? ["edit"] : []} onClose={closeDetail} onAction={detailAction} /></div>}
    {form === "create" && <div className="activity-form-backdrop technician-form-backdrop"><TechnicianForm api={api} apiError={workspace.mutation?.name === "create" ? workspace.mutation.error : null} onCancel={closeForm} onSubmit={async (input) => { const saved = await workspace.createTechnician(input); if (saved) closeForm(); return saved; }} /></div>}
    {form === "edit" && workspace.selected && <div className="activity-form-backdrop technician-form-backdrop"><TechnicianForm variant="edit" technician={workspace.selected} api={api} apiError={workspace.mutation?.name === "update" ? workspace.mutation.error : null} onCancel={closeForm} onSubmit={async (input) => { const saved = await workspace.updateTechnician(input); if (saved) closeForm(); return saved; }} /></div>}
  </section>;
}
