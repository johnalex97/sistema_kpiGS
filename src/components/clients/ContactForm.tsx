import { useState } from "react";
import { ClientDialogFrame } from "./ClientDialogFrame";
import type { ApiFieldError } from "../../api/http";
import type { ClientBranch, ClientContact, ContactScope, CreateContactInput } from "../../models/client";

export interface ContactFormValues {
  scope: ContactScope;
  branchId?: string | null;
  fullName: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
}

const optional = (value?: string | null) => value?.trim() || null;
type ContactField = "fullName" | "position" | "phone" | "email" | "scope" | "branchId";

class ContactInputError extends Error {
  constructor(public field: ContactField, message: string) { super(message); }
}

// The normalizer is shared with the workspace mutation boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function toContactInput(values: ContactFormValues, branches: ClientBranch[] = [], clientId?: string): CreateContactInput {
  const fullName = values.fullName.trim();
  if (!fullName) throw new ContactInputError("fullName", "El nombre del contacto es obligatorio.");
  if (fullName.length > 160) throw new ContactInputError("fullName", "Nombre completo admite hasta 160 caracteres.");
  const position = optional(values.position);
  const phone = optional(values.phone);
  const email = optional(values.email);
  if (position && position.length > 120) throw new ContactInputError("position", "Cargo admite hasta 120 caracteres.");
  if (phone && phone.length > 30) throw new ContactInputError("phone", "Teléfono admite hasta 30 caracteres.");
  if (email && email.length > 254) throw new ContactInputError("email", "Correo admite hasta 254 caracteres.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ContactInputError("email", "Correo no tiene un formato válido.");
  if (values.scope !== "CLIENT" && values.scope !== "BRANCH") throw new ContactInputError("scope", "Selecciona un ámbito válido.");
  const common = { fullName, position, phone, email, isPrimary: values.isPrimary };
  if (values.scope === "CLIENT") return { scope: "CLIENT", ...common };
  const branchId = values.branchId?.trim();
  if (!branchId || !branches.some((branch) => branch.id === branchId && branch.isActive && (!clientId || branch.clientId === clientId))) {
    throw new ContactInputError("branchId", "Selecciona una sucursal activa de este cliente.");
  }
  return { scope: "BRANCH", branchId, ...common };
}

interface ContactFormProps {
  mode: "create" | "edit";
  values: ContactFormValues;
  branches: ClientBranch[];
  clientId: string;
  baseVersion?: number | null;
  pending: boolean;
  error: string | null;
  fieldErrors?: ApiFieldError[];
  conflict?: ClientContact | null;
  reviewPending?: boolean;
  reviewError?: string | null;
  versionConflict?: boolean;
  onReview?(): void | Promise<void>;
  onAdopt?(): void;
  onChange(patch: Partial<ContactFormValues>): void;
  onSubmit(values: ContactFormValues): void | Promise<void>;
  onClose(): void;
}

