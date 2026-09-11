import { AlertTriangle, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CorrectRecurrenceInput } from "../../models/recurrence";

type CorrectionInput = Omit<CorrectRecurrenceInput, "version">;
type InvalidField = "correctiveAction" | "preventiveAction" | "observations" | "estimatedCost" | "costReason";

const costPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export interface RecurrenceCorrectionFormProps {
  initialValue?: Partial<Pick<CorrectionInput, "correctiveAction" | "preventiveAction" | "observations">>;
  apiError?: string | null;
  submissionBlocked?: boolean;
  updating?: boolean;
  onSubmit(input: CorrectionInput): Promise<boolean>;
  onCancel(): void;
}

function focusableElements(form: HTMLFormElement): HTMLElement[] {
  return Array.from(form.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

export function RecurrenceCorrectionForm({
  initialValue,
  apiError = null,
  submissionBlocked = false,
  updating = false,
  onSubmit,
  onCancel,
}: RecurrenceCorrectionFormProps) {
  const [correctiveAction, setCorrectiveAction] = useState(initialValue?.correctiveAction ?? "");
  const [preventiveAction, setPreventiveAction] = useState(initialValue?.preventiveAction ?? "");
  const [observations, setObservations] = useState(initialValue?.observations ?? "");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [costReason, setCostReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<InvalidField | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const correctiveRef = useRef<HTMLTextAreaElement>(null);
  const preventiveRef = useRef<HTMLTextAreaElement>(null);
  const observationsRef = useRef<HTMLTextAreaElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const costReasonRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(false);
  const cancelRef = useRef(onCancel);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    correctiveRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!pendingRef.current) cancelRef.current();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const clearValidation = () => { setValidationError(null); setInvalidField(null); };
  const reject = (field: InvalidField, message: string, target: HTMLElement | null) => {
    setValidationError(message);
    setInvalidField(field);
    target?.focus();
  };
  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = focusableElements(formRef.current);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last || document.activeElement === formRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || submissionBlocked) return;
    const corrective = correctiveAction.trim();
    const preventive = preventiveAction.trim();
    const notes = observations.trim();
    const cost = estimatedCost.trim();
    const reason = costReason.trim();
    if (corrective.length < 3) return reject("correctiveAction", "Describe la acción correctiva con al menos 3 caracteres.", correctiveRef.current);
    if (corrective.length > 10_000) return reject("correctiveAction", "La acción correctiva no puede superar 10,000 caracteres.", correctiveRef.current);
    if (preventive.length > 10_000) return reject("preventiveAction", "La acción preventiva no puede superar 10,000 caracteres.", preventiveRef.current);
    if (notes.length > 10_000) return reject("observations", "Las observaciones no pueden superar 10,000 caracteres.", observationsRef.current);
    if (cost && !costPattern.test(cost)) return reject("estimatedCost", "Ingresa un costo válido con hasta dos decimales.", costRef.current);
    if (Boolean(cost) !== Boolean(reason)) {
      return reject(cost ? "costReason" : "estimatedCost", "El costo estimado y su razón deben completarse juntos.", cost ? costReasonRef.current : costRef.current);
    }
    if (reason.length > 500) return reject("costReason", "La razón del costo no puede superar 500 caracteres.", costReasonRef.current);

    const input: CorrectionInput = {
      correctiveAction: corrective,
      ...(updating ? { preventiveAction: preventive || null } : preventive ? { preventiveAction: preventive } : {}),
      ...(updating ? { observations: notes || null } : notes ? { observations: notes } : {}),
      ...(cost ? { estimatedCost: cost, costReason: reason } : {}),
    };
    clearValidation();
    pendingRef.current = true;
    setPending(true);
    formRef.current?.focus();
    try {
      await onSubmit(input);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const errorId = validationError ? "recurrence-correction-error" : undefined;
  const label = updating ? "Actualizar corrección" : "Iniciar corrección";
  return <form className="recurrence-workflow-form recurrence-workflow-form--correction" role="dialog" aria-modal="true" aria-labelledby="recurrence-correction-title" aria-busy={pending || undefined} tabIndex={-1} ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="recurrence-workflow-form__head"><div><p className="eyebrow">Respuesta técnica</p><h2 id="recurrence-correction-title">{label}</h2><span>Documenta la solución aplicada y cómo evitar que la falla se repita.</span></div><button className="icon-button" type="button" aria-label="Cerrar corrección" disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button></header>
    <fieldset className="recurrence-workflow-form__body" disabled={pending}><legend className="sr-only">Datos de corrección</legend>
      <label><span>Acción correctiva</span><textarea ref={correctiveRef} name="correctiveAction" rows={5} maxLength={10_000} aria-invalid={invalidField === "correctiveAction" || undefined} aria-describedby={invalidField === "correctiveAction" ? errorId : undefined} value={correctiveAction} onChange={(event) => { setCorrectiveAction(event.target.value); clearValidation(); }} /></label>
      <label><span>Acción preventiva</span><textarea ref={preventiveRef} name="preventiveAction" rows={3} maxLength={10_000} aria-invalid={invalidField === "preventiveAction" || undefined} aria-describedby={invalidField === "preventiveAction" ? errorId : undefined} value={preventiveAction} onChange={(event) => { setPreventiveAction(event.target.value); clearValidation(); }} /></label>
      <label><span>Observaciones</span><textarea ref={observationsRef} name="observations" rows={3} maxLength={10_000} aria-invalid={invalidField === "observations" || undefined} aria-describedby={invalidField === "observations" ? errorId : undefined} value={observations} onChange={(event) => { setObservations(event.target.value); clearValidation(); }} /></label>
      <section className="recurrence-workflow-form__cost" aria-label="Documentación de costo"><label><span>Costo estimado</span><input ref={costRef} name="estimatedCost" type="text" inputMode="decimal" autoComplete="off" aria-invalid={invalidField === "estimatedCost" || undefined} aria-describedby={invalidField === "estimatedCost" ? errorId : undefined} value={estimatedCost} onChange={(event) => { setEstimatedCost(event.target.value); clearValidation(); }} placeholder="0.00" /></label><label><span>Razón del costo</span><textarea ref={costReasonRef} name="costReason" rows={2} maxLength={500} aria-invalid={invalidField === "costReason" || undefined} aria-describedby={invalidField === "costReason" ? errorId : undefined} value={costReason} onChange={(event) => { setCostReason(event.target.value); clearValidation(); }} /></label></section>
      {validationError && <p className="recurrence-workflow-form__error" id={errorId} role="alert"><AlertTriangle size={16} aria-hidden="true" />{validationError}</p>}
      {apiError && <p className="recurrence-workflow-form__error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{apiError}</p>}
    </fieldset>
    <footer className="recurrence-workflow-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submissionBlocked}><Wrench size={16} aria-hidden="true" />{pending ? "Guardando…" : label}</button></footer>
  </form>;
}
