import { type FormEvent, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ActivityActionCommand, ActivityDetail } from "../../models/activity";

type ExecutableAction = ActivityActionCommand["type"];

export interface ActivityActionDialogProps {
  action: ExecutableAction;
  activity: ActivityDetail;
  pending: boolean;
  error: string | null;
  onConfirm(command: ActivityActionCommand): Promise<void> | void;
  onCancel(): void;
}

const titles: Record<ExecutableAction, string> = {
  start: "Iniciar actividad",
  pause: "Pausar actividad",
  resume: "Reanudar actividad",
  complete: "Completar actividad",
  cancel: "Cancelar actividad",
  adjust: "Ajustar actividad",
};

const submitLabels: Record<ExecutableAction, string> = {
  start: "Iniciar actividad",
  pause: "Confirmar pausa",
  resume: "Reanudar actividad",
  complete: "Completar actividad",
  cancel: "Cancelar definitivamente",
  adjust: "Guardar ajuste",
};

export function ActivityActionDialog({ action, activity, pending, error, onConfirm, onCancel }: ActivityActionDialogProps) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState(activity.result ?? "");
  const [observations, setObservations] = useState(activity.observations ?? "");
  const [description, setDescription] = useState(activity.description);
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onCancel, pending]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    if ((action === "pause" || action === "cancel" || action === "adjust") && !reason.trim()) {
      setValidationError("Escribe el motivo para continuar.");
      return;
    }
    if (action === "complete" && !result.trim()) {
      setValidationError("Escribe el resultado del trabajo.");
      return;
    }
    if ((action === "cancel" || action === "adjust") && !confirmed) {
      setValidationError("Confirma que revisaste el impacto de esta acción.");
      return;
    }
    if (action === "adjust") {
      const changed = description.trim() !== activity.description
        || result.trim() !== (activity.result ?? "")
        || observations.trim() !== (activity.observations ?? "");
      if (!changed) {
        setValidationError("Modifica al menos un dato de la actividad.");
        return;
      }
      await onConfirm({ type: "adjust", input: {
        reason: reason.trim(),
        description: description.trim(),
        result: result.trim(),
        observations: observations.trim() || null,
      } });
      return;
    }
    if (action === "pause") await onConfirm({ type: "pause", reason: reason.trim() });
    if (action === "cancel") await onConfirm({ type: "cancel", reason: reason.trim() });
    if (action === "complete") await onConfirm({ type: "complete", result: result.trim(), ...(observations.trim() ? { observations: observations.trim() } : {}) });
    if (action === "start") await onConfirm({ type: "start" });
    if (action === "resume") await onConfirm({ type: "resume" });
  };

  return <div className="modal-backdrop">
    <section className="modal activity-action-dialog" role="dialog" aria-modal="true" aria-labelledby="activity-action-title">
      <header className="modal-head"><div><p className="eyebrow">Acción operativa</p><h2 id="activity-action-title">{titles[action]}</h2><span>{activity.description}</span></div><button className="icon-button" type="button" aria-label="Cerrar acción" disabled={pending} onClick={onCancel}><X size={18} /></button></header>
      <form noValidate onSubmit={submit}>
        {(action === "pause" || action === "cancel" || action === "adjust") && <label className="field field--wide"><span>Motivo</span><textarea aria-label="Motivo" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
        {(action === "complete" || action === "adjust") && <label className="field field--wide"><span>Resultado</span><textarea aria-label="Resultado" rows={3} value={result} onChange={(event) => setResult(event.target.value)} /></label>}
        {action === "adjust" && <label className="field field--wide"><span>Descripción</span><textarea aria-label="Descripción ajustada" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>}
        {(action === "complete" || action === "adjust") && <label className="field field--wide"><span>Observaciones</span><textarea aria-label="Observaciones" rows={3} value={observations} onChange={(event) => setObservations(event.target.value)} /></label>}
        {(action === "start" || action === "resume") && <p className="activity-action-dialog__notice">El cronómetro de trabajo se actualizará inmediatamente.</p>}
        {(action === "cancel" || action === "adjust") && <label className="check-field field--wide"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><b>Confirmo que revisé esta acción</b><small>{action === "cancel" ? "La actividad quedará cancelada y no podrá operarse." : "El ajuste quedará registrado en la bitácora."}</small></span></label>}
        {(validationError || error) && <p className="form-error field--wide" role="alert"><AlertTriangle size={14} aria-hidden="true" />{validationError ?? error}</p>}
        <div className="modal-actions field--wide"><button className="button button--ghost" type="button" disabled={pending} onClick={onCancel}>Volver</button><button className="button button--primary" type="submit" aria-label={submitLabels[action]} disabled={pending}>{pending ? "Guardando…" : submitLabels[action]}</button></div>
      </form>
    </section>
  </div>;
}
