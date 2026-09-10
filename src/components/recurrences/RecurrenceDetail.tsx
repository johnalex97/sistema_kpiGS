import { ClipboardCheck, Clock3, FileText, Route, UserRound, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RecurrenceCapabilities } from "../../hooks/useRecurrencesWorkspace";
import type {
  RecurrenceDetail as RecurrenceDetailModel,
  RecurrenceImpact,
  RecurrenceParticipation,
  RecurrenceResponsibility,
  RecurrenceStatus,
} from "../../models/recurrence";
import { formatBytes, formatCurrency, formatMinutes, formatRecurrenceDateTime } from "./recurrence-format";

const statusLabel: Record<RecurrenceStatus, string> = {
  OPEN: "Abierto", ANALYSIS: "En análisis", CORRECTION: "En corrección", CLOSED: "Cerrado", DISMISSED: "Descartado",
};
const impactLabel: Record<RecurrenceImpact, string> = { LOW: "Impacto bajo", MEDIUM: "Impacto medio", HIGH: "Impacto alto" };
const responsibilityLabel: Record<RecurrenceResponsibility, string> = {
  TECHNICAL_WORK: "Trabajo técnico", EQUIPMENT: "Equipo", CLIENT: "Cliente", THIRD_PARTY: "Tercero", UNDETERMINED: "Sin determinar",
};
const participationLabel: Record<RecurrenceParticipation, string> = {
  ORIGINAL_RESPONSIBLE: "Responsable original", ORIGINAL_PARTICIPANT: "Participante original", CORRECTION_PARTICIPANT: "Participante de corrección",
};
const standardFlow: RecurrenceStatus[] = ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED"];
const dismissedFlow: RecurrenceStatus[] = ["OPEN", "ANALYSIS", "CORRECTION", "DISMISSED"];

export interface RecurrenceDetailProps {
  recurrence: RecurrenceDetailModel;
  capabilities: RecurrenceCapabilities;
  onClose(): void;
  onAnalyze?(trigger: HTMLButtonElement): void;
  onManageEvidence?(trigger: HTMLButtonElement): void;
}

