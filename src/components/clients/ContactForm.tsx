import { useState } from "react";
import type { ApiFieldError } from "../../api/http";
import type { ClientBranch, ContactScope, CreateContactInput } from "../../models/client";

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

// The normalizer is shared with the workspace mutation boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function toContactInput(values: ContactFormValues, branches: ClientBranch[] = [], clientId?: string): CreateContactInput {
  const fullName = values.fullName.trim();
  if (!fullName) throw new Error("El nombre del contacto es obligatorio.");
  const common = { fullName, position: optional(values.position), phone: optional(values.phone), email: optional(values.email), isPrimary: values.isPrimary };
  if (values.scope === "CLIENT") return { scope: "CLIENT", ...common };
  const branchId = values.branchId?.trim();
  if (!branchId || !branches.some((branch) => branch.id === branchId && branch.isActive && (!clientId || branch.clientId === clientId))) {
    throw new Error("Selecciona una sucursal activa de este cliente.");
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
  onChange(patch: Partial<ContactFormValues>): void;
  onSubmit(values: ContactFormValues): void | Promise<void>;
  onClose(): void;
}

export function ContactForm({ mode, values, branches, clientId, baseVersion, pending, error, fieldErrors = [], onChange, onSubmit, onClose }: ContactFormProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const branchOptions = branches.filter((branch) => branch.clientId === clientId && branch.isActive);
  const submit = () => {
    try { toContactInput(values, branches, clientId); setLocalError(null); void onSubmit(values); }
    catch (issue) { setLocalError(issue instanceof Error ? issue.message : "Revisa los datos del contacto."); }
  };
  return <div className="clients-wizard-backdrop"><section className="clients-wizard" role="dialog" aria-modal="true" aria-label={mode === "create" ? "Nuevo contacto" : "Editar contacto"}>
    <header className="clients-wizard__head"><p className="eyebrow">Contactos</p><h2>{mode === "create" ? "Nuevo contacto" : "Editar contacto"}</h2>{baseVersion != null && <p>Versión base {baseVersion}</p>}</header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label className="clients-wizard__field">Nombre completo<input value={values.fullName} disabled={pending} onChange={(event) => onChange({ fullName: event.target.value })} /></label>
      <label className="clients-wizard__field">Cargo<input value={values.position ?? ""} disabled={pending} onChange={(event) => onChange({ position: event.target.value })} /></label>
      <label className="clients-wizard__field">Teléfono<input value={values.phone ?? ""} disabled={pending} onChange={(event) => onChange({ phone: event.target.value })} /></label>
      <label className="clients-wizard__field">Correo<input type="email" value={values.email ?? ""} disabled={pending} onChange={(event) => onChange({ email: event.target.value })} /></label>
      <label className="clients-wizard__field">Ámbito<select value={values.scope} disabled={pending} onChange={(event) => onChange({ scope: event.target.value as ContactScope, branchId: null })}><option value="CLIENT">General</option><option value="BRANCH">Sucursal</option></select></label>
      {values.scope === "BRANCH" && <label className="clients-wizard__field">Sucursal<select value={values.branchId ?? ""} disabled={pending} onChange={(event) => onChange({ branchId: event.target.value })}><option value="">Selecciona una sucursal</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      <label className="clients-wizard__field"><input type="checkbox" checked={values.isPrimary} disabled={pending} onChange={(event) => onChange({ isPrimary: event.target.checked })} />Contacto principal</label>
      {values.isPrimary && <p className="clients-notice">Este contacto reemplazará al principal activo del mismo ámbito.</p>}
      {fieldErrors.map((issue, index) => <p key={`${issue.field}-${index}`} role="alert">{issue.message}</p>)}
      {(localError || error) && <p className="clients-wizard__server-error" role="alert">{localError || error}</p>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar contacto"}</button></footer>
    </form>
  </section></div>;
}
