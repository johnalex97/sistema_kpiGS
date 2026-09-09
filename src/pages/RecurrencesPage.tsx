import { AlertTriangle, FilePlus2, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { createEvidenceApi, type EvidenceApi } from "../api/evidences";
import { createRecurrenceLookupApi, type RecurrenceLookupApi } from "../api/recurrence-lookups";
import { createRecurrenceApi, type RecurrenceApi } from "../api/recurrences";
import { useAuth } from "../auth/useAuth";
import { RecurrenceAnalysisForm } from "../components/recurrences/RecurrenceAnalysisForm";
import { RecurrenceDetail } from "../components/recurrences/RecurrenceDetail";
import { RecurrenceEvidencePanel } from "../components/recurrences/RecurrenceEvidencePanel";
import { RecurrenceFilters } from "../components/recurrences/RecurrenceFilters";
import { RecurrenceReportForm } from "../components/recurrences/RecurrenceReportForm";
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
  const listRegionRef = useRef<HTMLDivElement | null>(null);
  const previousSelectedIdRef = useRef(workspace.query.selectedId);
  const reportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const analysisTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previousShowAnalysisRef = useRef(false);
  const pagination = workspace.page?.pagination;
  const select = workspace.select;
  const closeWorkspaceDetail = workspace.closeDetail;

  const openDetail = useCallback((id: string, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    select(id);
  }, [select]);

  const restoreFocus = useCallback(() => {
    const trigger = lastTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    else listRegionRef.current?.focus();
  }, []);

  const closeDetail = useCallback(() => {
    closeWorkspaceDetail();
    restoreFocus();
  }, [closeWorkspaceDetail, restoreFocus]);

  useEffect(() => {
    const previous = previousSelectedIdRef.current;
    previousSelectedIdRef.current = workspace.query.selectedId;
    if (previous && !workspace.query.selectedId) restoreFocus();
  }, [restoreFocus, workspace.query.selectedId]);

  const hasDetailRegion = workspace.detailState === "loading"
    || workspace.detailState === "error"
    || workspace.selected !== null;
  const canOpenReport = workspace.capabilities.canReport && workspace.capabilities.lookupCapabilities.orders;
  const showReport = canOpenReport && workspace.actionMode === "report";
  const showAnalysis = Boolean(
    workspace.actionMode === "analyze"
    && workspace.capabilities.canReview
    && workspace.selected
    && workspace.catalog,
  );
  const promptedRecurrence = workspace.evidencePromptForId
    ? workspace.selected?.id === workspace.evidencePromptForId
      ? workspace.selected
      : workspace.page?.items.find((item) => item.id === workspace.evidencePromptForId)
    : null;
  const showEvidencePrompt = Boolean(workspace.evidencePromptForId && workspace.capabilities.canUploadEvidence);

  const openReport = (trigger: HTMLButtonElement) => {
    reportTriggerRef.current = trigger;
    workspace.clearMutationError();
    workspace.setActionMode("report");
  };

  const closeReport = () => {
    workspace.clearMutationError();
    workspace.setActionMode(null);
    reportTriggerRef.current?.focus();
  };

  const restoreAnalysisFocus = useCallback(() => {
    const trigger = analysisTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    else listRegionRef.current?.focus();
  }, []);

  const openAnalysis = (trigger: HTMLButtonElement) => {
    analysisTriggerRef.current = trigger;
    workspace.clearMutationError();
    workspace.setActionMode("analyze");
  };

  const closeAnalysis = () => {
    workspace.clearMutationError();
    workspace.setActionMode(null);
    restoreAnalysisFocus();
  };

  useEffect(() => {
    const wasVisible = previousShowAnalysisRef.current;
    previousShowAnalysisRef.current = showAnalysis;
    if (wasVisible && !showAnalysis) restoreAnalysisFocus();
  }, [restoreAnalysisFocus, showAnalysis]);

  return <section className="recurrence-workspace" aria-label="Registro de reincidencias">
    <header className="recurrence-workspace__heading">
      <div>
        <p className="eyebrow">Registro operativo</p>
        <h2>Casos con visitas repetidas</h2>
        <p>Prioriza el impacto y consulta la trazabilidad de cada reincidencia.</p>
      </div>
      <div className="recurrence-workspace__actions">
        {canOpenReport && <button className="button button--primary" type="button" onClick={(event) => openReport(event.currentTarget)}><FilePlus2 size={16} aria-hidden="true" />Reportar reincidencia</button>}
        <button className="button button--ghost" type="button" onClick={workspace.retryList}><RefreshCw size={15} aria-hidden="true" />Actualizar casos</button>
      </div>
    </header>

    <RecurrenceSummaryCards metrics={workspace.summary} state={workspace.summaryState} onRetry={workspace.retrySummary} />
    <RecurrenceFilters filters={workspace.query.filters} catalog={workspace.catalog} catalogState={workspace.catalogState} canViewAll={workspace.capabilities.canViewAll} onChange={workspace.setFilters} onRetryCatalog={workspace.retryCatalog} />

    {workspace.listStale && <div className="recurrence-stale" role="status">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>Los datos pueden estar desactualizados. Reintenta para recuperar la lectura más reciente.</span>
      <button type="button" onClick={workspace.retryList}>Reintentar casos</button>
    </div>}

    <div className={`recurrence-register${hasDetailRegion ? " recurrence-register--with-detail" : ""}`}>
      <div className="recurrence-register__list" aria-label="Casos registrados" tabIndex={-1} ref={listRegionRef}>
        {workspace.listState === "loading" && !workspace.page && <div className="recurrence-list-state" role="status" aria-label="Cargando casos"><span aria-hidden="true" />Cargando casos de reincidencia…</div>}
        {workspace.listState === "loading" && workspace.page && <div className="recurrence-list-refreshing" role="status"><RefreshCw size={14} aria-hidden="true" />Actualizando casos…</div>}
        {workspace.listState === "error" && !workspace.page && <div className="recurrence-list-state recurrence-list-state--error" role="alert"><AlertTriangle size={23} aria-hidden="true" /><strong>No fue posible cargar los casos</strong><p>Reintenta para recuperar el registro de reincidencias.</p><button className="button button--ghost" type="button" onClick={workspace.retryList}>Reintentar casos</button></div>}
        {workspace.listState === "empty" && <div className="recurrence-list-state" role="status" aria-live="polite" aria-label="Sin casos"><Search size={24} aria-hidden="true" /><strong>No hay reincidencias para estos filtros</strong><p>Ajusta los filtros para ampliar la consulta.</p></div>}
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
        {workspace.selected && <RecurrenceDetail recurrence={workspace.selected} capabilities={workspace.capabilities} onClose={closeDetail} onAnalyze={openAnalysis} />}
      </div>}
    </div>
    {showReport && <div className="recurrence-action-backdrop"><RecurrenceReportForm lookupApi={workspace.lookupApi} apiError={workspace.mutation?.name === "report" ? workspace.mutation.error : null} onCancel={closeReport} onSubmit={workspace.reportRecurrence} /></div>}
    {showAnalysis && workspace.selected && workspace.catalog && <div className="recurrence-action-backdrop recurrence-action-backdrop--analysis"><RecurrenceAnalysisForm catalog={workspace.catalog} originalTechnicians={workspace.selected.technicians.filter((entry) => entry.participation !== "CORRECTION_PARTICIPANT")} apiError={workspace.mutation?.name === "analyze" ? workspace.mutation.error : null} onCancel={closeAnalysis} onSubmit={workspace.analyzeRecurrence} /></div>}
    {showEvidencePrompt && workspace.evidencePromptForId && <div className="recurrence-action-backdrop recurrence-action-backdrop--evidence"><RecurrenceEvidencePanel recurrenceId={workspace.evidencePromptForId} recurrenceNumber={promptedRecurrence?.recurrenceNumber ?? workspace.evidencePromptForId} evidenceApi={workspace.evidenceApi} canView={workspace.capabilities.canViewEvidence} canManage={workspace.capabilities.canManageEvidence} error={workspace.mutation?.name === "evidence" ? workspace.mutation.error : null} onUpload={workspace.uploadEvidence} onDownload={workspace.downloadEvidence} onArchive={workspace.archiveEvidence} onClose={workspace.clearEvidencePrompt} /></div>}
  </section>;
}
