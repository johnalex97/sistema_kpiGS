import { useState } from "react";
import { ClientDialogFrame } from "./ClientDialogFrame";
import type { ApiFieldError } from "../../api/http";
import type { ClientDetail, UpdateClientInput } from "../../models/client";
import type { ClientEditDraft } from "../../hooks/useClientsWorkspace";

interface ClientFormProps {
  client: ClientDetail;
  draft: ClientEditDraft;
  pending: boolean;
  reviewPending: boolean;
  error: string | null;
  reviewError: string | null;
  versionConflict?: boolean;
  fieldErrors: ApiFieldError[];
  onChange(patch: Omit<UpdateClientInput, "version">): void;
  onSubmit(values: Omit<UpdateClientInput, "version">): Promise<void> | void;
  onClose(): void;
  onReview(): Promise<void> | void;
  onAdopt(): void;
}

const fields = [
  { key: "tradeName", label: "Nombre comercial", max: 180, required: true },
  { key: "legalName", label: "Razón social", max: 200 },
  { key: "taxId", label: "RTN", max: 50 },
  { key: "phone", label: "Teléfono", max: 30 },
  { key: "email", label: "Correo institucional", max: 254 },
  { key: "notes", label: "Notas", max: 10000 },
] as const;
type Field = typeof fields[number]["key"];
const display = (value: string | null) => value || "No registrado";

export function ClientForm({ client, draft, pending, reviewPending, error, reviewError, versionConflict = false, fieldErrors, onChange, onSubmit, onClose, onReview, onAdopt }: ClientFormProps) {
  const [localError, setLocalError] = useState<{ field: Field; message: string } | null>(null);
  const [submitGuard, setSubmitGuard] = useState(false);
  const submit = () => {
    if (pending || submitGuard) return;
    const values = { ...draft.values, tradeName: draft.values.tradeName?.trim() ?? "" };
    if (!values.tradeName) { setLocalError({ field: "tradeName", message: "Nombre comercial es obligatorio." }); return; }
    for (const field of fields) {
      const value = values[field.key];
      if (value && value.trim().length > field.max) { setLocalError({ field: field.key, message: `${field.label} admite hasta ${field.max} caracteres.` }); return; }
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) { setLocalError({ field: "email", message: "Correo institucional no tiene un formato válido." }); return; }
    setLocalError(null);
    setSubmitGuard(true);
    void Promise.resolve(onSubmit(values)).finally(() => setSubmitGuard(false));
  };
  const fieldError = (key: Field) => fieldErrors.find((issue) => issue.field === key)?.message ?? (localError?.field === key ? localError.message : undefined);
  return <ClientDialogFrame open pending={pending || submitGuard} label={`Editar cliente ${client.tradeName}`} onClose={onClose}>
    <header className="clients-wizard__head"><p className="eyebrow">Registro de clientes</p><h2>Editar cliente</h2><p>Versión base {draft.baseVersion}. Los cambios en sucursales y contactos se gestionan por separado.</p></header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="clients-wizard__grid">{fields.map((field) => <label key={field.key} className="clients-wizard__field">{field.label}
        <input aria-label={field.label} value={draft.values[field.key] ?? ""} maxLength={field.max + 1} disabled={pending} aria-invalid={Boolean(fieldError(field.key))} aria-describedby={fieldError(field.key) ? `client-edit-${field.key}-error` : undefined} onChange={(event) => { setLocalError(null); onChange({ [field.key]: event.target.value || (field.key === "tradeName" ? "" : null) }); }} />
        {fieldError(field.key) && <span id={`client-edit-${field.key}-error`} className="clients-wizard__error" role="alert">{fieldError(field.key)}</span>}
      </label>)}</div>
      {draft.conflict && <section className="clients-notice" role="region" aria-label="Datos vigentes del cliente" style={{ display: "block" }}>
        <p>Versión actual: {draft.conflict.version}. Revisa los datos del servidor; tu borrador permanece sin cambios.</p>
        <dl className="clients-detail__facts">
          <div><dt>Nombre comercial</dt><dd>{draft.conflict.tradeName}</dd></div>
          <div><dt>Razón social</dt><dd>{display(draft.conflict.legalName)}</dd></div>
          <div><dt>RTN</dt><dd>{display(draft.conflict.taxId)}</dd></div>
          <div><dt>Teléfono</dt><dd>{display(draft.conflict.phone)}</dd></div>
          <div><dt>Correo institucional</dt><dd>{display(draft.conflict.email)}</dd></div>
          <div><dt>Notas</dt><dd>{display(draft.conflict.notes)}</dd></div>
        </dl>
        <button type="button" disabled={pending || reviewPending} onClick={onAdopt}>Adoptar versión {draft.conflict.version}</button>
      </section>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      {reviewError && <p className="clients-wizard__server-error" role="alert">{reviewError}</p>}
      {versionConflict && <button className="button button--ghost" type="button" disabled={pending || reviewPending} onClick={() => void onReview()}>{reviewPending ? "Consultando versión…" : "Revisar versión vigente"}</button>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submitGuard}>{pending ? "Guardando…" : "Guardar cambios"}</button></footer>
    </form>
  </ClientDialogFrame>;
}
