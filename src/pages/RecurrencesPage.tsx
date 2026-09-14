import { AlertTriangle, FilePlus2, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createEvidenceApi, type EvidenceApi } from "../api/evidences";
import { createRecurrenceLookupApi, type RecurrenceLookupApi } from "../api/recurrence-lookups";
import { createRecurrenceApi, type RecurrenceApi } from "../api/recurrences";
import { useAuth } from "../auth/useAuth";
import { RecurrenceAnalysisForm } from "../components/recurrences/RecurrenceAnalysisForm";
import { RecurrenceAdjustmentForm } from "../components/recurrences/RecurrenceAdjustmentForm";
import { RecurrenceCorrectionForm } from "../components/recurrences/RecurrenceCorrectionForm";
import { RecurrenceDetail } from "../components/recurrences/RecurrenceDetail";
import { RecurrenceEvidencePanel } from "../components/recurrences/RecurrenceEvidencePanel";
import { RecurrenceFilters } from "../components/recurrences/RecurrenceFilters";
import { RecurrenceReportForm } from "../components/recurrences/RecurrenceReportForm";
import { RecurrenceNoteForm } from "../components/recurrences/RecurrenceNoteForm";
import { RecurrenceSummaryCards } from "../components/recurrences/RecurrenceSummaryCards";
import { RecurrenceTable } from "../components/recurrences/RecurrenceTable";
import { RecurrenceTerminalDialog } from "../components/recurrences/RecurrenceTerminalDialog";
import { RecurrenceVisitForm } from "../components/recurrences/RecurrenceVisitForm";
import { useRecurrencesWorkspace, type RecurrencesWorkspace } from "../hooks/useRecurrencesWorkspace";
import { hasEffectiveRecurrenceFilters } from "../hooks/recurrence-workspace.helpers";

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
  const { user, retry } = useAuth();
  const workspace = useRecurrencesWorkspace({
    api,
    evidenceApi,
    lookupApi,
    permissions: user?.permissions ?? [],
    authorizationIdentity: user?.id ?? "anonymous",
    search,
    now,
    onAuthorizationStale: retry,
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
  const workflowTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previousWorkflowVisibleRef = useRef(false);
  const [evidenceCase, setEvidenceCase] = useState<{ id: string; number: string } | null>(null);
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
  const analysisConflict = workspace.mutation?.name === "analyze" && workspace.mutation.conflict;
  const showAnalysis = Boolean(
    workspace.actionMode === "analyze"
    && workspace.capabilities.canReview
    && workspace.selected
    && workspace.catalog
    && (workspace.selected.status === "OPEN" || analysisConflict),
  );
  const mutableSelected = workspace.selected?.status === "OPEN"
    || workspace.selected?.status === "ANALYSIS"
    || workspace.selected?.status === "CORRECTION";
  const correctionConflict = workspace.mutation?.name === "correct" && workspace.mutation.conflict;
  const visitConflict = workspace.mutation?.name === "visit" && workspace.mutation.conflict;
  const noteConflict = workspace.mutation?.name === "note" && workspace.mutation.conflict;
  const dismissConflict = workspace.mutation?.name === "dismiss" && workspace.mutation.conflict;
  const closeConflict = workspace.mutation?.name === "close" && workspace.mutation.conflict;
  const adjustConflict = workspace.mutation?.name === "adjust" && workspace.mutation.conflict;
  const showCorrection = Boolean(
    workspace.actionMode === "correct"
    && workspace.capabilities.canReview
    && workspace.selected
    && (workspace.selected.status === "ANALYSIS" || workspace.selected.status === "CORRECTION" || correctionConflict),
  );
  const showVisit = Boolean(
    workspace.actionMode === "visit"
    && workspace.capabilities.canReview
    && workspace.capabilities.lookupCapabilities.orders
    && workspace.selected
    && (mutableSelected || visitConflict),
  );
  const showNote = Boolean(
    workspace.actionMode === "note"
    && workspace.capabilities.canAddNote
    && workspace.selected
    && (mutableSelected || noteConflict),
  );
  const showDismiss = Boolean(workspace.actionMode === "dismiss" && workspace.capabilities.canReview && workspace.selected
    && (workspace.selected.status === "OPEN" || workspace.selected.status === "ANALYSIS" || dismissConflict));
  const showCloseCase = Boolean(workspace.actionMode === "close" && workspace.capabilities.canReview && workspace.selected
    && (workspace.selected.status === "CORRECTION" || closeConflict));
  const showAdjustment = Boolean(workspace.actionMode === "adjust" && workspace.capabilities.canReview && workspace.selected
    && workspace.catalog && (workspace.selected.status === "CLOSED" || adjustConflict));
  const workflowVisible = showCorrection || showVisit || showNote || showDismiss || showCloseCase || showAdjustment;
  const promptedRecurrence = workspace.evidencePromptForId
    ? workspace.selected?.id === workspace.evidencePromptForId
      ? workspace.selected
      : workspace.page?.items.find((item) => item.id === workspace.evidencePromptForId)
    : null;
  const promptedEvidence = workspace.evidencePromptForId && workspace.capabilities.canUploadEvidence
    ? { id: workspace.evidencePromptForId, number: promptedRecurrence?.recurrenceNumber ?? workspace.evidencePromptForId }
    : null;
  const activeEvidenceCase = (workspace.capabilities.canViewEvidence ? evidenceCase : null) ?? promptedEvidence;

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

  const openWorkflow = (mode: "correct" | "visit" | "note" | "dismiss" | "close" | "adjust", trigger: HTMLButtonElement) => {
    workflowTriggerRef.current = trigger;
    workspace.clearMutationError();
    workspace.setActionMode(mode);
  };

  const restoreWorkflowFocus = useCallback(() => {
    const trigger = workflowTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    else listRegionRef.current?.focus();
  }, []);

  const closeWorkflow = () => {
    workspace.clearMutationError();
    workspace.setActionMode(null);
    restoreWorkflowFocus();
  };

  const openEvidence = (trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    if (workspace.selected) setEvidenceCase({ id: workspace.selected.id, number: workspace.selected.recurrenceNumber });
  };

  const closeEvidence = () => {
    setEvidenceCase(null);
    workspace.clearEvidencePrompt();
    restoreFocus();
  };

  useEffect(() => {
    if (!evidenceCase || workspace.capabilities.canViewEvidence) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setEvidenceCase(null);
      restoreFocus();
    });
    return () => { active = false; };
  }, [evidenceCase, restoreFocus, workspace.capabilities.canViewEvidence]);

  useEffect(() => {
    const wasVisible = previousShowAnalysisRef.current;
    previousShowAnalysisRef.current = showAnalysis;
    if (wasVisible && !showAnalysis) restoreAnalysisFocus();
  }, [restoreAnalysisFocus, showAnalysis]);

  useEffect(() => {
    const wasVisible = previousWorkflowVisibleRef.current;
    previousWorkflowVisibleRef.current = workflowVisible;
    if (wasVisible && !workflowVisible) restoreWorkflowFocus();
  }, [restoreWorkflowFocus, workflowVisible]);

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
    {workspace.mutation?.error && workspace.actionMode === null && <div className="recurrence-mutation-feedback" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{workspace.mutation.error}</span><button type="button" onClick={workspace.clearMutationError}>Cerrar aviso</button></div>}
    <RecurrenceFilters filters={workspace.query.filters} catalog={workspace.catalog} catalogState={workspace.catalogState} canViewAll={workspace.capabilities.canViewAll} lookupApi={workspace.lookupApi} lookupCapabilities={workspace.capabilities.lookupCapabilities} onChange={workspace.setFilters} onRetryCatalog={workspace.retryCatalog} />

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
        {workspace.listState === "empty" && <div className="recurrence-list-state" role="status" aria-live="polite" aria-label="Sin casos"><Search size={24} aria-hidden="true" /><strong>{hasEffectiveRecurrenceFilters(workspace.query.filters) ? "No hay reincidencias para estos filtros" : "No hay reincidencias registradas"}</strong><p>{hasEffectiveRecurrenceFilters(workspace.query.filters) ? "Ajusta los filtros para ampliar la consulta." : "Los nuevos casos aparecerán aquí cuando se reporten."}</p></div>}
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
        {workspace.selected && <RecurrenceDetail recurrence={workspace.selected} capabilities={workspace.capabilities} onClose={closeDetail} onAnalyze={openAnalysis} onCorrect={(trigger) => openWorkflow("correct", trigger)} onAddVisit={(trigger) => openWorkflow("visit", trigger)} onAddNote={(trigger) => openWorkflow("note", trigger)} onManageEvidence={openEvidence} onDismiss={(trigger) => openWorkflow("dismiss", trigger)} onCloseCase={(trigger) => openWorkflow("close", trigger)} onAdjust={(trigger) => openWorkflow("adjust", trigger)} />}
      </div>}
    </div>
    {showReport && <div className="recurrence-action-backdrop"><RecurrenceReportForm lookupApi={workspace.lookupApi} apiError={workspace.mutation?.name === "report" ? workspace.mutation.error : null} onCancel={closeReport} onSubmit={workspace.reportRecurrence} /></div>}
    {showAnalysis && workspace.selected && workspace.catalog && <div className="recurrence-action-backdrop recurrence-action-backdrop--analysis"><RecurrenceAnalysisForm catalog={workspace.catalog} originalTechnicians={workspace.selected.technicians.filter((entry) => entry.participation !== "CORRECTION_PARTICIPANT")} apiError={workspace.mutation?.name === "analyze" ? workspace.mutation.error : null} submissionBlocked={workspace.selected.status !== "OPEN"} onCancel={closeAnalysis} onSubmit={workspace.analyzeRecurrence} /></div>}
    {showCorrection && workspace.selected && <div className="recurrence-action-backdrop recurrence-action-backdrop--workflow"><RecurrenceCorrectionForm initialValue={{ correctiveAction: workspace.selected.correctiveAction ?? "", preventiveAction: workspace.selected.preventiveAction ?? "", observations: workspace.selected.observations ?? "" }} updating={workspace.selected.status === "CORRECTION"} apiError={workspace.mutation?.name === "correct" ? workspace.mutation.error : null} submissionBlocked={workspace.selected.status !== "ANALYSIS" && workspace.selected.status !== "CORRECTION"} onCancel={closeWorkflow} onSubmit={workspace.correctRecurrence} /></div>}
    {showVisit && workspace.selected && <div className="recurrence-action-backdrop recurrence-action-backdrop--workflow"><RecurrenceVisitForm lookupApi={workspace.lookupApi} excludedOrderIds={[workspace.selected.originalOrder.id, ...workspace.selected.visits.map((visit) => visit.order.id)]} apiError={workspace.mutation?.name === "visit" ? workspace.mutation.error : null} submissionBlocked={!mutableSelected} onCancel={closeWorkflow} onSubmit={workspace.addVisit} /></div>}
    {showNote && workspace.selected && <div className="recurrence-action-backdrop recurrence-action-backdrop--workflow"><RecurrenceNoteForm apiError={workspace.mutation?.name === "note" ? workspace.mutation.error : null} submissionBlocked={!mutableSelected} onCancel={closeWorkflow} onSubmit={workspace.addNote} /></div>}
    {showDismiss && workspace.selected && <div className="recurrence-action-backdrop recurrence-action-backdrop--terminal"><RecurrenceTerminalDialog action="dismiss" recurrenceNumber={workspace.selected.recurrenceNumber} apiError={workspace.mutation?.name === "dismiss" ? workspace.mutation.error : null} submissionBlocked={workspace.selected.status !== "OPEN" && workspace.selected.status !== "ANALYSIS"} onCancel={closeWorkflow} onConfirm={(reason) => workspace.dismissRecurrence(reason ?? "")} /></div>}
    {showCloseCase && workspace.selected && <div className="recurrence-action-backdrop recurrence-action-backdrop--terminal"><RecurrenceTerminalDialog action="close" recurrenceNumber={workspace.selected.recurrenceNumber} apiError={workspace.mutation?.name === "close" ? workspace.mutation.error : null} submissionBlocked={workspace.selected.status !== "CORRECTION"} onCancel={closeWorkflow} onConfirm={() => workspace.closeRecurrence()} /></div>}
    {showAdjustment && workspace.selected && workspace.catalog && <div className="recurrence-action-backdrop recurrence-action-backdrop--adjustment"><RecurrenceAdjustmentForm recurrence={workspace.selected} catalog={workspace.catalog} apiError={workspace.mutation?.name === "adjust" ? workspace.mutation.error : null} submissionBlocked={workspace.selected.status !== "CLOSED"} onCancel={closeWorkflow} onSubmit={workspace.adjustRecurrence} /></div>}
    {activeEvidenceCase && <div className="recurrence-action-backdrop recurrence-action-backdrop--evidence"><RecurrenceEvidencePanel recurrenceId={activeEvidenceCase.id} recurrenceNumber={activeEvidenceCase.number} evidenceApi={workspace.evidenceApi} canView={workspace.capabilities.canViewEvidence} canUpload={workspace.capabilities.canUploadEvidence} canManage={workspace.capabilities.canManageEvidence} mode={evidenceCase ? "manage" : "prompt"} error={workspace.mutation?.name === "evidence" ? workspace.mutation.error : null} onUpload={workspace.uploadEvidence} onDownload={workspace.downloadEvidence} onArchive={workspace.archiveEvidence} onClose={closeEvidence} /></div>}
  </section>;
}
