import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
import type { OrderLookup, OrderStatus } from "../../models/order-lookup";
import type { ReportRecurrenceInput } from "../../models/recurrence";
import { OrderLookupCombobox } from "./OrderLookupCombobox";

const correctionStatuses: readonly OrderStatus[] = ["PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED", "COMPLETED"];

export interface RecurrenceReportFormProps {
  lookupApi: RecurrenceLookupApi;
  apiError?: string | null;
  onSubmit(input: ReportRecurrenceInput): Promise<boolean>;
  onCancel(): void;
}

export function RecurrenceReportForm({ lookupApi, apiError = null, onSubmit, onCancel }: RecurrenceReportFormProps) {
  const [original, setOriginal] = useState<OrderLookup | null>(null);
  const [correction, setCorrection] = useState<OrderLookup | null>(null);
  const [detectedProblem, setDetectedProblem] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const originalRef = useRef<HTMLInputElement>(null);
  const correctionRef = useRef<HTMLInputElement>(null);
  const problemRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(false);
  const cancelRef = useRef(onCancel);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    if (!apiError) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [apiError]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    formRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) cancelRef.current();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      previouslyFocused?.focus();
    };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = Array.from(formRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const selectOriginal = (order: OrderLookup | null) => {
    setOriginal(order);
    setCorrection(null);
    setValidationError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const problem = detectedProblem.trim();
    if (!original) {
      setValidationError("Selecciona la orden original y la orden correctiva.");
      originalRef.current?.focus();
      return;
    }
    if (!correction) {
      setValidationError("Selecciona la orden original y la orden correctiva.");
      correctionRef.current?.focus();
      return;
    }
    if (original.id === correction.id) {
      setValidationError("Selecciona dos órdenes distintas.");
      correctionRef.current?.focus();
      return;
    }
    if (original.status !== "COMPLETED" || !correctionStatuses.includes(correction.status)) {
      setValidationError("Selecciona órdenes disponibles dentro de tu alcance.");
      (original.status !== "COMPLETED" ? originalRef : correctionRef).current?.focus();
      return;
    }
    if (problem.length < 3) {
      setValidationError("Describe el problema detectado con al menos 3 caracteres.");
      problemRef.current?.focus();
      return;
    }
    setValidationError(null);
    pendingRef.current = true;
    setPending(true);
    try {
      await onSubmit({ originalOrderId: original.id, correctionOrderId: correction.id, detectedProblem: problem });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const errorId = validationError || apiError ? "recurrence-report-error" : undefined;

  return <form className="recurrence-report-form" role="dialog" aria-modal="true" aria-labelledby="recurrence-report-title" ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="recurrence-report-form__head">
      <div><p className="eyebrow">Registro operativo</p><h2 id="recurrence-report-title">Reportar reincidencia</h2><span>Relaciona la visita original con la orden que corrige la falla.</span></div>
      <button className="icon-button" type="button" aria-label="Cerrar reporte" disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button>
    </header>
    <fieldset className="recurrence-report-form__body" disabled={pending}>
      <legend className="sr-only">Datos de la reincidencia</legend>
      <div className="recurrence-report-form__orders">
        <OrderLookupCombobox label="Orden original" name="originalOrderId" api={lookupApi} statuses={["COMPLETED"]} value={original} invalid={Boolean(errorId && !original)} describedBy={errorId} inputRef={originalRef} onChange={selectOriginal} />
        <OrderLookupCombobox label="Orden correctiva" name="correctionOrderId" api={lookupApi} statuses={correctionStatuses} value={correction} excludeId={original?.id} invalid={Boolean(errorId && !correction)} describedBy={errorId} inputRef={correctionRef} onChange={(order) => { setCorrection(order); setValidationError(null); }} />
      </div>
      <label className="recurrence-report-form__problem"><span>Problema detectado</span><textarea ref={problemRef} name="detectedProblem" rows={5} maxLength={10_000} aria-describedby={errorId} aria-invalid={Boolean(errorId) || undefined} value={detectedProblem} onChange={(event) => { setDetectedProblem(event.target.value); setValidationError(null); }} placeholder="Ej.: la conexión volvió a fallar durante la visita…" /></label>
      {(validationError || apiError) && <p className="recurrence-report-form__error" id={errorId} role="alert"><AlertTriangle size={16} aria-hidden="true" />{validationError ?? apiError}</p>}
    </fieldset>
    <footer className="recurrence-report-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Reportando…" : "Reportar reincidencia"}</button></footer>
  </form>;
}
