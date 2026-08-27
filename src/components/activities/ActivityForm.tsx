import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import type { ActivityLookupApi } from "../../api/activity-lookups";
import type {
  ActivityDetail,
  ActivityEditValue,
  ActivityFormActor,
  ActivityFormValue,
  ActivityTeamInput,
  ActivityType,
  BranchOption,
  ClientOption,
  LookupPage,
  OrderOption,
  TechnicianOption,
} from "../../models/activity";
import { ActivityTeamEditor } from "./ActivityTeamEditor";
import { activityTeamErrors } from "./activity-team.validation";

interface LookupComboboxProps<T> {
  label: string;
  placeholder: string;
  fetchPage(search: string, page: number, signal: AbortSignal): Promise<LookupPage<T>>;
  getKey(option: T): string;
  getLabel(option: T): string;
  onSelect(option: T): void;
  onClear?(): void;
}

function LookupCombobox<T,>({ label, placeholder, fetchPage, getKey, getLabel, onSelect, onClear }: LookupComboboxProps<T>) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedRef = useRef(false);
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPageRef.current(query, page, controller.signal).then((result) => {
      setItems((current) => page === 1 ? result.items : [...current, ...result.items]);
      setTotalPages(result.pagination.totalPages);
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === "AbortError")) setItems([]);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, query]);

  return <div className="lookup-combobox">
    <label htmlFor={id}>{label}</label>
    <div className="lookup-combobox__input"><Search size={14} aria-hidden="true" /><input id={id} name={`${id}-search`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} autoComplete="off" placeholder={placeholder} value={query} onFocus={() => setOpen(true)} onChange={(event) => { if (selectedRef.current) { selectedRef.current = false; onClear?.(); } setLoading(true); setQuery(event.target.value); setPage(1); setOpen(true); }} />{loading ? <LoaderCircle className="lookup-combobox__loader" size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}</div>
    {open && <div className="lookup-combobox__list" id={`${id}-list`} role="listbox" aria-label={`Opciones de ${label}`}>
      {items.length === 0 && !loading ? <p>No hay coincidencias</p> : items.map((option) => <button type="button" role="option" aria-selected="false" key={getKey(option)} onClick={() => { const nextLabel = getLabel(option); selectedRef.current = true; setQuery(nextLabel); setOpen(false); onSelect(option); }}>{getLabel(option)}</button>)}
      {page < totalPages && <button className="lookup-combobox__more" type="button" onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Cargar más</button>}
    </div>}
  </div>;
}

interface ActivityFormBaseProps {
  mode?: "scheduled" | "manual";
  activityTypes: ActivityType[];
  lookupApi: ActivityLookupApi;
  actor: ActivityFormActor;
  now?: () => Date;
  onCancel(): void;
}

interface CreateActivityFormProps extends ActivityFormBaseProps {
  variant?: "create";
  initialActivity?: never;
  onSubmit(value: ActivityFormValue): Promise<void>;
}

interface EditActivityFormProps extends ActivityFormBaseProps {
  variant: "edit";
  initialActivity: ActivityDetail;
  onSubmit(value: ActivityEditValue): Promise<void>;
}

export type ActivityFormProps = CreateActivityFormProps | EditActivityFormProps;

function localDateTimeWithTegucigalpaOffset(value: string): string {
  return `${value.length === 16 ? `${value}:00.000` : value}-06:00`;
}

