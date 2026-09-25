import { useState } from "react";
import type { ApiFieldError } from "../../api/http";
import type { ClientDetail } from "../../models/client";

interface ClientLifecycleDialogProps {
  client: ClientDetail;
  action: "deactivate" | "reactivate";
  baseVersion: number;
  reason: string;
  pending: boolean;
  reviewPending: boolean;
  error: string | null;
  reviewError: string | null;
  versionConflict?: boolean;
  conflict: ClientDetail | null;
  fieldErrors?: ApiFieldError[];
  onReasonChange(reason: string): void;
  onSubmit(reason: string): Promise<void> | void;
  onClose(): void;
  onReview(): Promise<void> | void;
  onAdopt(): void;
}

export function ClientLifecycleDialog({ client, action, baseVersion, reason, pending, reviewPending, error, reviewError, versionConflict = false, conflict, fieldErrors = [], onReasonChange, onSubmit, onClose, onReview, onAdopt }: ClientLifecycleDialogProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitGuard, setSubmitGuard] = useState(false);
  const deactivating = action === "deactivate";
  const verb = deactivating ? "desactivación" : "reactivación";
  const reasonError = fieldErrors.find((issue) => issue.field === "reason")?.message ?? localError;
  const submit = () => {
    if (pending || submitGuard) return;
    const normalized = reason.trim();
    if (normalized.length < 10 || normalized.length > 500) { setLocalError("El motivo debe tener entre 10 y 500 caracteres."); return; }
    setLocalError(null);
    setSubmitGuard(true);
    void Promise.resolve(onSubmit(normalized)).finally(() => setSubmitGuard(false));
  };
  return <div className="clients-wizard-backdrop"><section className="clients-wizard" role="dialog" aria-modal="true" aria-label={`${deactivating ? "Desactivar" : "Reactivar"} cliente ${client.tradeName}`}>
    <header className="clients-wizard__head"><p className="eyebrow">Ciclo de vida</p><h2>{deactivating ? "Desactivar" : "Reactivar"} cliente</h2><p>{client.tradeName} · versión base {baseVersion}</p></header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <p>{deactivating ? "El cliente dejará de estar disponible. Las sucursales y contactos conservarán su estado interno." : "El cliente volverá a estar disponible según el estado interno de sus sucursales y contactos."}</p>
      <label className="clients-wizard__field">Motivo<textarea aria-label="Motivo" value={reason} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? "client-lifecycle-reason-error" : undefined} style={{ minHeight: 100, padding: 11, border: "1px solid var(--line)", borderRadius: 7, color: "var(--ink)", resize: "vertical" }} onChange={(event) => { setLocalError(null); onReasonChange(event.target.value); }} />{reasonError && <span id="client-lifecycle-reason-error" className="clients-wizard__error" role="alert">{reasonError}</span>}</label>
      {conflict && <section className="clients-notice" role="region" aria-label="Estado vigente del cliente" style={{ display: "block" }}>
        <p>Versión actual: {conflict.version}. Tu motivo se conserva.</p>
        <dl className="clients-detail__facts"><div><dt>Nombre comercial</dt><dd>{conflict.tradeName}</dd></div><div><dt>Estado</dt><dd>{conflict.isActive ? "Activo" : "Inactivo"}</dd></div></dl>
        <button type="button" disabled={pending || reviewPending} onClick={onAdopt}>Adoptar versión {conflict.version}</button>
      </section>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      {reviewError && <p className="clients-wizard__server-error" role="alert">{reviewError}</p>}
      {versionConflict && <button className="button button--ghost" type="button" disabled={pending || reviewPending} onClick={() => void onReview()}>{reviewPending ? "Consultando versión…" : "Revisar versión vigente"}</button>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submitGuard}>{pending ? "Procesando…" : `Confirmar ${verb}`}</button></footer>
    </form>
  </section></div>;
}
