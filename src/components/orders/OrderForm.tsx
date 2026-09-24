import {
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useOrderDialogFocus } from "./useOrderDialogFocus";
import { AlertTriangle, Search, X } from "lucide-react";
import type { OrderLookupApi } from "../../api/order-lookups";
import { ApiClientError, type ApiFieldError } from "../../api/http";
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
  canLookupClients?: boolean;
  onLookupForbidden?: (kind: "clients" | "technicians") => void;
  conflict?: boolean;
  conflictOrder?: OrderDetail | null;
  onReviewConflict?: () => void;
  onReloadConflict?: () => Promise<void>;
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
  const { lookupApi, onCancel, canLookupClients = true, onLookupForbidden } = props;
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
  useOrderDialogFocus(formRef, true, props.pending, onCancel);
  const errorId = useId();
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [lastPermission, setLastPermission] = useState(canLookupClients);
  if (lastPermission !== canLookupClients) {
    setLastPermission(canLookupClients);
    if (!canLookupClients) { setClients([]); setBranches([]); setBranchId(""); setClient(null); }
  }
  useEffect(() => { if (!canLookupClients) onCancel(); }, [canLookupClients, onCancel]);

  useEffect(() => {
    if (!canLookupClients || parentsLocked || clientSearch.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void lookupApi.clients(clientSearch, 1, controller.signal)
        .then((page) => { if (!controller.signal.aborted) setClients(page.items); })
        .catch((error: unknown) => { if (!controller.signal.aborted) { setClients([]); setLookupError("No fue posible consultar clientes."); if (error instanceof ApiClientError && error.status === 403) { onLookupForbidden?.("clients"); onCancel(); } } });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canLookupClients, clientSearch, lookupApi, onCancel, onLookupForbidden, parentsLocked]);

  useEffect(() => {
    if (!canLookupClients || !client?.id || parentsLocked) return;
    const controller = new AbortController();
    void lookupApi.branches(client.id, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setBranches(items); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setBranches([]); setLookupError("No fue posible consultar sucursales."); if (error instanceof ApiClientError && error.status === 403) { onLookupForbidden?.("clients"); onCancel(); } } });
    return () => controller.abort();
  }, [canLookupClients, client?.id, lookupApi, onCancel, onLookupForbidden, parentsLocked]);

  const chooseClient = (next: OrderClientOption) => {
    if (next.id === client?.id) { setClients([]); return; }
    setClient(next);
    setClientSearch(next.tradeName);
    setClients([]);
    setBranchId("");
    setBranches([]);
    setLookupError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = estimatedMinutes === "" ? null : Number(estimatedMinutes);
    let issue: string | null = null;
    if (!canLookupClients || props.conflict) return;
    if (!client) issue = "Selecciona un cliente.";
    else if (!branchId || !branches.some((branch) => branch.id === branchId && branch.isEffectivelyActive)) issue = "Selecciona una sucursal del cliente vigente.";
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
  const displayedError = validationError ?? lookupError ?? props.error;
  return <div className="order-form-backdrop">
    <form className="order-form" role="dialog" aria-modal="true" aria-labelledby="order-form-title" noValidate ref={formRef} tabIndex={-1} onSubmit={submit}>
      <header><div><span>CONTROL DE DESPACHO</span><h2 id="order-form-title">{props.mode === "create" ? "Nueva orden" : `Editar ${initial?.orderNumber}`}</h2><p>{props.mode === "create" ? "Define el trabajo antes de asignarlo." : "Actualiza únicamente los campos permitidos por el estado actual."}</p></div><button type="button" aria-label="Cerrar formulario" disabled={props.pending} onClick={props.onCancel}><X size={18} /></button></header>
      {props.conflict && <section className="order-form__conflict" aria-label="Revisión de conflicto"><h3>Revisa los datos confirmados antes de volver a guardar</h3>{props.conflictOrder ? <><p>Versión {props.conflictOrder.version} · {props.conflictOrder.client.tradeName} · {props.conflictOrder.branch.name}</p><dl>{[["Servicio", props.conflictOrder.serviceType.name], ["Prioridad", props.conflictOrder.priority], ["Problema", props.conflictOrder.reportedProblem], ["Descripción actual", props.conflictOrder.description], ["Agenda actual", toHondurasLocal(props.conflictOrder.scheduledFor)], ["Minutos estimados", props.conflictOrder.estimatedMinutes?.toString()]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Sin registrar"}</dd></div>)}</dl><p>Tu borrador permanece abajo. Ajusta los campos que deban conservar los cambios ajenos.</p><button type="button" disabled={props.pending} onClick={props.onReviewConflict}>Revisé la versión actual</button></> : <><p>{props.pending ? "Recargando la versión actual…" : "No fue posible obtener la versión actual. Tu borrador sigue disponible."}</p><button type="button" disabled={props.pending} onClick={() => void props.onReloadConflict?.()}>Reintentar versión actual</button></>}</section>}
      <fieldset disabled={props.pending}>
        <legend className="sr-only">Datos de la orden</legend>
        <div className="order-form__grid">
          <label className="order-form__client"><span>Cliente</span><div className="order-form__search"><Search size={15} /><input type="search" aria-label="Cliente" value={clientSearch} disabled={parentsLocked || !canLookupClients} autoComplete="off" onChange={(event) => { const value = event.target.value; setClientSearch(value); if (value !== client?.tradeName) { setClient(null); setBranchId(""); setBranches([]); } if (value.trim().length < 2) setClients([]); }} /></div>{clients.length > 0 && <div className="order-form__results" role="listbox" aria-label="Resultados de clientes">{clients.map((item) => <button key={item.id} type="button" role="option" aria-selected={client?.id === item.id} onClick={() => chooseClient(item)}><b>{item.tradeName}</b><small>{item.code}</small></button>)}</div>}</label>
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
      <footer><button type="button" className="button button--ghost" disabled={props.pending} onClick={props.onCancel}>Cancelar</button><button type="submit" className="button button--primary" disabled={props.pending || props.conflict}>{props.pending ? "Guardando…" : props.mode === "create" ? "Crear orden" : "Guardar cambios"}</button></footer>
    </form>
  </div>;
}
