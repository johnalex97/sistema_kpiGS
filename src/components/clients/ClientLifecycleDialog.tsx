import { useState } from "react";
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
  conflict: ClientDetail | null;
  onReasonChange(reason: string): void;
  onSubmit(reason: string): Promise<void> | void;
  onClose(): void;
  onReview(): Promise<void> | void;
  onAdopt(): void;
}

export function ClientLifecycleDialog({ client, action, baseVersion, reason, pending, reviewPending, error, reviewError, conflict, onReasonChange, onSubmit, onClose, onReview, onAdopt }: ClientLifecycleDialogProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitGuard, setSubmitGuard] = useState(false);
  const deactivating = action === "deactivate";
  const verb = deactivating ? "desactivación" : "reactivación";
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
      <label className="clients-wizard__field">Motivo<textarea aria-label="Motivo" value={reason} disabled={pending} style={{ minHeight: 100, padding: 11, border: "1px solid var(--line)", borderRadius: 7, color: "var(--ink)", resize: "vertical" }} onChange={(event) => { setLocalError(null); onReasonChange(event.target.value); }} /></label>
      {conflict && <div className="clients-notice" role="status"><span>Versión actual: {conflict.version}. Revisa el estado vigente antes de continuar; tu motivo se conserva.</span><button type="button" disabled={pending || reviewPending} onClick={onAdopt}>Adoptar versión {conflict.version}</button></div>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      {localError && <p className="clients-wizard__server-error" role="alert">{localError}</p>}
      {reviewError && <p className="clients-wizard__server-error" role="alert">{reviewError}</p>}
      {error && <button className="button button--ghost" type="button" disabled={pending || reviewPending} onClick={() => void onReview()}>{reviewPending ? "Consultando versión…" : "Revisar versión vigente"}</button>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submitGuard}>{pending ? "Procesando…" : `Confirmar ${verb}`}</button></footer>
    </form>
  </section></div>;
}
