import { useState } from "react";
import { ClientDialogFrame } from "./ClientDialogFrame";
import type { ApiFieldError } from "../../api/http";
import type { BranchInput } from "../../models/client";
import type { BranchFormDraft } from "../../hooks/useClientsWorkspace";

interface BranchFormProps {
  mode: "create" | "edit";
  draft: BranchFormDraft;
  pending: boolean;
  reviewPending: boolean;
  error: string | null;
  reviewError: string | null;
  versionConflict: boolean;
  fieldErrors: ApiFieldError[];
  onChange(patch: Partial<BranchInput>): void;
  onSubmit(values: BranchInput): Promise<void> | void;
  onClose(): void;
  onReview(): Promise<void> | void;
  onAdopt(): void;
}

const fields = [
  ["name", "Nombre", 160], ["address", "Dirección", 300], ["city", "Ciudad", 100],
  ["region", "Región", 100], ["country", "País", 2], ["lat", "Latitud", 30],
  ["long", "Longitud", 30], ["locationReference", "Referencia de ubicación", 300],
] as const;
type Field = typeof fields[number][0];

function validate(values: BranchInput): { field: Field; message: string } | null {
  for (const [field, label, max] of fields) {
    const value = values[field]?.trim() ?? "";
    if ((field === "name" || field === "address") && !value) return { field, message: `${label} es obligatorio.` };
    if (value.length > max) return { field, message: `${label} admite hasta ${max} caracteres.` };
  }
  if (values.country.trim().toUpperCase() !== "HN") return { field: "country", message: "País debe ser HN." };
  for (const [field, limit] of [["lat", 90], ["long", 180]] as const) {
    const value = values[field]?.trim();
    if (value && (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > limit)) {
      return { field, message: `${field === "lat" ? "Latitud" : "Longitud"} debe estar entre ${-limit} y ${limit}.` };
    }
  }
  if (Boolean(values.lat?.trim()) !== Boolean(values.long?.trim())) return { field: values.lat?.trim() ? "long" : "lat", message: "Latitud y longitud deben registrarse juntas." };
  return null;
}

export function BranchForm({ mode, draft, pending, reviewPending, error, reviewError, versionConflict, fieldErrors, onChange, onSubmit, onClose, onReview, onAdopt }: BranchFormProps) {
  const [localError, setLocalError] = useState<{ field: Field; message: string } | null>(null);
  const [submitGuard, setSubmitGuard] = useState(false);
  const submit = () => {
    if (pending || submitGuard) return;
    const issue = validate(draft.values);
    setLocalError(issue);
    if (issue) return;
    setSubmitGuard(true);
    const values: BranchInput = {
      name: draft.values.name.trim(), address: draft.values.address.trim(), country: "HN",
      city: draft.values.city?.trim() || null, region: draft.values.region?.trim() || null,
      lat: draft.values.lat?.trim() || null, long: draft.values.long?.trim() || null,
      locationReference: draft.values.locationReference?.trim() || null,
    };
    void Promise.resolve(onSubmit(values)).finally(() => setSubmitGuard(false));
  };
  const fieldError = (field: Field) => fieldErrors.find((issue) => issue.field === field)?.message ?? (localError?.field === field ? localError.message : null);
  return <ClientDialogFrame open pending={pending || submitGuard} label={mode === "create" ? "Nueva sucursal" : "Editar sucursal"} onClose={onClose}>
    <header className="clients-wizard__head"><p className="eyebrow">Sucursales</p><h2>{mode === "create" ? "Nueva sucursal" : "Editar sucursal"}</h2>{mode === "edit" && <p>Versión base {draft.baseVersion}</p>}</header>
    <form className="clients-wizard__form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="clients-wizard__grid">{fields.map(([field, label, max]) => {
        const issue = fieldError(field);
        return <label key={field} className="clients-wizard__field">{label}<input type="text" value={draft.values[field] ?? ""} maxLength={max} disabled={pending} aria-invalid={Boolean(issue)} aria-describedby={issue ? `branch-${field}-error` : undefined} onChange={(event) => { setLocalError(null); onChange({ [field]: event.target.value }); }} />{issue && <span id={`branch-${field}-error`} className="clients-wizard__error" role="alert">{issue}</span>}</label>;
      })}</div>
      {draft.conflict && <section className="clients-notice" role="region" aria-label="Estado vigente de la sucursal">
        <p>Compara los datos vigentes con tu borrador antes de adoptar la versión. Tu borrador se conserva.</p>
        <dl className="clients-detail__facts">{fields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{draft.conflict?.[field] || "No registrado"}</dd></div>)}
          <div><dt>Estado</dt><dd>{draft.conflict.isActive ? "Activa" : "Inactiva"}</dd></div>
          <div><dt>Versión</dt><dd>{draft.conflict.version}</dd></div>
        </dl>
        <button type="button" disabled={pending || reviewPending} onClick={onAdopt}>Adoptar versión {draft.conflict.version}</button>
      </section>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      {reviewError && <p className="clients-wizard__server-error" role="alert">{reviewError}</p>}
      {versionConflict && <button className="button button--ghost" type="button" disabled={pending || reviewPending} onClick={() => void onReview()}>{reviewPending ? "Consultando versión…" : "Revisar versión vigente"}</button>}
      <footer className="clients-wizard__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending || submitGuard}>{pending ? "Guardando…" : "Guardar sucursal"}</button></footer>
    </form>
  </ClientDialogFrame>;
}
