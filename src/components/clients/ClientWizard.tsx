import { useEffect, useRef, useState } from "react";
import type { ApiFieldError } from "../../api/http";
import type { CreateClientInput, InitialContactScope } from "../../models/client";

interface ClientWizardProps {
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  onSubmit(input: CreateClientInput): Promise<void>;
  onClose(): void;
}

interface Draft {
  tradeName: string; legalName: string; taxId: string; phone: string; email: string; notes: string;
  branchName: string; address: string; city: string; region: string; lat: string; long: string; locationReference: string;
  withContact: boolean; fullName: string; scope: InitialContactScope | ""; position: string; contactPhone: string; contactEmail: string;
}

const initialDraft: Draft = {
  tradeName: "", legalName: "", taxId: "", phone: "", email: "", notes: "",
  branchName: "", address: "", city: "", region: "", lat: "", long: "", locationReference: "",
  withContact: false, fullName: "", scope: "", position: "", contactPhone: "", contactEmail: "",
};
type Field = keyof Draft;
type Errors = Partial<Record<Field, string>>;
const optional = (value: string) => value.trim() || null;
const emailValid = (value: string) => !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function validate(draft: Draft, step: number): Errors {
  const errors: Errors = {};
  const required = (field: Field, label: string, maximum: number) => {
    if (!String(draft[field]).trim()) errors[field] = `${label} es obligatorio.`;
    else if (String(draft[field]).trim().length > maximum) errors[field] = `${label} admite hasta ${maximum} caracteres.`;
  };
  const length = (field: Field, label: string, maximum: number) => {
    if (String(draft[field]).trim().length > maximum) errors[field] = `${label} admite hasta ${maximum} caracteres.`;
  };
  const email = (field: Field, label: string) => {
    length(field, label, 254);
    if (!errors[field] && !emailValid(String(draft[field]))) errors[field] = `${label} no tiene un formato válido.`;
  };
  if (step === 0) {
    required("tradeName", "Nombre comercial", 180);
    length("legalName", "Razón social", 200); length("taxId", "RTN", 50); length("phone", "Teléfono", 30);
    email("email", "Correo institucional"); length("notes", "Notas", 10000);
  }
  if (step === 1) {
    required("branchName", "Nombre de la sucursal", 160); required("address", "Dirección", 300);
    length("city", "Ciudad", 100); length("region", "Región", 100); length("locationReference", "Referencia", 300);
    const coordinate = (field: "lat" | "long", label: string, limit: number) => {
      const value = draft[field].trim();
      if (value && (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > limit)) {
        errors[field] = `${label} debe estar entre ${-limit} y ${limit}.`;
      }
    };
    coordinate("lat", "Latitud", 90); coordinate("long", "Longitud", 180);
    if (!errors.lat && !errors.long && Boolean(draft.lat.trim()) !== Boolean(draft.long.trim())) {
      errors[draft.lat.trim() ? "long" : "lat"] = "Latitud y longitud deben registrarse juntas.";
    }
  }
  if (step === 2 && draft.withContact) {
    required("fullName", "Nombre del contacto", 160);
    if (!draft.scope) errors.scope = "El ámbito es obligatorio.";
    length("position", "Cargo", 120); length("contactPhone", "Teléfono", 30); email("contactEmail", "Correo del contacto");
  }
  return errors;
}

const serverFields: Record<string, Field> = {
  tradeName: "tradeName", legalName: "legalName", taxId: "taxId", phone: "phone", email: "email", notes: "notes",
  "mainBranch.name": "branchName", "mainBranch.address": "address", "mainBranch.city": "city", "mainBranch.region": "region",
  "mainBranch.lat": "lat", "mainBranch.long": "long", "mainBranch.locationReference": "locationReference",
  "primaryContact.fullName": "fullName", "primaryContact.scope": "scope", "primaryContact.position": "position",
  "primaryContact.phone": "contactPhone", "primaryContact.email": "contactEmail",
};
const fieldStep = (field: string) => field.startsWith("mainBranch") ? 1 : field.startsWith("primaryContact") ? 2 : 0;

