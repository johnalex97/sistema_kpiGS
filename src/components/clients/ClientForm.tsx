import { useState } from "react";
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

export function ClientForm({ client, draft, pending, reviewPending, error, reviewError, fieldErrors, onChange, onSubmit, onClose, onReview, onAdopt }: ClientFormProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitGuard, setSubmitGuard] = useState(false);
  const submit = () => {
    if (pending || submitGuard) return;
    const values = { ...draft.values, tradeName: draft.values.tradeName?.trim() ?? "" };
    if (!values.tradeName) { setLocalError("Nombre comercial es obligatorio."); return; }
    for (const field of fields) {
      const value = values[field.key];
      if (value && value.trim().length > field.max) { setLocalError(`${field.label} admite hasta ${field.max} caracteres.`); return; }
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) { setLocalError("Correo institucional no tiene un formato válido."); return; }
    setLocalError(null);
    setSubmitGuard(true);
    void Promise.resolve(onSubmit(values)).finally(() => setSubmitGuard(false));
  };
  const fieldError = (key: Field) => fieldErrors.find((issue) => issue.field === key)?.message;
  return <div className="clients-wizard-backdrop"><section className="clients-wizard" role="dialog" aria-modal="true" aria-label={`Editar cliente ${client.tradeName}`}>
    <header className="clients-wizard__head"><p className="eyebrow">Registro de clientes</p><h2>Editar cliente</h2><p>Versión base {draft.baseVersion}. Los cambios en sucursales y contactos se gestionan por separado.</p></header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="clients-wizard__grid">{fields.map((field) => <label key={field.key} className="clients-wizard__field">{field.label}
        <input aria-label={field.label} value={draft.values[field.key] ?? ""} maxLength={field.max + 1} disabled={pending} aria-invalid={Boolean(fieldError(field.key))} onChange={(event) => { setLocalError(null); onChange({ [field.key]: event.target.value || (field.key === "tradeName" ? "" : null) }); }} />
        {fieldError(field.key) && <span className="clients-wizard__error" role="alert">{fieldError(field.key)}</span>}
      </label>)}</div>
      {draft.conflict && <div className="clients-notice" role="status"><span>Versión actual: {draft.conflict.version}. El servidor registra “{draft.conflict.tradeName}”. Tu borrador permanece sin cambios.</span><button type="button" disabled={pending || reviewPending} onClick={onAdopt}>Adoptar versión {draft.conflict.version}</button></div>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      {localError && <p className="clients-wizard__server-error" role="alert">{localError}</p>}
      {reviewError && <p className="clients-wizard__server-error" role="alert">{reviewError}</p>}
      {error && <button className="button button--ghost" type="button" disabled={pending || reviewPending} onClick={() => void onReview()}>{reviewPending ? "Consultando versión…" : "Revisar versión vigente"}</button>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submitGuard}>{pending ? "Guardando…" : "Guardar cambios"}</button></footer>
    </form>
  </section></div>;
}
