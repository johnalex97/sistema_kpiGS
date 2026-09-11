import { AlertTriangle, ArchiveX, LockKeyhole, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

export interface RecurrenceTerminalDialogProps {
  action: "dismiss" | "close";
  recurrenceNumber: string;
  apiError?: string | null;
  submissionBlocked?: boolean;
  onConfirm(reason?: string): Promise<boolean>;
  onCancel(): void;
}

function focusableElements(form: HTMLFormElement): HTMLElement[] {
  return Array.from(form.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
}

export function RecurrenceTerminalDialog({ action, recurrenceNumber, apiError = null, submissionBlocked = false, onConfirm, onCancel }: RecurrenceTerminalDialogProps) {
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const cancelRef = useRef(onCancel);
  const dismissing = action === "dismiss";

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (dismissing ? reasonRef.current : confirmRef.current)?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!pendingRef.current) cancelRef.current();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      if (previous?.isConnected) previous.focus();
    };
  }, [dismissing]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = focusableElements(formRef.current);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last || document.activeElement === formRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || submissionBlocked) return;
    const normalized = reason.trim();
    if (dismissing && (normalized.length < 10 || normalized.length > 500)) {
      setValidationError("El motivo del descarte debe tener entre 10 y 500 caracteres.");
      reasonRef.current?.focus();
      return;
    }
    setValidationError(null);
    pendingRef.current = true;
    setPending(true);
    formRef.current?.focus();
    try { await onConfirm(dismissing ? normalized : undefined); }
    finally { pendingRef.current = false; setPending(false); }
  };

  const title = dismissing ? "Descartar caso" : "Cerrar caso";
  const button = dismissing ? "Confirmar descarte" : "Confirmar cierre";
  return <form className="recurrence-terminal-dialog" role="dialog" aria-modal="true" aria-labelledby="recurrence-terminal-title" aria-busy={pending || undefined} tabIndex={-1} ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="recurrence-terminal-dialog__head"><div><p className="eyebrow">Decisión de revisión</p><h2 id="recurrence-terminal-title">{title}</h2><span>Confirma la acción para <strong>{recurrenceNumber}</strong>.</span></div><button className="icon-button" type="button" aria-label={`Cerrar ${dismissing ? "descarte" : "cierre"}`} disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button></header>
    <fieldset className="recurrence-terminal-dialog__body" disabled={pending}><legend className="sr-only">Confirmación del caso</legend>
      <div className={`recurrence-terminal-dialog__notice recurrence-terminal-dialog__notice--${action}`}>{dismissing ? <ArchiveX size={21} aria-hidden="true" /> : <LockKeyhole size={21} aria-hidden="true" />}<p><strong>{dismissing ? "El caso quedará descartado." : "El caso quedará cerrado."}</strong><span>{dismissing ? "La razón será visible en la trazabilidad y no podrá operarse como reincidencia." : "La API comprobará documentación y evidencia activa antes de completar el cierre."}</span></p></div>
      {dismissing && <label><span>Motivo del descarte</span><textarea ref={reasonRef} name="reason" rows={4} maxLength={500} value={reason} aria-invalid={validationError ? "true" : undefined} aria-describedby={validationError ? "recurrence-terminal-error" : undefined} onChange={(event) => { setReason(event.target.value); setValidationError(null); }} /></label>}
      {validationError && <p id="recurrence-terminal-error" className="recurrence-terminal-dialog__error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{validationError}</p>}
      {apiError && <p className="recurrence-terminal-dialog__error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{apiError}</p>}
    </fieldset>
    <footer className="recurrence-terminal-dialog__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button ref={confirmRef} className={`button ${dismissing ? "button--ghost" : "button--primary"}`} type="submit" disabled={pending || submissionBlocked}>{pending ? "Procesando…" : button}</button></footer>
  </form>;
}
