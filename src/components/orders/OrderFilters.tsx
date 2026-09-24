import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/http";
import type { OrderLookupApi } from "../../api/order-lookups";
import { fromTegucigalpaDateTimeInput, toTegucigalpaDateTimeInput } from "../../hooks/order-workspace.helpers";
import type { OrderBranchOption, OrderCatalog, OrderFilters as Filters, OrderPriority, OrderStatus } from "../../models/order";

const statusOptions: Array<[OrderStatus, string]> = [
  ["PENDING", "Pendiente"], ["ASSIGNED", "Asignada"], ["ON_ROUTE", "En camino"],
  ["IN_PROGRESS", "En progreso"], ["PAUSED", "Pausada"],
  ["COMPLETED", "Finalizada"], ["CANCELLED", "Cancelada"],
];
const priorityOptions: Array<[OrderPriority, string]> = [
  ["LOW", "Baja"], ["MEDIUM", "Media"], ["HIGH", "Alta"], ["CRITICAL", "Crítica"],
];

function LookupFilter({ kind, allowed, selectedId, api, onSelect, onLookupForbidden }: {
  kind: "client" | "technician"; allowed: boolean; selectedId?: string;
  api: OrderLookupApi; onSelect(id: string | undefined): void;
  onLookupForbidden?: (kind: "clients" | "technicians") => void;
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const enabled = allowed && !forbidden;
  const label = kind === "client" ? "cliente" : "técnico";
  const [previousQuery, setPreviousQuery] = useState({ search, enabled });
  if (previousQuery.search !== search || previousQuery.enabled !== enabled) {
    setPreviousQuery({ search, enabled }); setItems([]);
    if (!enabled) setSearch("");
  }
  useEffect(() => {
    if (!enabled || search.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const request = kind === "client"
        ? api.clients(search, 1, controller.signal).then((page) => page.items.map((item) => ({ id: item.id, name: item.tradeName })))
        : api.technicians(search, 1, controller.signal).then((page) => page.items.map((item) => ({ id: item.id, name: item.fullName })));
      void request.then((incoming) => {
        if (!controller.signal.aborted) { setItems(incoming); setError(null); }
      }).catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError("No fue posible consultar " + label + ".");
        if (failure instanceof ApiClientError && failure.status === 403) { setForbidden(true); onLookupForbidden?.(kind === "client" ? "clients" : "technicians"); }
      });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, enabled, kind, label, onLookupForbidden, search]);
  return <div className="order-filter-lookup">
    <label><span>{kind === "client" ? "Cliente" : "Técnico"}</span><input type="search" aria-label={"Filtrar " + label} disabled={!enabled} value={search} placeholder="Buscar por nombre" onChange={(event) => setSearch(event.target.value)} /></label>
    {selectedId && <div><small>Selección: {selectedId}</small><button type="button" aria-label={"Quitar filtro de " + label} onClick={() => onSelect(undefined)}>Quitar</button></div>}
    {enabled && items.length > 0 && <div role="listbox" aria-label={"Resultados de " + label}>{items.map((item) => <button type="button" role="option" aria-selected={selectedId === item.id} key={item.id} onClick={() => { onSelect(item.id); setSearch(""); }}>{item.name}</button>)}</div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function OrderFilters({ filters, onChange, onClearSelection, catalog, lookupApi, canLookupClients, canLookupTechnicians, onLookupForbidden }: {
  filters: Filters;
  onChange(patch: Partial<Filters>): void;
  onClearSelection(): void;
  catalog: OrderCatalog;
  lookupApi: OrderLookupApi;
  canLookupClients: boolean;
  canLookupTechnicians: boolean;
  onLookupForbidden?: (kind: "clients" | "technicians") => void;
}) {
  const [branches, setBranches] = useState<OrderBranchOption[]>([]);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchForbidden, setBranchForbidden] = useState(false);
  const [reset, setReset] = useState(0);
  const branchesAllowed = canLookupClients && !branchForbidden;
  const [previousClient, setPreviousClient] = useState({ id: filters.clientId, allowed: branchesAllowed });
  if (previousClient.id !== filters.clientId || previousClient.allowed !== branchesAllowed) {
    setPreviousClient({ id: filters.clientId, allowed: branchesAllowed }); setBranches([]);
  }
  useEffect(() => {
    if (!branchesAllowed || !filters.clientId) return;
    const controller = new AbortController();
    void lookupApi.branches(filters.clientId, controller.signal).then((items) => {
      if (!controller.signal.aborted) { setBranches(items); setBranchError(null); }
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setBranchError("No fue posible consultar sucursales.");
      if (failure instanceof ApiClientError && failure.status === 403) { setBranchForbidden(true); onLookupForbidden?.("clients"); }
    });
    return () => controller.abort();
  }, [branchesAllowed, filters.clientId, lookupApi, onLookupForbidden]);
  const clear = () => {
    setReset((value) => value + 1);
    onChange({ search: undefined, statuses: undefined, priorities: undefined, overdue: undefined, clientId: undefined, branchId: undefined, technicianId: undefined, serviceTypeId: undefined, scheduledFrom: undefined, scheduledTo: undefined, page: 1 });
    onClearSelection();
  };
  return <div className="order-filters" aria-label="Filtros de órdenes">
    <label><span>Estado · selección múltiple</span><select multiple aria-label="Estado" value={filters.statuses ?? []} onChange={(event) => onChange({ statuses: Array.from(event.target.selectedOptions, (option) => option.value as OrderStatus) })}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label><span>Prioridad · selección múltiple</span><select multiple aria-label="Prioridad" value={filters.priorities ?? []} onChange={(event) => onChange({ priorities: Array.from(event.target.selectedOptions, (option) => option.value as OrderPriority) })}>{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label><span>Agenda</span><select aria-label="Agenda" value={filters.overdue === undefined ? "" : String(filters.overdue)} onChange={(event) => onChange({ overdue: event.target.value === "" ? undefined : event.target.value === "true" })}><option value="">Toda</option><option value="true">Atrasadas</option><option value="false">En tiempo</option></select></label>
    <LookupFilter onLookupForbidden={onLookupForbidden} key={"client-" + reset} kind="client" api={lookupApi} allowed={canLookupClients} selectedId={filters.clientId} onSelect={(clientId) => onChange({ clientId, branchId: undefined })} />
    <label><span>Sucursal</span><select aria-label="Filtrar sucursal" disabled={!branchesAllowed || !filters.clientId} value={filters.branchId ?? ""} onChange={(event) => onChange({ branchId: event.target.value || undefined })}><option value="">Todas</option>{filters.branchId && !branches.some((item) => item.id === filters.branchId) && <option value={filters.branchId}>{filters.branchId}</option>}{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{branchError && <span role="alert">{branchError}</span>}</label>
    <LookupFilter onLookupForbidden={onLookupForbidden} key={"technician-" + reset} kind="technician" api={lookupApi} allowed={canLookupTechnicians} selectedId={filters.technicianId} onSelect={(technicianId) => onChange({ technicianId })} />
    <label><span>Servicio</span><select aria-label="Filtrar servicio" value={filters.serviceTypeId ?? ""} onChange={(event) => onChange({ serviceTypeId: event.target.value || undefined })}><option value="">Todos</option>{filters.serviceTypeId && !catalog.serviceTypes.some((item) => item.id === filters.serviceTypeId) && <option value={filters.serviceTypeId}>{filters.serviceTypeId}</option>}{catalog.serviceTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label><span>Agenda desde · Honduras</span><input type="datetime-local" aria-label="Agenda desde" value={toTegucigalpaDateTimeInput(filters.scheduledFrom ?? null)} onChange={(event) => onChange({ scheduledFrom: fromTegucigalpaDateTimeInput(event.target.value) ?? undefined })} /></label>
    <label><span>Agenda hasta · Honduras</span><input type="datetime-local" aria-label="Agenda hasta" value={toTegucigalpaDateTimeInput(filters.scheduledTo ?? null)} onChange={(event) => onChange({ scheduledTo: fromTegucigalpaDateTimeInput(event.target.value) ?? undefined })} /></label>
    <button type="button" className="order-filters__clear" onClick={clear}><RotateCcw size={14} />Limpiar</button>
  </div>;
}
