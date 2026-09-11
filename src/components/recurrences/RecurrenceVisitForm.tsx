import { AlertTriangle, Route, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
import type { OrderLookup, OrderStatus } from "../../models/order-lookup";
import type { AddRecurrenceVisitInput } from "../../models/recurrence";
import { OrderLookupCombobox } from "./OrderLookupCombobox";

type VisitInput = Omit<AddRecurrenceVisitInput, "version">;
const visitStatuses: readonly OrderStatus[] = ["PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED", "COMPLETED"];

export interface RecurrenceVisitFormProps {
  lookupApi: RecurrenceLookupApi;
  excludedOrderIds: readonly string[];
  apiError?: string | null;
  submissionBlocked?: boolean;
  onSubmit(input: VisitInput): Promise<boolean>;
  onCancel(): void;
}

export function RecurrenceVisitForm({ lookupApi, excludedOrderIds, apiError = null, submissionBlocked = false, onSubmit, onCancel }: RecurrenceVisitFormProps) {
  const [order, setOrder] = useState<OrderLookup | null>(null);
  const [observation, setObservation] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<"order" | "observation" | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const orderRef = useRef<HTMLInputElement>(null);
  const observationRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(false);
  const cancelRef = useRef(onCancel);
  const normalizedExcludedOrderIds = useMemo(() => [...new Set(excludedOrderIds)].sort(), [excludedOrderIds]);
  const selectedOrder = order && !normalizedExcludedOrderIds.includes(order.id) ? order : null;

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    orderRef.current?.focus();
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
  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = Array.from(formRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
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
    if (!selectedOrder) {
      setValidationError("Selecciona una orden que todavía no pertenezca al caso.");
      setInvalidField("order");
      orderRef.current?.focus();
      return;
    }
    const normalizedObservation = observation.trim();
    if (normalizedObservation.length > 10_000) {
      setValidationError("La observación no puede superar 10,000 caracteres.");
      setInvalidField("observation");
      observationRef.current?.focus();
      return;
    }
    const input: VisitInput = { orderId: selectedOrder.id, ...(normalizedObservation ? { observation: normalizedObservation } : {}) };
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

  const errorId = validationError ? "recurrence-visit-error" : undefined;
  return <form className="recurrence-workflow-form recurrence-workflow-form--visit" role="dialog" aria-modal="true" aria-labelledby="recurrence-visit-title" aria-busy={pending || undefined} tabIndex={-1} ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="recurrence-workflow-form__head"><div><p className="eyebrow">Trazabilidad de órdenes</p><h2 id="recurrence-visit-title">Agregar visita</h2><span>Relaciona una nueva orden con el seguimiento de este caso.</span></div><button className="icon-button" type="button" aria-label="Cerrar visita" disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button></header>
    <fieldset className="recurrence-workflow-form__body" disabled={pending}><legend className="sr-only">Datos de la visita</legend>
      <OrderLookupCombobox label="Orden de la visita" name="orderId" api={lookupApi} statuses={visitStatuses} value={selectedOrder} excludeIds={normalizedExcludedOrderIds} invalid={invalidField === "order"} describedBy={invalidField === "order" ? errorId : undefined} inputRef={orderRef} onChange={(next) => { setOrder(next); clearValidation(); }} />
      <label><span>Observación</span><textarea ref={observationRef} name="observation" rows={4} maxLength={10_000} aria-invalid={invalidField === "observation" || undefined} aria-describedby={invalidField === "observation" ? errorId : undefined} value={observation} onChange={(event) => { setObservation(event.target.value); clearValidation(); }} placeholder="Opcional: describe el objetivo o resultado de la visita…" /></label>
      {validationError && <p className="recurrence-workflow-form__error" id={errorId} role="alert"><AlertTriangle size={16} aria-hidden="true" />{validationError}</p>}
      {apiError && <p className="recurrence-workflow-form__error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{apiError}</p>}
    </fieldset>
    <footer className="recurrence-workflow-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submissionBlocked}><Route size={16} aria-hidden="true" />{pending ? "Guardando…" : "Agregar visita"}</button></footer>
  </form>;
}
