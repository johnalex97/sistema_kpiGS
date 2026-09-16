import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Search, X } from "lucide-react";
import type { OrderLookupApi } from "../../api/order-lookups";
import type { ApiFieldError } from "../../api/http";
import type {
  CreateOrderInput,
  OrderBranchOption,
  OrderCatalog,
  OrderClientOption,
  OrderDetail,
  OrderPriority,
  UpdateOrderInput,
} from "../../models/order";

export type OrderFormValue = CreateOrderInput | Omit<UpdateOrderInput, "version">;

interface OrderFormProps {
  mode: "create" | "edit";
  order?: OrderDetail;
  catalog: OrderCatalog;
  lookupApi: OrderLookupApi;
  pending: boolean;
  error: string | null;
  fieldErrors: ApiFieldError[];
  onCancel(): void;
  onSubmit(value: OrderFormValue): Promise<boolean>;
}

const priorities: Array<[OrderPriority, string]> = [
  ["LOW", "Baja"], ["MEDIUM", "Media"], ["HIGH", "Alta"], ["CRITICAL", "Crítica"],
];

function toHondurasLocal(value: string | null | undefined): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function fromHondurasLocal(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}:00-06:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function fieldMessage(errors: ApiFieldError[], field: string): string | null {
  return errors.find((item) => item.field === field)?.message ?? null;
}

