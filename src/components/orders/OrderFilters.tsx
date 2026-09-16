import { RotateCcw } from "lucide-react";
import type { OrderFilters as Filters, OrderPriority, OrderStatus } from "../../models/order";

const statusOptions: Array<[OrderStatus, string]> = [
  ["PENDING", "Pendiente"], ["ASSIGNED", "Asignada"], ["ON_ROUTE", "En camino"],
  ["IN_PROGRESS", "En progreso"], ["PAUSED", "Pausada"],
  ["COMPLETED", "Finalizada"], ["CANCELLED", "Cancelada"],
];
const priorityOptions: Array<[OrderPriority, string]> = [
  ["LOW", "Baja"], ["MEDIUM", "Media"], ["HIGH", "Alta"], ["CRITICAL", "Crítica"],
];

export function OrderFilters({ filters, onChange }: {
  filters: Filters;
  onChange(patch: Partial<Filters>): void;
}) {
  const status = filters.statuses?.length === 1 ? filters.statuses[0] : "";
  const priority = filters.priorities?.length === 1 ? filters.priorities[0] : "";
  return <div className="order-filters" aria-label="Filtros de órdenes">
    <label><span>Estado</span><select aria-label="Estado" value={status} onChange={(event) => onChange({ statuses: event.target.value ? [event.target.value as OrderStatus] : undefined })}><option value="">Todos</option>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label><span>Prioridad</span><select aria-label="Prioridad" value={priority} onChange={(event) => onChange({ priorities: event.target.value ? [event.target.value as OrderPriority] : undefined })}><option value="">Todas</option>{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label><span>Agenda</span><select aria-label="Agenda" value={filters.overdue === undefined ? "" : String(filters.overdue)} onChange={(event) => onChange({ overdue: event.target.value === "" ? undefined : event.target.value === "true" })}><option value="">Toda</option><option value="true">Atrasadas</option><option value="false">En tiempo</option></select></label>
    <button type="button" className="order-filters__clear" onClick={() => onChange({ statuses: undefined, priorities: undefined, overdue: undefined, clientId: undefined, branchId: undefined, technicianId: undefined, serviceTypeId: undefined, scheduledFrom: undefined, scheduledTo: undefined })}><RotateCcw size={14} />Limpiar</button>
  </div>;
}
