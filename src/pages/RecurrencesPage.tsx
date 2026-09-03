import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { useCallback, useRef } from "react";
import { createEvidenceApi, type EvidenceApi } from "../api/evidences";
import { createRecurrenceLookupApi, type RecurrenceLookupApi } from "../api/recurrence-lookups";
import { createRecurrenceApi, type RecurrenceApi } from "../api/recurrences";
import { useAuth } from "../auth/useAuth";
import { RecurrenceDetail } from "../components/recurrences/RecurrenceDetail";
import { RecurrenceFilters } from "../components/recurrences/RecurrenceFilters";
import { RecurrenceSummaryCards } from "../components/recurrences/RecurrenceSummaryCards";
import { RecurrenceTable } from "../components/recurrences/RecurrenceTable";
import { useRecurrencesWorkspace, type RecurrencesWorkspace } from "../hooks/useRecurrencesWorkspace";

const defaultRecurrenceApi = createRecurrenceApi();
const defaultEvidenceApi = createEvidenceApi();
const defaultLookupApi = createRecurrenceLookupApi();

export interface RecurrencesPageProps {
  search?: string;
  api?: RecurrenceApi;
  evidenceApi?: EvidenceApi;
  lookupApi?: RecurrenceLookupApi;
  now?: () => Date;
  workspace?: RecurrencesWorkspace;
}

function ConnectedRecurrencesPage({
  search = "",
  api = defaultRecurrenceApi,
  evidenceApi = defaultEvidenceApi,
  lookupApi = defaultLookupApi,
  now,
}: Omit<RecurrencesPageProps, "workspace">) {
  const { user } = useAuth();
  const workspace = useRecurrencesWorkspace({
    api,
    evidenceApi,
    lookupApi,
    permissions: user?.permissions ?? [],
    search,
    now,
  });
  return <RecurrencesWorkspaceView workspace={workspace} />;
}

export function RecurrencesPage({ workspace, ...props }: RecurrencesPageProps) {
  return workspace
    ? <RecurrencesWorkspaceView workspace={workspace} />
    : <ConnectedRecurrencesPage {...props} />;
}

function RecurrencesWorkspaceView({ workspace }: { workspace: RecurrencesWorkspace }) {
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pagination = workspace.page?.pagination;
  const select = workspace.select;
  const closeWorkspaceDetail = workspace.closeDetail;

  const openDetail = useCallback((id: string, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    select(id);
  }, [select]);

  const closeDetail = useCallback(() => {
    closeWorkspaceDetail();
    lastTriggerRef.current?.focus();
  }, [closeWorkspaceDetail]);

  const hasDetailRegion = workspace.detailState === "loading"
    || workspace.detailState === "error"
    || workspace.selected !== null;

  return <section className="recurrence-workspace" aria-label="Registro de reincidencias">
    <header className="recurrence-workspace__heading">
      <div>
        <p className="eyebrow">Registro operativo</p>
        <h2>Casos con visitas repetidas</h2>
        <p>Prioriza el impacto y consulta la trazabilidad de cada reincidencia.</p>
      </div>
      <button className="button button--ghost" type="button" onClick={workspace.retryList}>
        <RefreshCw size={15} aria-hidden="true" />Actualizar casos
      </button>
    </header>

    <RecurrenceSummaryCards metrics={workspace.summary} state={workspace.summaryState} onRetry={workspace.retrySummary} />
    <RecurrenceFilters filters={workspace.query.filters} catalog={workspace.catalog} catalogState={workspace.catalogState} canViewAll={workspace.capabilities.canViewAll} onChange={workspace.setFilters} onRetryCatalog={workspace.retryCatalog} />

    {workspace.listStale && <div className="recurrence-stale" role="status">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>Los datos pueden estar desactualizados. Reintenta para recuperar la lectura más reciente.</span>
      <button type="button" onClick={workspace.retryList}>Reintentar casos</button>
    </div>}

    <div className={`recurrence-register${hasDetailRegion ? " recurrence-register--with-detail" : ""}`}>
      <div className="recurrence-register__list" aria-label="Casos registrados">
        {workspace.listState === "loading" && !workspace.page && <div className="recurrence-list-state" role="status" aria-label="Cargando casos"><span aria-hidden="true" />Cargando casos de reincidencia…</div>}
        {workspace.listState === "loading" && workspace.page && <div className="recurrence-list-refreshing" role="status"><RefreshCw size={14} aria-hidden="true" />Actualizando casos…</div>}
        {workspace.listState === "error" && !workspace.page && <div className="recurrence-list-state recurrence-list-state--error" role="alert"><AlertTriangle size={23} aria-hidden="true" /><strong>No fue posible cargar los casos</strong><p>Reintenta para recuperar el registro de reincidencias.</p><button className="button button--ghost" type="button" onClick={workspace.retryList}>Reintentar casos</button></div>}
        {workspace.listState === "empty" && <div className="recurrence-list-state"><Search size={24} aria-hidden="true" /><strong>No hay reincidencias para estos filtros</strong><p>Ajusta los filtros para ampliar la consulta.</p></div>}
        {workspace.page && workspace.page.items.length > 0 && <RecurrenceTable recurrences={workspace.page.items} onSelect={openDetail} />}

        {pagination && pagination.totalPages > 1 && <nav className="recurrence-pagination" aria-label="Paginación de reincidencias">
          <button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => workspace.setFilters({ page: pagination.page - 1 })}>Página anterior</button>
          <span>Página <b>{pagination.page}</b> de {pagination.totalPages}</span>
          <button className="button button--ghost" type="button" aria-label="Página siguiente" disabled={pagination.page >= pagination.totalPages} onClick={() => workspace.setFilters({ page: pagination.page + 1 })}>Siguiente</button>
        </nav>}
      </div>

      {hasDetailRegion && <div className="recurrence-register__detail">
        {workspace.detailState === "loading" && !workspace.selected && <div className="recurrence-detail-state" role="status" aria-label="Cargando detalle"><span aria-hidden="true" />Cargando detalle del caso…</div>}
        {workspace.detailState === "error" && !workspace.selected && <div className="recurrence-detail-state recurrence-detail-state--error" role="alert"><AlertTriangle size={22} aria-hidden="true" /><strong>No fue posible cargar el detalle</strong><p>El registro de casos sigue disponible.</p><button className="button button--ghost" type="button" onClick={workspace.retryDetail}>Reintentar detalle</button><button type="button" onClick={closeDetail}>Cerrar</button></div>}
        {workspace.selected && <RecurrenceDetail recurrence={workspace.selected} capabilities={workspace.capabilities} onClose={closeDetail} />}
      </div>}
    </div>
  </section>;
}