export function ClientWizard({ pending, error, fieldErrors, onSubmit, onClose }: ClientWizardProps) {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const submitGuard = useRef(false);
  const previousFieldErrors = useRef(fieldErrors);
  useEffect(() => {
    if (previousFieldErrors.current === fieldErrors || fieldErrors.length === 0) return;
    previousFieldErrors.current = fieldErrors;
    const mapped: Errors = {};
    for (const issue of fieldErrors) {
      const field = issue.field && serverFields[issue.field];
      if (field) mapped[field] = issue.message;
    }
    setErrors(mapped);
    const first = fieldErrors.find((issue) => issue.field && serverFields[issue.field]);
    if (first?.field) setStep(fieldStep(first.field));
  }, [fieldErrors]);
  useEffect(() => { if (!pending) submitGuard.current = false; }, [pending]);

  const set = (field: Field, value: string | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const next = () => {
    if (pending) return;
    const found = validate(draft, step);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep(step + 1);
  };
  const submit = () => {
    if (pending || submitGuard.current) return;
    for (let part = 0; part < 3; part += 1) {
      const found = validate(draft, part);
      if (Object.keys(found).length) { setStep(part); setErrors(found); return; }
    }
    submitGuard.current = true;
    void onSubmit({
      tradeName: draft.tradeName.trim(), legalName: optional(draft.legalName), taxId: optional(draft.taxId),
      phone: optional(draft.phone), email: optional(draft.email), notes: optional(draft.notes),
      mainBranch: { name: draft.branchName.trim(), address: draft.address.trim(), city: optional(draft.city),
        region: optional(draft.region), country: "HN", lat: optional(draft.lat), long: optional(draft.long),
        locationReference: optional(draft.locationReference) },
      primaryContact: draft.withContact ? { scope: draft.scope as InitialContactScope, fullName: draft.fullName.trim(),
        position: optional(draft.position), phone: optional(draft.contactPhone), email: optional(draft.contactEmail) } : undefined,
    }).finally(() => { submitGuard.current = false; });
  };
  const input = (field: Field, label: string, maximum: number, type = "text") => <label className="clients-wizard__field">{label}
    <input type={type} aria-label={label} maxLength={maximum + 1} value={String(draft[field])} onChange={(event) => set(field, event.target.value)} aria-invalid={Boolean(errors[field])} disabled={pending} />
    {errors[field] && <span role="alert" className="clients-wizard__error">{errors[field]}</span>}
  </label>;
  const titles = ["Empresa", "Sucursal principal", "Contacto principal"];
  return <div className="clients-wizard-backdrop"><section className="clients-wizard" role="dialog" aria-modal="true" aria-label="Nuevo cliente">
    <header className="clients-wizard__head"><p className="eyebrow">Creación de cliente</p><h2>{titles[step]}</h2><p>Los datos se guardarán juntos al crear el cliente.</p></header>
    <ol className="clients-wizard__steps" aria-label="Pasos de creación">{titles.map((title, index) => <li key={title} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{title}</li>)}</ol>
    <form className="clients-wizard__form" aria-label={`Paso ${step + 1}: ${titles[step]}`} onSubmit={(event) => { event.preventDefault(); if (step < 2) next(); else submit(); }} noValidate>
      {step === 0 && <div className="clients-wizard__grid">{input("tradeName", "Nombre comercial *", 180)}{input("legalName", "Razón social", 200)}{input("taxId", "RTN", 50)}{input("phone", "Teléfono", 30)}{input("email", "Correo institucional", 254, "email")}{input("notes", "Notas", 10000)}</div>}
      {step === 1 && <div className="clients-wizard__grid">{input("branchName", "Nombre de la sucursal *", 160)}{input("address", "Dirección *", 300)}{input("city", "Ciudad", 100)}{input("region", "Región", 100)}{input("lat", "Latitud", 30)}{input("long", "Longitud", 30)}{input("locationReference", "Referencia de ubicación", 300)}</div>}
      {step === 2 && <div className="clients-wizard__grid"><label className="clients-wizard__check"><input type="checkbox" checked={draft.withContact} disabled={pending} onChange={(event) => set("withContact", event.target.checked)} />Agregar contacto principal</label>
        {draft.withContact && <>{input("fullName", "Nombre del contacto *", 160)}<label className="clients-wizard__field">Ámbito *<select aria-label="Ámbito" value={draft.scope} disabled={pending} aria-invalid={Boolean(errors.scope)} onChange={(event) => set("scope", event.target.value)}><option value="">Selecciona un ámbito</option><option value="CLIENT">Cliente general</option><option value="MAIN_BRANCH">Sucursal principal</option></select>{errors.scope && <span role="alert" className="clients-wizard__error">{errors.scope}</span>}</label>{input("position", "Cargo", 120)}{input("contactPhone", "Teléfono del contacto", 30)}{input("contactEmail", "Correo del contacto", 254, "email")}</>}
      </div>}
      {error && <p className="clients-wizard__server-error" role="alert">{error}</p>}
      <footer className="clients-wizard__actions"><button type="button" className="button button--ghost" disabled={pending} onClick={onClose}>Cancelar</button>{step > 0 && <button type="button" className="button button--ghost" disabled={pending} onClick={() => { setErrors({}); setStep(step - 1); }}>Atrás</button>}<button type="submit" className="button button--primary" disabled={pending}>{step === 2 ? pending ? "Creando cliente…" : "Crear cliente" : "Siguiente"}</button></footer>
    </form>
  </section></div>;
}