export function ContactForm({ mode, values, branches, clientId, baseVersion, pending, error, fieldErrors = [], conflict = null, reviewPending = false, reviewError = null, versionConflict = false, onReview, onAdopt, onChange, onSubmit, onClose }: ContactFormProps) {
  const [localError, setLocalError] = useState<ContactInputError | null>(null);
  const [submitGuard, setSubmitGuard] = useState(false);
  const branchOptions = branches.filter((branch) => branch.clientId === clientId && branch.isActive);
  const submit = () => {
    if (pending || submitGuard) return;
    try {
      toContactInput(values, branches, clientId);
      setLocalError(null);
      setSubmitGuard(true);
      void Promise.resolve(onSubmit(values)).finally(() => setSubmitGuard(false));
    } catch (issue) { setLocalError(issue instanceof ContactInputError ? issue : new ContactInputError("fullName", "Revisa los datos del contacto.")); }
  };
  const fieldError = (field: ContactField) => fieldErrors.find((issue) => issue.field === field)?.message ?? (localError?.field === field ? localError.message : null);
  const display = (value: string | null) => value || "No registrado";
  return <ClientDialogFrame open pending={pending || submitGuard} label={mode === "create" ? "Nuevo contacto" : "Editar contacto"} onClose={onClose}>
    <header className="clients-wizard__head"><p className="eyebrow">Contactos</p><h2>{mode === "create" ? "Nuevo contacto" : "Editar contacto"}</h2>{baseVersion != null && <p>Versión base {baseVersion}</p>}</header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label className="clients-wizard__field">Nombre completo<input aria-label="Nombre completo" value={values.fullName} maxLength={161} disabled={pending} aria-invalid={Boolean(fieldError("fullName"))} aria-describedby={fieldError("fullName") ? "contact-fullName-error" : undefined} onChange={(event) => { setLocalError(null); onChange({ fullName: event.target.value }); }} />{fieldError("fullName") && <span id="contact-fullName-error" className="clients-wizard__error" role="alert">{fieldError("fullName")}</span>}</label>
      <label className="clients-wizard__field">Cargo<input aria-label="Cargo" value={values.position ?? ""} maxLength={121} disabled={pending} aria-invalid={Boolean(fieldError("position"))} aria-describedby={fieldError("position") ? "contact-position-error" : undefined} onChange={(event) => { setLocalError(null); onChange({ position: event.target.value }); }} />{fieldError("position") && <span id="contact-position-error" className="clients-wizard__error" role="alert">{fieldError("position")}</span>}</label>
      <label className="clients-wizard__field">Teléfono<input aria-label="Teléfono" value={values.phone ?? ""} maxLength={31} disabled={pending} aria-invalid={Boolean(fieldError("phone"))} aria-describedby={fieldError("phone") ? "contact-phone-error" : undefined} onChange={(event) => { setLocalError(null); onChange({ phone: event.target.value }); }} />{fieldError("phone") && <span id="contact-phone-error" className="clients-wizard__error" role="alert">{fieldError("phone")}</span>}</label>
      <label className="clients-wizard__field">Correo<input aria-label="Correo" type="email" value={values.email ?? ""} maxLength={255} disabled={pending} aria-invalid={Boolean(fieldError("email"))} aria-describedby={fieldError("email") ? "contact-email-error" : undefined} onChange={(event) => { setLocalError(null); onChange({ email: event.target.value }); }} />{fieldError("email") && <span id="contact-email-error" className="clients-wizard__error" role="alert">{fieldError("email")}</span>}</label>
      <label className="clients-wizard__field">Ámbito<select aria-label="Ámbito" value={values.scope} disabled={pending} aria-invalid={Boolean(fieldError("scope"))} aria-describedby={fieldError("scope") ? "contact-scope-error" : undefined} onChange={(event) => { setLocalError(null); onChange({ scope: event.target.value as ContactScope, branchId: null }); }}><option value="CLIENT">General</option><option value="BRANCH">Sucursal</option></select>{fieldError("scope") && <span id="contact-scope-error" className="clients-wizard__error" role="alert">{fieldError("scope")}</span>}</label>
      {values.scope === "BRANCH" && <label className="clients-wizard__field">Sucursal<select aria-label="Sucursal" value={values.branchId ?? ""} disabled={pending} aria-invalid={Boolean(fieldError("branchId"))} aria-describedby={fieldError("branchId") ? "contact-branchId-error" : undefined} onChange={(event) => { setLocalError(null); onChange({ branchId: event.target.value }); }}><option value="">Selecciona una sucursal</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{fieldError("branchId") && <span id="contact-branchId-error" className="clients-wizard__error" role="alert">{fieldError("branchId")}</span>}</label>}
      <label className="clients-wizard__field"><input type="checkbox" checked={values.isPrimary} disabled={pending} onChange={(event) => onChange({ isPrimary: event.target.checked })} />Contacto principal</label>
      {values.isPrimary && <p className="clients-notice">Este contacto reemplazará al principal activo del mismo ámbito.</p>}
      {fieldErrors.filter((issue) => !["fullName", "position", "phone", "email", "scope", "branchId"].includes(issue.field ?? "")).map((issue, index) => <p key={`${issue.field}-${index}`} role="alert">{issue.message}</p>)}
      {conflict && <section className="clients-notice" role="region" aria-label="Estado vigente del contacto">
        <p>Compara los datos vigentes antes de adoptar la versión. Tu borrador se conserva.</p>
        <dl className="clients-detail__facts"><div><dt>Nombre completo</dt><dd>{conflict.fullName}</dd></div><div><dt>Cargo</dt><dd>{display(conflict.position)}</dd></div><div><dt>Teléfono</dt><dd>{display(conflict.phone)}</dd></div><div><dt>Correo</dt><dd>{display(conflict.email)}</dd></div><div><dt>Ámbito</dt><dd>{conflict.scope === "CLIENT" ? "General" : "Sucursal"}</dd></div><div><dt>Sucursal</dt><dd>{conflict.scope === "CLIENT" ? "No aplica" : display(conflict.branchName)}</dd></div><div><dt>Principal</dt><dd>{conflict.isPrimary ? "Sí" : "No"}</dd></div><div><dt>Estado</dt><dd>{conflict.isActive ? "Activo" : "Inactivo"}</dd></div><div><dt>Versión</dt><dd>{conflict.version}</dd></div></dl>
        <button type="button" disabled={pending || reviewPending} onClick={onAdopt}>Adoptar versión {conflict.version}</button>
      </section>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      {reviewError && <p className="clients-wizard__server-error" role="alert">{reviewError}</p>}
      {versionConflict && <button className="button button--ghost" type="button" disabled={pending || reviewPending} onClick={() => void onReview?.()}>{reviewPending ? "Consultando versión…" : "Revisar versión vigente"}</button>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submitGuard}>{pending ? "Guardando…" : "Guardar contacto"}</button></footer>
    </form>
  </ClientDialogFrame>;
}
