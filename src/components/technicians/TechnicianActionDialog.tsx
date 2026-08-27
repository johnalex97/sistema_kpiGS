import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { OperationalTechnicianStatus, Technician } from "../../models/technician";

export type TechnicianAction =
  | { kind: "status"; technician: Technician }
  | { kind: "deactivate"; technician: Technician }
  | { kind: "reactivate"; technician: Technician };

export type TechnicianActionValue =
  | { status: OperationalTechnicianStatus }
  | { reason: string; leftOn?: string }
  | { reason: string };

interface TechnicianActionDialogProps {
  action: TechnicianAction;
  error?: string | null;
  now?: () => Date;
  onCancel(): void;
  onConfirm(value: TechnicianActionValue): Promise<boolean>;
}

const titles = { status: "Cambiar estado", deactivate: "Desactivar técnico", reactivate: "Reactivar técnico" } as const;
const submitLabels = { status: "Guardar estado", deactivate: "Desactivar técnico", reactivate: "Reactivar técnico" } as const;
const statusLabels: Record<OperationalTechnicianStatus, string> = { AVAILABLE: "Disponible", BUSY: "Ocupado", ON_ROUTE: "En ruta" };

function todayInTegucigalpa(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Tegucigalpa" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function TechnicianActionDialog({ action, error, now = () => new Date(), onCancel, onConfirm }: TechnicianActionDialogProps) {
  const [status, setStatus] = useState<OperationalTechnicianStatus | "">("");
  const [reason, setReason] = useState("");
  const [leftOn, setLeftOn] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef(onCancel);
  const pendingRef = useRef(false);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (formRef.current?.querySelector<HTMLElement>("select:not([disabled]), textarea:not([disabled]), input:not([disabled])") ?? formRef.current?.querySelector<HTMLElement>("button:not([disabled])"))?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !pendingRef.current) cancelRef.current(); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previouslyFocused?.focus(); };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = Array.from(formRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let value: TechnicianActionValue;
    if (action.kind === "status") {
      if (!status) { setValidationError("Selecciona el nuevo estado."); return; }
      value = { status };
    } else {
      const normalizedReason = reason.trim();
      if (normalizedReason.length < 10) { setValidationError("El motivo debe tener al menos 10 caracteres."); return; }
      if (normalizedReason.length > 500) { setValidationError("El motivo no puede exceder 500 caracteres."); return; }
      if (action.kind === "deactivate" && leftOn) {
        if (leftOn > todayInTegucigalpa(now())) { setValidationError("La fecha de retiro no puede estar en el futuro."); return; }
        if (action.technician.hiredOn && leftOn < action.technician.hiredOn) { setValidationError("La fecha de retiro no puede ser anterior al ingreso."); return; }
      }
      value = action.kind === "deactivate" ? { reason: normalizedReason, ...(leftOn ? { leftOn } : {}) } : { reason: normalizedReason };
    }
    setValidationError(null);
    setPending(true);
    try { await onConfirm(value); } finally { setPending(false); }
  };

  const title = titles[action.kind];
  return <form className="activity-form technician-action-dialog" role="dialog" aria-modal="true" aria-labelledby="technician-action-title" ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="activity-form__head"><div><p className="eyebrow">Ficha v{action.technician.version}</p><h2 id="technician-action-title">{title}</h2><span>{action.technician.fullName} · {action.technician.code}</span></div><button className="icon-button" type="button" aria-label="Cerrar acción" disabled={pending} onClick={onCancel}><X size={18} aria-hidden="true" /></button></header>
    <fieldset className="activity-form__body" disabled={pending}>
      <legend className="sr-only">{title}</legend>
      {action.kind === "status" ? <label className="activity-form__field"><span>Nuevo estado</span><select name="status" value={status} onChange={(event) => setStatus(event.target.value as OperationalTechnicianStatus)}><option value="">Seleccionar</option>{(Object.keys(statusLabels) as OperationalTechnicianStatus[]).filter((value) => value !== action.technician.status).map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label> : <>
        {action.kind === "deactivate" && <label className="activity-form__field"><span>Fecha de retiro</span><input name="leftOn" type="date" min={action.technician.hiredOn ?? undefined} max={todayInTegucigalpa(now())} value={leftOn} onChange={(event) => setLeftOn(event.target.value)} /></label>}
        <label className="activity-form__field activity-form__field--wide"><span>Motivo</span><textarea name="reason" rows={4} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </>}
      {(validationError || error) && <p className="form-error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{validationError ?? error}</p>}
    </fieldset>
    <footer className="activity-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Guardando…" : submitLabels[action.kind]}</button></footer>
  </form>;
}