export function OrderForm(props: OrderFormProps) {
  const { lookupApi, onCancel } = props;
  const initial = props.mode === "edit" ? props.order : undefined;
  const parentsLocked = initial?.status === "ASSIGNED";
  const [client, setClient] = useState<OrderClientOption | null>(initial ? initial.client : null);
  const [clientSearch, setClientSearch] = useState(initial?.client.tradeName ?? "");
  const [clients, setClients] = useState<OrderClientOption[]>([]);
  const [branches, setBranches] = useState<OrderBranchOption[]>(initial ? [{ ...initial.branch, address: "", isEffectivelyActive: true }] : []);
  const [branchId, setBranchId] = useState(initial?.branch.id ?? "");
  const [serviceTypeId, setServiceTypeId] = useState(initial?.serviceType.id ?? "");
  const [priority, setPriority] = useState<OrderPriority>(initial?.priority ?? "MEDIUM");
  const [reportedProblem, setReportedProblem] = useState(initial?.reportedProblem ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [scheduledFor, setScheduledFor] = useState(toHondurasLocal(initial?.scheduledFor));
  const [estimatedMinutes, setEstimatedMinutes] = useState(initial?.estimatedMinutes?.toString() ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef(props.pending);
  const errorId = useId();

  useEffect(() => { pendingRef.current = props.pending; }, [props.pending]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    formRef.current?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !pendingRef.current) onCancel(); };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); previous?.focus(); };
  }, [onCancel]);

  useEffect(() => {
    if (parentsLocked || clientSearch.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void lookupApi.clients(clientSearch, 1, controller.signal)
        .then((page) => { if (!controller.signal.aborted) setClients(page.items); })
        .catch(() => { if (!controller.signal.aborted) setClients([]); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [clientSearch, lookupApi, parentsLocked]);

  useEffect(() => {
    if (!initial?.client.id || parentsLocked) return;
    const controller = new AbortController();
    void lookupApi.branches(initial.client.id, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setBranches(items); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [initial?.client.id, lookupApi, parentsLocked]);

  const chooseClient = async (next: OrderClientOption) => {
    setClient(next);
    setClientSearch(next.tradeName);
    setClients([]);
    setBranchId("");
    setBranches([]);
    const controller = new AbortController();
    try { setBranches(await lookupApi.branches(next.id, controller.signal)); } catch { setBranches([]); }
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const controls = Array.from(formRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = estimatedMinutes === "" ? null : Number(estimatedMinutes);
    let issue: string | null = null;
    if (!client) issue = "Selecciona un cliente.";
    else if (!branchId) issue = "Selecciona una sucursal.";
    else if (!serviceTypeId) issue = "Selecciona un tipo de servicio.";
    else if (reportedProblem.trim().length < 3) issue = "El problema reportado debe tener al menos 3 caracteres.";
    else if (reportedProblem.trim().length > 10_000) issue = "El problema reportado no puede exceder 10000 caracteres.";
    else if (description.trim().length > 10_000) issue = "La descripción no puede exceder 10000 caracteres.";
    else if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 10_080)) issue = "La estimación debe estar entre 1 y 10080 minutos.";
    if (issue) { setValidationError(issue); return; }
    setValidationError(null);
    const editable = {
      priority,
      reportedProblem: reportedProblem.trim(),
      description: description.trim() || null,
      scheduledFor: fromHondurasLocal(scheduledFor),
      estimatedMinutes: minutes,
    };
    await props.onSubmit(props.mode === "create" || initial?.status === "PENDING"
      ? { ...editable, branchId, serviceTypeId }
      : editable);
  };

  const serverProblem = fieldMessage(props.fieldErrors, "reportedProblem");
  const displayedError = validationError ?? props.error;
  return <div className="order-form-backdrop">
    <form className="order-form" role="dialog" aria-modal="true" aria-labelledby="order-form-title" noValidate ref={formRef} onSubmit={submit} onKeyDown={trapFocus}>
      <header><div><span>CONTROL DE DESPACHO</span><h2 id="order-form-title">{props.mode === "create" ? "Nueva orden" : `Editar ${initial?.orderNumber}`}</h2><p>{props.mode === "create" ? "Define el trabajo antes de asignarlo." : "Actualiza únicamente los campos permitidos por el estado actual."}</p></div><button type="button" aria-label="Cerrar formulario" disabled={props.pending} onClick={props.onCancel}><X size={18} /></button></header>
      <fieldset disabled={props.pending}>
        <legend className="sr-only">Datos de la orden</legend>
        <div className="order-form__grid">
          <label className="order-form__client"><span>Cliente</span><div className="order-form__search"><Search size={15} /><input type="search" aria-label="Cliente" value={clientSearch} disabled={parentsLocked} autoComplete="off" onChange={(event) => { const value = event.target.value; setClientSearch(value); if (value !== client?.tradeName) setClient(null); if (value.trim().length < 2) setClients([]); }} /></div>{clients.length > 0 && <div className="order-form__results" role="listbox" aria-label="Resultados de clientes">{clients.map((item) => <button key={item.id} type="button" role="option" aria-selected={client?.id === item.id} onClick={() => void chooseClient(item)}><b>{item.tradeName}</b><small>{item.code}</small></button>)}</div>}</label>
          <label><span>Sucursal</span><select aria-label="Sucursal" value={branchId} disabled={parentsLocked || !client} onChange={(event) => setBranchId(event.target.value)}><option value="">Seleccionar</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Tipo de servicio</span><select aria-label="Tipo de servicio" value={serviceTypeId} disabled={parentsLocked} onChange={(event) => setServiceTypeId(event.target.value)}><option value="">Seleccionar</option>{props.catalog.serviceTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Prioridad</span><select aria-label="Prioridad" value={priority} onChange={(event) => setPriority(event.target.value as OrderPriority)}>{priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="order-form__wide"><span>Problema reportado</span><textarea aria-label="Problema reportado" rows={3} maxLength={10_000} value={reportedProblem} aria-invalid={Boolean(serverProblem) || undefined} aria-describedby={serverProblem ? errorId : undefined} onChange={(event) => setReportedProblem(event.target.value)} /></label>
          <label className="order-form__wide"><span>Descripción</span><textarea aria-label="Descripción" rows={3} maxLength={10_000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label><span>Agenda</span><input aria-label="Agenda" type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <label><span>Estimación en minutos</span><input aria-label="Estimación en minutos" type="number" min={1} max={10_080} value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
        </div>
        {displayedError && <p id={errorId} className="order-form__error" role="alert"><AlertTriangle size={15} />{displayedError}</p>}
      </fieldset>
      <footer><button type="button" className="button button--ghost" disabled={props.pending} onClick={props.onCancel}>Cancelar</button><button type="submit" className="button button--primary" disabled={props.pending}>{props.pending ? "Guardando…" : props.mode === "create" ? "Crear orden" : "Guardar cambios"}</button></footer>
    </form>
  </div>;
}
