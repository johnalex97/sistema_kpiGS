import { AlertTriangle, X } from "lucide-react";
import { useOrderDialogFocus } from "./useOrderDialogFocus";
import { useRef, useState, type FormEvent } from "react";
import {
  fromTegucigalpaDateTimeInput,
  toTegucigalpaDateTimeInput,
} from "../../hooks/order-workspace.helpers";
import type {
  OrderActionInput,
  OrderDetail,
  OrderDialogAction,
} from "../../models/order";

interface OrderActionDialogProps {
  action: OrderDialogAction;
  order: OrderDetail;
  pending: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(input: OrderActionInput): Promise<boolean>;
}

const copy: Record<OrderDialogAction, { title: string; eyebrow: string; submit: string }> = {
  pause: { title: "Pausar orden", eyebrow: "CONTROL DE JORNADA", submit: "Pausar orden" },
  complete: { title: "Finalizar orden", eyebrow: "CIERRE TÉCNICO", submit: "Finalizar orden" },
  cancel: { title: "Cancelar orden", eyebrow: "CONTROL ADMINISTRATIVO", submit: "Cancelar definitivamente" },
  adjust: { title: "Ajustar orden", eyebrow: "CORRECCIÓN AUDITADA", submit: "Guardar ajuste" },
};

function normalized(value: string): string {
  return value.trim();
}

export function OrderActionDialog({
  action,
  order,
  pending,
  error,
  onCancel,
  onSubmit,
}: OrderActionDialogProps) {
  const panelRef = useRef<HTMLFormElement>(null);
  useOrderDialogFocus(panelRef, true, pending, onCancel);
  const [initialDates] = useState(() => ({
    scheduledFor: toTegucigalpaDateTimeInput(order.scheduledFor),
    startedAt: toTegucigalpaDateTimeInput(order.startedAt),
    endedAt: toTegucigalpaDateTimeInput(order.endedAt),
  }));
  const [validation, setValidation] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [diagnosis, setDiagnosis] = useState(order.diagnosis ?? "");
  const [result, setResult] = useState(order.result ?? "");
  const [cancellationReason, setCancellationReason] = useState(order.cancellationReason ?? "");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState(order.description ?? "");
  const [scheduledFor, setScheduledFor] = useState(initialDates.scheduledFor);
  const [startedAt, setStartedAt] = useState(initialDates.startedAt);
  const [endedAt, setEndedAt] = useState(initialDates.endedAt);
  const [estimatedMinutes, setEstimatedMinutes] = useState(order.estimatedMinutes?.toString() ?? "");
  const labels = copy[action];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidation(null);
    let input: OrderActionInput;
    if (action === "pause") {
      if (normalized(comment).length < 10) {
        setValidation("El comentario debe tener al menos 10 caracteres.");
        return;
      }
      input = { comment: normalized(comment) };
    } else if (action === "complete") {
      if (normalized(diagnosis).length < 3 || normalized(result).length < 3) {
        setValidation("El diagnóstico y el resultado deben tener al menos 3 caracteres.");
        return;
      }
      input = { diagnosis: normalized(diagnosis), result: normalized(result) };
    } else if (action === "cancel") {
      if (normalized(cancellationReason).length < 10) {
        setValidation("El motivo de cancelación debe tener al menos 10 caracteres.");
        return;
      }
      input = { cancellationReason: normalized(cancellationReason) };
    } else {
      if (normalized(reason).length < 10) {
        setValidation("El motivo del ajuste debe tener al menos 10 caracteres.");
        return;
      }
      const changes: OrderActionInput = {};
      if (normalized(description) !== (order.description ?? "")) changes.description = normalized(description) || null;
      const nextScheduled = fromTegucigalpaDateTimeInput(scheduledFor);
      const nextStarted = fromTegucigalpaDateTimeInput(startedAt);
      const nextEnded = fromTegucigalpaDateTimeInput(endedAt);
      if (scheduledFor !== initialDates.scheduledFor) changes.scheduledFor = nextScheduled;
      if (startedAt !== initialDates.startedAt) changes.startedAt = nextStarted;
      if (endedAt !== initialDates.endedAt) changes.endedAt = nextEnded;
      if (normalized(diagnosis) !== (order.diagnosis ?? "")) changes.diagnosis = normalized(diagnosis) || null;
      if (normalized(result) !== (order.result ?? "")) changes.result = normalized(result) || null;
      if (normalized(cancellationReason) !== (order.cancellationReason ?? "")) changes.cancellationReason = normalized(cancellationReason) || null;
      const minutes = normalized(estimatedMinutes) ? Number(estimatedMinutes) : null;
      if (minutes !== order.estimatedMinutes) changes.estimatedMinutes = minutes;
      if (Object.keys(changes).length === 0) {
        setValidation("Modifica al menos un dato antes de guardar el ajuste.");
        return;
      }
      input = { reason: normalized(reason), ...changes };
    }
    await onSubmit(input);
  };

  return <div className="order-action-backdrop" role="presentation">
    <form tabIndex={-1} ref={panelRef} className={`order-action-dialog order-action-dialog--${action}`} role="dialog" aria-modal="true" aria-labelledby="order-action-title" onSubmit={(event) => void submit(event)}>
      <header>
        <div><span>{labels.eyebrow}</span><h2 id="order-action-title">{labels.title}</h2><p>{order.orderNumber} · versión {order.version}</p></div>
        <button type="button" aria-label="Cerrar" disabled={pending} onClick={onCancel}><X size={18} /></button>
      </header>
      <fieldset disabled={pending}>
        {action === "pause" && <label>Comentario<textarea aria-label="Comentario" rows={4} value={comment} onChange={(event) => setComment(event.target.value)} /></label>}
        {action === "complete" && <div className="order-action-dialog__grid">
          <label>Diagnóstico<textarea aria-label="Diagnóstico" rows={5} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} /></label>
          <label>Resultado<textarea aria-label="Resultado" rows={5} value={result} onChange={(event) => setResult(event.target.value)} /></label>
        </div>}
        {action === "cancel" && <label>Motivo de cancelación<textarea aria-label="Motivo de cancelación" rows={4} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></label>}
        {action === "adjust" && <div className="order-action-dialog__grid">
          <label className="order-action-dialog__wide">Motivo del ajuste<textarea aria-label="Motivo del ajuste" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <label className="order-action-dialog__wide">Descripción<textarea aria-label="Descripción" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Programada para<input name="scheduledFor" type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <label>Inicio real<input name="startedAt" type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></label>
          <label>Fin real<input name="endedAt" type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} /></label>
          <label>Minutos estimados<input type="number" min="1" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
          <label>Diagnóstico<textarea rows={3} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} /></label>
          <label>Resultado<textarea rows={3} value={result} onChange={(event) => setResult(event.target.value)} /></label>
          <label className="order-action-dialog__wide">Motivo de cancelación<textarea rows={3} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></label>
        </div>}
      </fieldset>
      {(validation || error) && <p className="order-action-dialog__error" role="alert"><AlertTriangle size={15} />{validation ?? error}</p>}
      <footer><button type="button" className="button button--ghost" disabled={pending} onClick={onCancel}>Volver</button><button type="submit" className={action === "cancel" ? "button order-action-dialog__danger" : "button button--primary"} disabled={pending}>{pending ? "Procesando…" : labels.submit}</button></footer>
    </form>
  </div>;
}