export function RecurrenceDetail({ recurrence, capabilities, onClose, onAnalyze, onManageEvidence }: RecurrenceDetailProps) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = `recurrence-detail-title-${recurrence.id}`;
  const flowTitleId = `recurrence-progress-title-${recurrence.id}`;
  const flow = recurrence.status === "DISMISSED" ? dismissedFlow : standardFlow;
  const currentIndex = flow.indexOf(recurrence.status);

  useEffect(() => {
    panelRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return <aside className={`recurrence-detail recurrence-detail--${recurrence.impact.toLowerCase()}`} role="dialog" aria-labelledby={titleId} aria-modal="false" tabIndex={-1} ref={panelRef}>
    <header className="recurrence-detail__head"><div><p className="eyebrow">Registro operativo · v{recurrence.version}</p><h2 id={titleId}>Detalle de {recurrence.recurrenceNumber}</h2><span>{recurrence.originalOrder.orderNumber}</span></div><button className="icon-button" type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <div className="recurrence-detail__signal"><span className={`recurrence-impact recurrence-impact--${recurrence.impact.toLowerCase()}`}><i aria-hidden="true" />{impactLabel[recurrence.impact]}</span><strong>{statusLabel[recurrence.status]}</strong></div>
    {(recurrence.status === "OPEN" && capabilities.canReview && onAnalyze || capabilities.canViewEvidence && onManageEvidence) && <div className="recurrence-detail__actions">{recurrence.status === "OPEN" && capabilities.canReview && onAnalyze && <button className="button button--primary recurrence-detail__analyze" type="button" onClick={(event) => onAnalyze(event.currentTarget)}><ClipboardCheck size={16} aria-hidden="true" />Analizar caso</button>}{capabilities.canViewEvidence && onManageEvidence && <button className="button button--ghost" type="button" onClick={(event) => onManageEvidence(event.currentTarget)}><FileText size={16} aria-hidden="true" />Gestionar evidencia</button>}</div>}
    <div className="recurrence-detail__body">
      <section className="recurrence-detail__flow" aria-labelledby={flowTitleId}><span className="recurrence-detail__label">Estado</span><h3 id={flowTitleId}>Progreso del caso</h3><ol>{flow.map((status, index) => <li key={status} aria-current={recurrence.status === status ? "step" : undefined} data-step={recurrence.status === status ? "current" : currentIndex > index ? "complete" : "pending"}><i aria-hidden="true" /><span>{statusLabel[status]}</span></li>)}</ol></section>
      <section aria-labelledby="recurrence-diagnosis-title"><span className="recurrence-detail__label">Diagnóstico</span><h3 id="recurrence-diagnosis-title">{recurrence.detectedProblem}</h3><dl className="recurrence-detail__facts"><div><dt>Causa</dt><dd>{recurrence.cause?.name ?? "Sin causa determinada"}</dd></div><div><dt>Responsabilidad</dt><dd>{responsibilityLabel[recurrence.responsibility]}</dd></div><div><dt>Detectado</dt><dd><time dateTime={recurrence.detectedAt}>{formatRecurrenceDateTime(recurrence.detectedAt)}</time></dd></div><div><dt>Costo estimado</dt><dd>{formatCurrency(recurrence.estimatedCost)}</dd></div>{recurrence.ageOverrideReason && <div><dt>Motivo de antigüedad</dt><dd>{recurrence.ageOverrideReason}</dd></div>}{recurrence.dismissalReason && <div><dt>Motivo de descarte</dt><dd>{recurrence.dismissalReason}</dd></div>}{recurrence.dismissedAt && <div><dt>Fecha de descarte</dt><dd><time dateTime={recurrence.dismissedAt}>{formatRecurrenceDateTime(recurrence.dismissedAt)}</time></dd></div>}{recurrence.closedAt && <div><dt>Fecha de cierre</dt><dd><time dateTime={recurrence.closedAt}>{formatRecurrenceDateTime(recurrence.closedAt)}</time></dd></div>}</dl>{recurrence.analysis && <div className="recurrence-detail__narrative"><strong>Análisis</strong><p>{recurrence.analysis}</p></div>}</section>
      <section aria-labelledby="recurrence-technicians-title"><span className="recurrence-detail__label">Participación</span><h3 id="recurrence-technicians-title"><UserRound size={15} aria-hidden="true" />Técnicos</h3>{recurrence.technicians.length === 0 ? <p className="recurrence-detail__muted">Sin técnicos registrados.</p> : <ul className="recurrence-detail__technicians">{recurrence.technicians.map((entry) => <li key={`${entry.technician.id}-${entry.participation}`}><span className="recurrence-detail__avatar" aria-hidden="true">{entry.technician.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{entry.technician.fullName}</strong><small>{entry.technician.code} · {participationLabel[entry.participation]}</small>{entry.justification && <em>{entry.justification}</em>}</span><b>{entry.affectsQuality ? "Afecta calidad" : "No afecta calidad"}</b></li>)}</ul>}</section>
      <section aria-labelledby="recurrence-visits-title"><span className="recurrence-detail__label">Trazabilidad de órdenes</span><h3 id="recurrence-visits-title"><Route size={15} aria-hidden="true" />Visitas</h3><ol className="recurrence-detail__visits"><li><span>Orden original</span><strong>{recurrence.originalOrder.orderNumber}</strong><small>Inicio del caso</small></li>{recurrence.visits.map((visit) => <li key={visit.id}><span>Visita {visit.visitNumber}</span><strong>{visit.order.orderNumber}</strong><small>{formatMinutes(visit.additionalMinutes)}{visit.observation ? ` · ${visit.observation}` : ""}</small></li>)}</ol></section>
      {(recurrence.correctiveAction || recurrence.preventiveAction || recurrence.observations) && <section aria-labelledby="recurrence-actions-title"><span className="recurrence-detail__label">Respuesta técnica</span><h3 id="recurrence-actions-title">Acciones registradas</h3><dl className="recurrence-detail__stacked"><div><dt>Correctiva</dt><dd>{recurrence.correctiveAction ?? "Sin registrar"}</dd></div><div><dt>Preventiva</dt><dd>{recurrence.preventiveAction ?? "Sin registrar"}</dd></div><div><dt>Observaciones</dt><dd>{recurrence.observations ?? "Sin observaciones"}</dd></div></dl></section>}
      <section aria-labelledby="recurrence-notes-title"><span className="recurrence-detail__label">Cronología</span><h3 id="recurrence-notes-title"><Clock3 size={15} aria-hidden="true" />Notas</h3>{recurrence.notes.length === 0 ? <p className="recurrence-detail__muted">Sin notas registradas.</p> : <ol className="recurrence-detail__notes">{recurrence.notes.map((note) => <li key={note.id}><p>{note.content}</p><small>{note.authorDisplayName} · <time dateTime={note.createdAt}>{formatRecurrenceDateTime(note.createdAt)}</time></small></li>)}</ol>}</section>
      <section aria-labelledby="recurrence-evidences-title"><span className="recurrence-detail__label">Respaldo</span><h3 id="recurrence-evidences-title"><FileText size={15} aria-hidden="true" />Evidencia</h3>{!capabilities.canViewEvidence ? <p className="recurrence-detail__muted">La evidencia no está disponible para tu perfil.</p> : recurrence.evidences.length === 0 ? <p className="recurrence-detail__muted">Sin evidencia visible.</p> : <ul className="recurrence-detail__evidences">{recurrence.evidences.map((evidence) => <li key={evidence.id}><FileText size={16} aria-hidden="true" /><span><strong>{evidence.originalName}</strong><small>{evidence.mimeType} · {formatBytes(evidence.sizeBytes)} · <time dateTime={evidence.createdAt}>{formatRecurrenceDateTime(evidence.createdAt)}</time></small></span></li>)}</ul>}</section>
      <p className="recurrence-detail__audit">Última actualización: <time dateTime={recurrence.updatedAt}>{formatRecurrenceDateTime(recurrence.updatedAt)}</time></p>
    </div>
  </aside>;
}
