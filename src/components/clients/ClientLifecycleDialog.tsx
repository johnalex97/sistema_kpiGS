import { useState } from "react";
import type { ApiFieldError } from "../../api/http";
import type { ClientBranch, ClientContact, ClientDetail } from "../../models/client";

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

interface BranchLifecycleDialogProps extends Omit<ClientLifecycleDialogProps, "client" | "conflict"> {
  branch: ClientBranch;
  conflict: ClientBranch | null;
}

export function BranchLifecycleDialog({ branch, action, baseVersion, reason, pending, reviewPending, error, reviewError, versionConflict = false, conflict, fieldErrors = [], onReasonChange, onSubmit, onClose, onReview, onAdopt }: BranchLifecycleDialogProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitGuard, setSubmitGuard] = useState(false);
  const deactivating = action === "deactivate";
  const reasonError = fieldErrors.find((issue) => issue.field === "reason")?.message ?? localError;
  const submit = () => {
    if (pending || submitGuard) return;
    const normalized = reason.trim();
    if (normalized.length < 10 || normalized.length > 500) { setLocalError("El motivo debe tener entre 10 y 500 caracteres."); return; }
    setLocalError(null);
    setSubmitGuard(true);
    void Promise.resolve(onSubmit(normalized)).finally(() => setSubmitGuard(false));
  };
  return <div className="clients-wizard-backdrop"><section className="clients-wizard" role="dialog" aria-modal="true" aria-label={`${deactivating ? "Desactivar" : "Reactivar"} sucursal ${branch.name}`}>
    <header className="clients-wizard__head"><p className="eyebrow">Ciclo de vida</p><h2>{deactivating ? "Desactivar" : "Reactivar"} sucursal</h2><p>{branch.name} · versión base {baseVersion}</p></header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <p>{deactivating ? "La sucursal dejará de estar disponible si el servidor confirma la operación. Otras sucursales conservan su estado interno." : "La sucursal volverá a estar disponible según el estado del cliente."}</p>
      <label className="clients-wizard__field">Motivo<textarea aria-label="Motivo" value={reason} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? "branch-lifecycle-reason-error" : undefined} onChange={(event) => { setLocalError(null); onReasonChange(event.target.value); }} />{reasonError && <span id="branch-lifecycle-reason-error" className="clients-wizard__error" role="alert">{reasonError}</span>}</label>
      {conflict && <section className="clients-notice" role="region" aria-label="Estado vigente de la sucursal"><p>Versión actual: {conflict.version}. Tu motivo se conserva.</p><p>{conflict.name} · {conflict.isActive ? "Activa" : "Inactiva"}</p><button type="button" disabled={pending || reviewPending} onClick={onAdopt}>Adoptar versión {conflict.version}</button></section>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      {reviewError && <p className="clients-wizard__server-error" role="alert">{reviewError}</p>}
      {versionConflict && <button className="button button--ghost" type="button" disabled={pending || reviewPending} onClick={() => void onReview()}>{reviewPending ? "Consultando versión…" : "Revisar versión vigente"}</button>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submitGuard}>{pending ? "Procesando…" : "Confirmar"}</button></footer>
    </form>
  </section></div>;
}

interface ContactLifecycleDialogProps {
  contact: ClientContact;
  action: "deactivate" | "reactivate";
  baseVersion: number;
  reason: string;
  pending: boolean;
  error: string | null;
  fieldErrors?: ApiFieldError[];
  onReasonChange(reason: string): void;
  onSubmit(reason: string): void | Promise<void>;
  onClose(): void;
}

export function ContactLifecycleDialog({ contact, action, baseVersion, reason, pending, error, fieldErrors = [], onReasonChange, onSubmit, onClose }: ContactLifecycleDialogProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const deactivating = action === "deactivate";
  const submit = () => {
    const normalized = reason.trim();
    if (normalized.length < 10 || normalized.length > 500) { setLocalError("El motivo debe tener entre 10 y 500 caracteres."); return; }
    setLocalError(null);
    void onSubmit(normalized);
  };
  return <div className="clients-wizard-backdrop"><section className="clients-wizard" role="dialog" aria-modal="true" aria-label={`${deactivating ? "Desactivar" : "Reactivar"} contacto ${contact.fullName}`}>
    <header className="clients-wizard__head"><p className="eyebrow">Ciclo de vida</p><h2>{deactivating ? "Desactivar" : "Reactivar"} contacto</h2><p>{contact.fullName} · versión base {baseVersion}</p></header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <p>{deactivating ? "El contacto dejará de estar disponible. Ningún otro contacto se promoverá automáticamente a principal." : "El contacto volverá a estar disponible según el estado del cliente y su sucursal."}</p>
      <label className="clients-wizard__field">Motivo<textarea value={reason} disabled={pending} onChange={(event) => { setLocalError(null); onReasonChange(event.target.value); }} /></label>
      {fieldErrors.map((issue, index) => <p key={`${issue.field}-${index}`} role="alert">{issue.message}</p>)}
      {(localError || error) && <p className="clients-wizard__server-error" role="alert">{localError || error}</p>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Procesando…" : "Confirmar"}</button></footer>
    </form>
  </section></div>;
}
