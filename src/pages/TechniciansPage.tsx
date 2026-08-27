import { useCallback, useRef } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { createKpiApi, type KpiApi } from "../api/kpis";
import { createTechnicianApi, type TechnicianApi } from "../api/technicians";
import { useAuth } from "../auth/useAuth";
import { TechnicianDetail, type TechnicianDetailAction } from "../components/technicians/TechnicianDetail";
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
  return <TechniciansWorkspaceView workspace={workspace} onAction={onAction} />;
}

export function TechniciansPage({ workspace, ...props }: TechniciansPageProps) {
  return workspace ? <TechniciansWorkspaceView workspace={workspace} onAction={props.onAction} /> : <ConnectedTechniciansPage {...props} />;
}

function TechniciansWorkspaceView({ workspace, onAction }: { workspace: TechniciansWorkspace; onAction?: (action: TechnicianDetailAction) => void }) {
  const { hasPermission } = useAuth();
  const canViewKpi = hasPermission("KPI_VIEW_ALL");
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const pagination = workspace.page?.pagination;
  const selectedKpi = workspace.selected ? workspace.kpis.get(workspace.selected.id) : undefined;
  const selectTechnician = workspace.select;
  const closeWorkspaceDetail = workspace.closeDetail;

  const openTechnician = useCallback((id: string) => {
    lastTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    selectTechnician(id);
  }, [selectTechnician]);
  const closeDetail = useCallback(() => {
    closeWorkspaceDetail();
    lastTriggerRef.current?.focus();
  }, [closeWorkspaceDetail]);

  return <section className="panel full-panel technicians-workspace">
    <header className="technicians-toolbar"><div><p className="eyebrow">Operación de campo</p><h2>Catálogo técnico</h2><p>Disponibilidad laboral y rendimiento de la semana vigente.</p></div><button className="button button--ghost" type="button" onClick={workspace.retryList}><RefreshCw size={15} aria-hidden="true" />Actualizar</button></header>
    <div className="technicians-filters">
      <label><span>Estado</span><select name="technicianStatus" aria-label="Estado del técnico" value={workspace.query.filters.status ?? ""} onChange={(event) => workspace.setFilters({ status: event.target.value ? event.target.value as TechnicianStatus : undefined })}><option value="">Todos</option><option value="AVAILABLE">Disponible</option><option value="BUSY">Ocupado</option><option value="ON_ROUTE">En ruta</option><option value="INACTIVE">Inactivo</option></select></label>
      <label className="technicians-filters__inactive"><input type="checkbox" checked={workspace.query.filters.includeInactive} onChange={(event) => workspace.setFilters({ includeInactive: event.target.checked })} /><span>Incluir técnicos inactivos</span></label>
    </div>
    {workspace.page && <TechnicianSummary technicians={workspace.page.items} kpis={workspace.kpis} showKpi={canViewKpi} />}
    {workspace.kpiState === "error" && canViewKpi && <p className="technicians-kpi-notice" role="status">El KPI semanal no está disponible. El catálogo laboral sigue operativo.</p>}
    {workspace.stale && <div className="technicians-banner" role="status"><AlertTriangle size={15} aria-hidden="true" /><span>Los datos pueden estar desactualizados. {workspace.listError}</span><button type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "loading" && !workspace.page && <div className="technicians-loading" role="status"><span aria-hidden="true" />Cargando técnicos…</div>}
    {workspace.listState === "error" && !workspace.page && <div className="technicians-error" role="alert"><AlertTriangle size={22} aria-hidden="true" /><strong>No fue posible cargar los técnicos</strong><p>{workspace.listError}</p><button className="button button--ghost" type="button" onClick={workspace.retryList}>Reintentar</button></div>}
    {workspace.listState === "empty" && <div className="empty-state"><Search size={25} aria-hidden="true" /><strong>No hay técnicos para estos filtros</strong><p>Ajusta el estado o incluye perfiles inactivos para ampliar la búsqueda.</p></div>}
    {workspace.page && workspace.page.items.length > 0 && <TechnicianTable technicians={workspace.page.items} kpis={workspace.kpis} showKpi={canViewKpi} onSelect={openTechnician} />}
    {pagination && pagination.totalPages > 1 && <nav className="technicians-pagination" aria-label="Paginación de técnicos"><button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => workspace.setFilters({ page: pagination.page - 1 })}>Página anterior</button><span>Página <b>{pagination.page}</b> de {pagination.totalPages}</span><button className="button button--ghost" type="button" aria-label="Página siguiente" disabled={pagination.page >= pagination.totalPages} onClick={() => workspace.setFilters({ page: pagination.page + 1 })}>Siguiente</button></nav>}
    {workspace.detailState === "loading" && <div className="technician-detail-loading" role="status">Cargando detalle del técnico…</div>}
    {workspace.detailState === "error" && !workspace.selected && <div className="technician-detail-error" role="alert"><span>No fue posible cargar el detalle del técnico.</span><button type="button" onClick={closeDetail}>Cerrar</button></div>}
    {workspace.selected && <div className="technician-detail-backdrop"><TechnicianDetail technician={workspace.selected} kpi={selectedKpi} showKpi={canViewKpi} onClose={closeDetail} onAction={(action) => onAction?.(action)} /></div>}
  </section>;
}