export function ActivityForm(props: ActivityFormProps) {
  const { activityTypes, lookupApi, actor, now = () => new Date(), onCancel } = props;
  const isEdit = props.variant === "edit";
  const initialActivity = isEdit ? props.initialActivity : undefined;
  const initialMode = props.mode ?? "scheduled";
  const [mode, setMode] = useState<"scheduled" | "manual">(initialMode);
  const [source, setSource] = useState<"order" | "branch">("order");
  const [orderId, setOrderId] = useState<string>();
  const [client, setClient] = useState<ClientOption>();
  const [branchId, setBranchId] = useState<string>();
  const [activityTypeId, setActivityTypeId] = useState(initialActivity?.activityType.id ?? "");
  const [description, setDescription] = useState(initialActivity?.description ?? "");
  const [observations, setObservations] = useState(initialActivity?.observations ?? "");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [result, setResult] = useState("");
  const [justification, setJustification] = useState("");
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [team, setTeam] = useState<ActivityTeamInput[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (formRef.current?.querySelector<HTMLElement>('.activity-form__body input:not([disabled]), .activity-form__body select:not([disabled]), .activity-form__body textarea:not([disabled])')
      ?? formRef.current?.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) cancelRef.current();
    };
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
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  useEffect(() => {
    if (!actor.canManage || isEdit) return;
    const controller = new AbortController();
    lookupApi.technicians("", 1, controller.signal).then((page) => {
      setTechnicians(page.items);
      setTeam((current) => current.length > 0 || page.items.length === 0 ? current : [{ technicianId: page.items[0].id, role: "RESPONSIBLE", participationPercentage: "100.00" }]);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [actor.canManage, isEdit, lookupApi]);

  const setOrigin = (nextSource: "order" | "branch") => {
    setSource(nextSource);
    if (nextSource === "order") { setBranchId(undefined); setClient(undefined); }
    else setOrderId(undefined);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!activityTypeId || !description.trim()) { setFormError("Selecciona el tipo y escribe la descripción."); return; }
    if (isEdit) {
      const value: ActivityEditValue = { activityTypeId, description: description.trim(), observations: observations.trim() || null };
      setPending(true);
      try { await props.onSubmit(value); } finally { setPending(false); }
      return;
    }
    if (source === "order" ? !orderId : !branchId) { setFormError(source === "order" ? "Selecciona una orden." : "Selecciona una sucursal."); return; }
    if (actor.canManage) {
      const teamErrors = activityTeamErrors(team);
      if (teamErrors.length > 0) { setFormError(teamErrors[0]); return; }
    }
    const common = {
      orderId: source === "order" ? orderId : undefined,
      branchId: source === "branch" ? branchId : undefined,
      activityTypeId,
      description: description.trim(),
      ...(observations.trim() ? { observations: observations.trim() } : {}),
      ...(actor.canManage ? { team } : {}),
    };
    let value: ActivityFormValue;
    if (mode === "manual") {
      if (!startedAt || !endedAt || !result.trim() || !justification.trim()) { setFormError("Completa fechas, resultado y justificación."); return; }
      const started = localDateTimeWithTegucigalpaOffset(startedAt);
      const ended = localDateTimeWithTegucigalpaOffset(endedAt);
      const duration = Date.parse(ended) - Date.parse(started);
      if (duration < 60_000) { setFormError("La actividad debe durar al menos un minuto."); return; }
      if (duration > 86_400_000) { setFormError("La actividad no puede superar 24 horas."); return; }
      if (Date.parse(started) > now().getTime() || Date.parse(ended) > now().getTime()) { setFormError("Las fechas no pueden estar en el futuro."); return; }
      value = { mode: "manual", ...common, startedAt: started, endedAt: ended, result: result.trim(), justification: justification.trim() };
    } else value = { mode: "scheduled", ...common };
    setPending(true);
    try { await props.onSubmit(value); } finally { setPending(false); }
  };

  const orderLabel = (option: OrderOption) => `${option.orderNumber} · ${option.clientName} · ${option.branchName}`;
  const clientLabel = (option: ClientOption) => `${option.code} · ${option.tradeName}`;
  const branchLabel = (option: BranchOption) => `${option.code} · ${option.name} · ${option.address}`;

  return <form className="activity-form" role="dialog" aria-modal="true" aria-labelledby="activity-form-title" ref={formRef} noValidate onSubmit={submit} onKeyDown={trapFocus}>
    <header className="activity-form__head"><div><p className="eyebrow">Registro operativo</p><h2 id="activity-form-title">{isEdit ? "Editar actividad" : "Nueva actividad"}</h2><span>{isEdit ? "Actualiza los datos descriptivos sin alterar el origen del trabajo." : "Documenta el trabajo en el momento o carga una visita ya finalizada."}</span></div><button className="icon-button" type="button" aria-label="Cerrar formulario" onClick={onCancel}><X size={18} /></button></header>
    <div className="activity-form__body">
      {!isEdit && <><fieldset className="activity-form__switch"><legend>Modo de registro</legend><label><input type="radio" name="activityMode" checked={mode === "scheduled"} onChange={() => setMode("scheduled")} />Programada</label><label><input type="radio" name="activityMode" checked={mode === "manual"} onChange={() => setMode("manual")} />Manual</label></fieldset>
      <fieldset className="activity-form__switch"><legend>Origen del trabajo</legend><label><input type="radio" name="activitySource" checked={source === "order"} onChange={() => setOrigin("order")} />Orden existente</label><label><input type="radio" name="activitySource" checked={source === "branch"} onChange={() => setOrigin("branch")} />Sucursal</label></fieldset></>}
      <div className="activity-form__grid">
        {!isEdit && (source === "order" ? <LookupCombobox<OrderOption> label="Orden" placeholder="Buscar número, cliente…" fetchPage={(search, page, signal) => lookupApi.orders(search, page, signal)} getKey={(option) => option.id} getLabel={orderLabel} onSelect={(option) => { setOrderId(option.id); setBranchId(undefined); }} onClear={() => setOrderId(undefined)} /> : <>
          <LookupCombobox<ClientOption> label="Cliente" placeholder="Buscar cliente…" fetchPage={(search, page, signal) => lookupApi.clients(search, page, signal)} getKey={(option) => option.id} getLabel={clientLabel} onSelect={(option) => { setClient(option); setBranchId(undefined); }} onClear={() => { setClient(undefined); setBranchId(undefined); }} />
          {client && <LookupCombobox<BranchOption> key={client.id} label="Sucursal del cliente" placeholder="Buscar sucursal…" fetchPage={(search, page, signal) => lookupApi.branches(client.id, search, page, signal)} getKey={(option) => option.id} getLabel={branchLabel} onSelect={(option) => { setBranchId(option.id); setOrderId(undefined); }} onClear={() => setBranchId(undefined)} />}
        </>)}
        <Field label="Tipo de actividad"><select name="activityTypeId" aria-label="Tipo de actividad" value={activityTypeId} onChange={(event) => setActivityTypeId(event.target.value)}><option value="">Seleccionar</option>{activityTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></Field>
        <Field label="Descripción" wide><textarea name="description" aria-label="Descripción" autoComplete="off" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe el trabajo que se realizará…" /></Field>
        <Field label="Observaciones" wide><textarea name="observations" autoComplete="off" aria-label="Observaciones" rows={3} value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Contexto adicional (opcional)…" /></Field>
        {!isEdit && mode === "manual" && <><Field label="Inicio"><input name="startedAt" autoComplete="off" aria-label="Inicio" type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></Field><Field label="Fin"><input name="endedAt" autoComplete="off" aria-label="Fin" type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} /></Field><Field label="Resultado" wide><textarea name="result" autoComplete="off" aria-label="Resultado" rows={3} value={result} onChange={(event) => setResult(event.target.value)} /></Field><Field label="Justificación" wide><textarea name="justification" autoComplete="off" aria-label="Justificación" rows={3} value={justification} onChange={(event) => setJustification(event.target.value)} /></Field></>}
      </div>
      {!isEdit && actor.canManage && <ActivityTeamEditor members={team} technicians={technicians} onChange={setTeam} showConfirm={false} />}
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div>
    <footer className="activity-form__actions"><button className="button button--ghost" type="button" onClick={onCancel}>Cancelar</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Guardando…" : isEdit ? "Guardar cambios" : mode === "manual" ? "Registrar actividad manual" : "Crear actividad"}</button></footer>
  </form>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`activity-form__field${wide ? " activity-form__field--wide" : ""}`}><span>{label}</span>{children}</label>;
}
