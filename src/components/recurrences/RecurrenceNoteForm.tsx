import { AlertTriangle, MessageSquarePlus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AddRecurrenceNoteInput } from "../../models/recurrence";

export interface RecurrenceNoteFormProps {
  apiError?: string | null;
  submissionBlocked?: boolean;
  onSubmit(input: AddRecurrenceNoteInput): Promise<boolean>;
  onCancel(): void;
}

export function RecurrenceNoteForm({ apiError = null, submissionBlocked = false, onSubmit, onCancel }: RecurrenceNoteFormProps) {
  const [content, setContent] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(false);
  const cancelRef = useRef(onCancel);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    noteRef.current?.focus();
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

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = Array.from(formRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    const normalized = content.trim();
    if (!normalized) {
      setValidationError("Escribe una nota antes de agregarla.");
      noteRef.current?.focus();
      return;
    }
    if (normalized.length > 10_000) {
      setValidationError("La nota no puede superar 10,000 caracteres.");
      noteRef.current?.focus();
      return;
    }
    setValidationError(null);
    pendingRef.current = true;
    setPending(true);
    formRef.current?.focus();
    try {
      await onSubmit({ content: normalized });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const errorId = validationError ? "recurrence-note-error" : undefined;
  return <form className="recurrence-workflow-form recurrence-workflow-form--note" role="dialog" aria-modal="true" aria-labelledby="recurrence-note-title" aria-busy={pending || undefined} tabIndex={-1} ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="recurrence-workflow-form__head"><div><p className="eyebrow">Cronología del caso</p><h2 id="recurrence-note-title">Agregar nota</h2><span>Registra un seguimiento breve sin modificar la versión del caso.</span></div><button className="icon-button" type="button" aria-label="Cerrar nota" disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button></header>
    <fieldset className="recurrence-workflow-form__body" disabled={pending}><legend className="sr-only">Contenido de la nota</legend>
      <label><span>Nota</span><textarea ref={noteRef} name="content" rows={6} maxLength={10_000} aria-invalid={Boolean(validationError) || undefined} aria-describedby={validationError ? errorId : undefined} value={content} onChange={(event) => { setContent(event.target.value); setValidationError(null); }} placeholder="Ej.: Cliente confirma estabilidad durante 24 horas…" /></label>
      {validationError && <p className="recurrence-workflow-form__error" id={errorId} role="alert"><AlertTriangle size={16} aria-hidden="true" />{validationError}</p>}
      {apiError && <p className="recurrence-workflow-form__error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{apiError}</p>}
    </fieldset>
    <footer className="recurrence-workflow-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submissionBlocked}><MessageSquarePlus size={16} aria-hidden="true" />{pending ? "Guardando…" : "Agregar nota"}</button></footer>
  </form>;
}
