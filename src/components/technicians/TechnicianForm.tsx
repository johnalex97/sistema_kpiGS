import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link2, X } from "lucide-react";
import type { TechnicianApi } from "../../api/technicians";
import type { CreateTechnicianInput, EligibleTechnicianUser, Technician, UpdateTechnicianInput } from "../../models/technician";
import { EligibleUserCombobox } from "./EligibleUserCombobox";

interface TechnicianFormBaseProps {
  api: TechnicianApi;
  apiError?: string | null;
  now?: () => Date;
  onCancel(): void;
}

interface CreateTechnicianFormProps extends TechnicianFormBaseProps {
  variant?: "create";
  technician?: never;
  onSubmit(value: CreateTechnicianInput): Promise<boolean>;
}

interface EditTechnicianFormProps extends TechnicianFormBaseProps {
  variant: "edit";
  technician: Technician;
  onSubmit(value: Omit<UpdateTechnicianInput, "version">): Promise<boolean>;
}

export type TechnicianFormProps = CreateTechnicianFormProps | EditTechnicianFormProps;

const todayInTegucigalpa = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Tegucigalpa" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export function TechnicianForm(props: TechnicianFormProps) {
  const isEdit = props.variant === "edit";
  const initial = isEdit ? props.technician : null;
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [specialty, setSpecialty] = useState(initial?.specialty ?? "");
  const [workPhone, setWorkPhone] = useState(initial?.workPhone ?? "");
  const [workEmail, setWorkEmail] = useState(initial?.workEmail ?? "");
  const [hiredOn, setHiredOn] = useState(initial?.hiredOn ?? "");
  const [user, setUser] = useState<EligibleTechnicianUser | null>(initial?.user ?? null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef(props.onCancel);
  const pendingRef = useRef(false);
  const errorId = useId();
  const apiErrorField = props.apiError === "El correo laboral ya está registrado."
    ? "workEmail"
    : props.apiError === "El usuario seleccionado no es elegible como técnico."
      || props.apiError === "El usuario seleccionado ya está vinculado a otro técnico."
      ? "user"
      : null;

  useEffect(() => { cancelRef.current = props.onCancel; }, [props.onCancel]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (formRef.current?.querySelector<HTMLElement>('.technician-form__body input:not([disabled])')
      ?? formRef.current?.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !pendingRef.current) cancelRef.current(); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previouslyFocused?.focus(); };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = Array.from(formRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = fullName.trim();
    const normalizedSpecialty = specialty.trim();
    const normalizedPhone = workPhone.trim();
    const normalizedEmail = workEmail.trim().toLowerCase();
    let error: string | null = null;
    if (!normalizedName) error = "El nombre completo es obligatorio.";
    else if (normalizedName.length > 160) error = "El nombre completo no puede exceder 160 caracteres.";
    else if (normalizedSpecialty.length > 120) error = "La especialidad no puede exceder 120 caracteres.";
    else if (normalizedPhone.length > 30) error = "El teléfono laboral no puede exceder 30 caracteres.";
    else if (normalizedEmail.length > 254) error = "El correo laboral no puede exceder 254 caracteres.";
    else if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) error = "Escribe un correo laboral válido.";
    else if (hiredOn && hiredOn > todayInTegucigalpa((props.now ?? (() => new Date()))())) error = "La fecha de ingreso no puede estar en el futuro.";
    if (error) { setValidationError(error); return; }
    setValidationError(null);
    const value = {
      fullName: normalizedName,
      specialty: normalizedSpecialty || null,
      workPhone: normalizedPhone || null,
      workEmail: normalizedEmail || null,
      hiredOn: hiredOn || null,
      userId: user?.id ?? null,
    };
    pendingRef.current = true;
    setPending(true);
    try { await props.onSubmit(value); } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const title = isEdit ? "Editar técnico" : "Nuevo técnico";
  return <form className="activity-form technician-form" role="dialog" aria-modal="true" aria-labelledby="technician-form-title" noValidate ref={formRef} onSubmit={submit} onKeyDown={trapFocus}>
    <header className="activity-form__head technician-form__head"><div><p className="eyebrow">Maestro laboral</p><h2 id="technician-form-title">{title}</h2><span>{isEdit ? `Actualiza la ficha de ${initial?.fullName ?? "este técnico"} sin alterar su código ni estado.` : "Crea la identidad laboral que acompañará el trabajo diario del técnico."}</span></div><button className="icon-button" type="button" aria-label="Cerrar formulario" disabled={pending} onClick={props.onCancel}><X size={18} aria-hidden="true" /></button></header>
    <fieldset className="activity-form__body technician-form__body" disabled={pending}>
      <legend className="sr-only">Datos del técnico</legend>
      <div className="activity-form__grid">
        <Field label="Nombre completo"><input name="fullName" autoComplete="name" maxLength={160} value={fullName} onChange={(event) => setFullName(event.target.value)} /></Field>
        <Field label="Especialidad"><input name="specialty" autoComplete="organization-title" maxLength={120} value={specialty} onChange={(event) => setSpecialty(event.target.value)} /></Field>
        <Field label="Teléfono laboral"><input name="workPhone" type="tel" autoComplete="tel" maxLength={30} value={workPhone} onChange={(event) => setWorkPhone(event.target.value)} /></Field>
        <Field label="Correo laboral"><input name="workEmail" type="email" autoComplete="email" maxLength={254} value={workEmail} aria-invalid={apiErrorField === "workEmail" || undefined} aria-describedby={apiErrorField === "workEmail" ? errorId : undefined} onChange={(event) => setWorkEmail(event.target.value)} /></Field>
        <Field label="Fecha de ingreso"><input name="hiredOn" type="date" autoComplete="off" max={todayInTegucigalpa((props.now ?? (() => new Date()))())} value={hiredOn} onChange={(event) => setHiredOn(event.target.value)} /></Field>
      </div>
      <section className="technician-form__identity" aria-labelledby="technician-form-user-title"><h3 id="technician-form-user-title"><Link2 size={16} aria-hidden="true" />Acceso al sistema</h3><EligibleUserCombobox api={props.api} technicianId={initial?.id} value={user} disabled={pending} invalid={apiErrorField === "user"} describedBy={apiErrorField === "user" ? errorId : undefined} onChange={setUser} /></section>
      {(validationError || props.apiError) && <p id={errorId} className="form-error" role="alert">{validationError ?? props.apiError}</p>}
    </fieldset>
    <footer className="activity-form__actions technician-form__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={props.onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear técnico"}</button></footer>
  </form>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="activity-form__field"><span>{label}</span>{children}</label>;
}
