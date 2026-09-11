import { AlertTriangle, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AdjustRecurrenceInput, QualityDecisionInput, RecurrenceCatalog, RecurrenceDetail, RecurrenceImpact } from "../../models/recurrence";

type AdjustmentInput = Omit<AdjustRecurrenceInput, "version">;
type Responsibility = Exclude<RecurrenceDetail["responsibility"], "UNDETERMINED">;
type DecisionDraft = { affectsQuality: boolean; justification: string };
const costPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const impactLabels: Record<RecurrenceImpact, string> = { LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto" };
const responsibilityLabels: Record<Responsibility, string> = { TECHNICAL_WORK: "Trabajo técnico", EQUIPMENT: "Equipo", CLIENT: "Cliente", THIRD_PARTY: "Tercero" };

export interface RecurrenceAdjustmentFormProps {
  recurrence: RecurrenceDetail;
  catalog: RecurrenceCatalog;
  apiError?: string | null;
  submissionBlocked?: boolean;
  onSubmit(input: AdjustmentInput): Promise<boolean>;
  onCancel(): void;
}

export function RecurrenceAdjustmentForm({ recurrence, catalog, apiError = null, submissionBlocked = false, onSubmit, onCancel }: RecurrenceAdjustmentFormProps) {
  const originals = useMemo(() => {
    const unique = new Map<string, RecurrenceDetail["technicians"][number]>();
    recurrence.technicians.filter((entry) => entry.participation !== "CORRECTION_PARTICIPANT").forEach((entry) => { if (!unique.has(entry.technician.id)) unique.set(entry.technician.id, entry); });
    return [...unique.values()];
  }, [recurrence.technicians]);
  const initialResponsibility = recurrence.responsibility as Responsibility;
  const [reason, setReason] = useState("");
  const [causeId, setCauseId] = useState(recurrence.cause?.id ?? "");
  const [impact, setImpact] = useState(recurrence.impact);
  const [responsibility, setResponsibility] = useState<Responsibility>(initialResponsibility);
  const [analysis, setAnalysis] = useState(recurrence.analysis ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(recurrence.correctiveAction ?? "");
  const [preventiveAction, setPreventiveAction] = useState(recurrence.preventiveAction ?? "");
  const [observations, setObservations] = useState(recurrence.observations ?? "");
  const [estimatedCost, setEstimatedCost] = useState(recurrence.estimatedCost);
  const [costReason, setCostReason] = useState("");
  const [decisions, setDecisions] = useState<Record<string, DecisionDraft>>(() => Object.fromEntries(originals.map((entry) => [entry.technician.id, { affectsQuality: entry.affectsQuality, justification: entry.justification ?? "" }])));
  const [qualityTouched, setQualityTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(false);
  const cancelRef = useRef(onCancel);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    reasonRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!pendingRef.current) cancelRef.current(); } };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); if (previous?.isConnected) previous.focus(); };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const nodes = Array.from(formRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (!first || !last || document.activeElement === formRef.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const reject = (message: string, target?: HTMLElement | null) => { setError(message); target?.focus(); };
  const completeDecisions = (): QualityDecisionInput[] => originals.map((entry) => {
    const draft = decisions[entry.technician.id] ?? { affectsQuality: false, justification: "" };
    if (responsibility !== "TECHNICAL_WORK" || !draft.affectsQuality) return { technicianId: entry.technician.id, affectsQuality: false };
    return { technicianId: entry.technician.id, affectsQuality: true, justification: draft.justification.trim() };
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || submissionBlocked) return;
    const normalizedReason = reason.trim();
    const normalizedAnalysis = analysis.trim();
    const normalizedCorrection = correctiveAction.trim();
    const normalizedPreventive = preventiveAction.trim();
    const normalizedObservations = observations.trim();
    const normalizedCost = estimatedCost.trim();
    const normalizedCostReason = costReason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) return reject("El motivo del ajuste debe tener entre 10 y 500 caracteres.", reasonRef.current);
    if (!causeId) return reject("Selecciona una causa disponible.");
    if (normalizedAnalysis.length < 3 || normalizedCorrection.length < 3) return reject("El análisis y la acción correctiva deben tener al menos 3 caracteres.");
    if (!costPattern.test(normalizedCost)) return reject("Ingresa un costo válido con hasta dos decimales.");
    if (normalizedCost !== recurrence.estimatedCost && !normalizedCostReason) return reject("Explica la razón del cambio de costo.");
    const qualityChanged = qualityTouched || responsibility !== initialResponsibility;
    const qualityDecisions = completeDecisions();
    if (responsibility === "TECHNICAL_WORK") {
      if (!qualityDecisions.some((decision) => decision.affectsQuality)) return reject("Marca al menos un técnico cuya calidad resulte afectada.");
      if (qualityDecisions.some((decision) => decision.affectsQuality && !decision.justification)) return reject("Justifica cada afectación de calidad.");
    }
    const input: AdjustmentInput = { reason: normalizedReason };
    if (causeId !== recurrence.cause?.id) input.causeId = causeId;
    if (impact !== recurrence.impact) input.impact = impact;
    if (responsibility !== initialResponsibility) input.responsibility = responsibility;
    if (normalizedAnalysis !== recurrence.analysis) input.analysis = normalizedAnalysis;
    if (normalizedCorrection !== recurrence.correctiveAction) input.correctiveAction = normalizedCorrection;
    if (normalizedPreventive !== (recurrence.preventiveAction ?? "")) input.preventiveAction = normalizedPreventive || null;
    if (normalizedObservations !== (recurrence.observations ?? "")) input.observations = normalizedObservations || null;
    if (normalizedCost !== recurrence.estimatedCost) { input.estimatedCost = normalizedCost; input.costReason = normalizedCostReason; }
    if (qualityChanged) input.qualityDecisions = qualityDecisions;
    if (Object.keys(input).length === 1) return reject("Modifica al menos un campo antes de guardar el ajuste.");
    setError(null); pendingRef.current = true; setPending(true); formRef.current?.focus();
    try { await onSubmit(input); } finally { pendingRef.current = false; setPending(false); }
  };

  const technical = responsibility === "TECHNICAL_WORK";
  return <form className="recurrence-adjustment-form" role="dialog" aria-modal="true" aria-labelledby="recurrence-adjustment-title" aria-busy={pending || undefined} tabIndex={-1} ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="recurrence-adjustment-form__head"><div><p className="eyebrow">Ajuste auditado · v{recurrence.version}</p><h2 id="recurrence-adjustment-title">Ajustar caso cerrado</h2><span>Registra únicamente correcciones verificadas para {recurrence.recurrenceNumber}.</span></div><button className="icon-button" type="button" aria-label="Cerrar ajuste" disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button></header>
    <fieldset className="recurrence-adjustment-form__body" disabled={pending}><legend className="sr-only">Datos ajustables del caso</legend>
      <label className="recurrence-adjustment-form__reason"><span>Motivo del ajuste</span><textarea ref={reasonRef} rows={3} maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); setError(null); }} /></label>
      <div className="recurrence-adjustment-form__grid"><label><span>Causa</span><select value={causeId} onChange={(event) => { setCauseId(event.target.value); setError(null); }}>{catalog.causes.map((cause) => <option key={cause.id} value={cause.id}>{cause.name}</option>)}</select></label><label><span>Impacto</span><select value={impact} onChange={(event) => { setImpact(event.target.value as RecurrenceImpact); setError(null); }}>{catalog.impacts.map((value) => <option key={value} value={value}>{impactLabels[value]}</option>)}</select></label><label><span>Responsabilidad</span><select value={responsibility} onChange={(event) => { setResponsibility(event.target.value as Responsibility); setError(null); }}>{catalog.responsibilities.filter((value): value is Responsibility => value !== "UNDETERMINED").map((value) => <option key={value} value={value}>{responsibilityLabels[value]}</option>)}</select></label></div>
      <label><span>Análisis técnico</span><textarea rows={4} maxLength={10_000} value={analysis} onChange={(event) => { setAnalysis(event.target.value); setError(null); }} /></label>
      <label><span>Acción correctiva</span><textarea rows={4} maxLength={10_000} value={correctiveAction} onChange={(event) => { setCorrectiveAction(event.target.value); setError(null); }} /></label>
      <div className="recurrence-adjustment-form__grid"><label><span>Acción preventiva</span><textarea rows={3} maxLength={10_000} value={preventiveAction} onChange={(event) => { setPreventiveAction(event.target.value); setError(null); }} /></label><label><span>Observaciones</span><textarea rows={3} maxLength={10_000} value={observations} onChange={(event) => { setObservations(event.target.value); setError(null); }} /></label></div>
      <section className="recurrence-adjustment-form__quality" aria-labelledby="recurrence-adjustment-quality"><h3 id="recurrence-adjustment-quality">Decisiones de calidad</h3>{originals.map((entry) => { const draft = decisions[entry.technician.id]; return <div key={entry.technician.id}><label><input type="checkbox" aria-label={`Afecta calidad de ${entry.technician.fullName}`} disabled={!technical} checked={technical && draft.affectsQuality} onChange={(event) => { const checked = event.target.checked; setDecisions((current) => ({ ...current, [entry.technician.id]: { affectsQuality: checked, justification: checked ? current[entry.technician.id].justification : "" } })); setQualityTouched(true); setError(null); }} /><span>{entry.technician.fullName}</span></label>{technical && draft.affectsQuality && <label><span>Justificación para {entry.technician.fullName}</span><textarea rows={2} maxLength={1_000} value={draft.justification} onChange={(event) => { setDecisions((current) => ({ ...current, [entry.technician.id]: { ...current[entry.technician.id], justification: event.target.value } })); setQualityTouched(true); setError(null); }} /></label>}</div>; })}</section>
      <div className="recurrence-adjustment-form__grid"><label><span>Costo estimado</span><input type="text" inputMode="decimal" value={estimatedCost} onChange={(event) => { setEstimatedCost(event.target.value); setError(null); }} /></label><label><span>Razón del cambio de costo</span><textarea rows={2} maxLength={500} value={costReason} onChange={(event) => { setCostReason(event.target.value); setError(null); }} /></label></div>
      {error && <p className="recurrence-adjustment-form__error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}{apiError && <p className="recurrence-adjustment-form__error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{apiError}</p>}
    </fieldset>
    <footer className="recurrence-adjustment-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submissionBlocked}><SlidersHorizontal size={16} aria-hidden="true" />{pending ? "Guardando…" : "Guardar ajuste"}</button></footer>
  </form>;
}
