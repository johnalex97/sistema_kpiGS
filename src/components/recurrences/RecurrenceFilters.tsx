import { AlertTriangle, RotateCcw } from "lucide-react";
import type { LoadState } from "../../hooks/useRecurrencesWorkspace";
import type {
  RecurrenceCatalog,
  RecurrenceImpact,
  RecurrenceListFilters,
  RecurrenceResponsibility,
  RecurrenceStatus,
} from "../../models/recurrence";

const statusLabel: Record<RecurrenceStatus, string> = {
  OPEN: "Abierto", ANALYSIS: "En análisis", CORRECTION: "En corrección", CLOSED: "Cerrado", DISMISSED: "Descartado",
};
const impactLabel: Record<RecurrenceImpact, string> = { LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto" };
const responsibilityLabel: Record<RecurrenceResponsibility, string> = {
  TECHNICAL_WORK: "Trabajo técnico", EQUIPMENT: "Equipo", CLIENT: "Cliente", THIRD_PARTY: "Tercero", UNDETERMINED: "Sin determinar",
};

function startOfHondurasDay(value: string): string | undefined {
  return value ? `${value}T00:00:00-06:00` : undefined;
}

function endOfHondurasDay(value: string): string | undefined {
  return value ? `${value}T23:59:59.999-06:00` : undefined;
}

export interface RecurrenceFiltersProps {
  filters: RecurrenceListFilters;
  catalog: RecurrenceCatalog | null;
  catalogState: LoadState;
  canViewAll: boolean;
  onChange(patch: Partial<RecurrenceListFilters>): void;
  onRetryCatalog(): void;
}

export function RecurrenceFilters({ filters, catalog, catalogState, canViewAll, onChange, onRetryCatalog }: RecurrenceFiltersProps) {
  const disabled = !catalog;
  const change = (patch: Partial<RecurrenceListFilters>) => onChange({ ...patch, page: 1 });

  return <div className="recurrence-filters-region">
    <div className="recurrence-filters" aria-label="Filtros de reincidencias">
      <label><span>Estado</span><select value={filters.status?.[0] ?? ""} disabled={disabled} onChange={(event) => change({ status: event.target.value ? [event.target.value as RecurrenceStatus] : undefined })}><option value="">Todos</option>{catalog?.states.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
      <label><span>Impacto</span><select value={filters.impact?.[0] ?? ""} disabled={disabled} onChange={(event) => change({ impact: event.target.value ? [event.target.value as RecurrenceImpact] : undefined })}><option value="">Todos</option>{catalog?.impacts.map((impact) => <option key={impact} value={impact}>{impactLabel[impact]}</option>)}</select></label>
      <label><span>Responsabilidad</span><select value={filters.responsibility?.[0] ?? ""} disabled={disabled} onChange={(event) => change({ responsibility: event.target.value ? [event.target.value as RecurrenceResponsibility] : undefined })}><option value="">Todas</option>{catalog?.responsibilities.map((responsibility) => <option key={responsibility} value={responsibility}>{responsibilityLabel[responsibility]}</option>)}</select></label>
      <label><span>Desde</span><input type="date" value={filters.detectedFrom?.slice(0, 10) ?? ""} onChange={(event) => change({ detectedFrom: startOfHondurasDay(event.target.value) })} /></label>
      <label><span>Hasta</span><input type="date" value={filters.detectedTo?.slice(0, 10) ?? ""} onChange={(event) => change({ detectedTo: endOfHondurasDay(event.target.value) })} /></label>
      {canViewAll && <div className="recurrence-filters__scope" aria-label="Filtros globales">
        <label><span>Orden original</span><input value={filters.originalOrderId ?? ""} onChange={(event) => change({ originalOrderId: event.target.value || undefined })} placeholder="ID de orden" /></label>
        <label><span>Técnico</span><input value={filters.technicianId ?? ""} onChange={(event) => change({ technicianId: event.target.value || undefined })} placeholder="ID de técnico" /></label>
        <label><span>Cliente</span><input value={filters.clientId ?? ""} onChange={(event) => change({ clientId: event.target.value || undefined })} placeholder="ID de cliente" /></label>
        <label><span>Sucursal</span><input value={filters.branchId ?? ""} onChange={(event) => change({ branchId: event.target.value || undefined })} placeholder="ID de sucursal" /></label>
      </div>}
      <button className="recurrence-filters__clear" type="button" onClick={() => onChange({ status: undefined, impact: undefined, responsibility: undefined, originalOrderId: undefined, technicianId: undefined, clientId: undefined, branchId: undefined, page: 1 })}><RotateCcw size={14} aria-hidden="true" />Limpiar filtros</button>
    </div>
    {catalogState === "loading" && !catalog && <p className="recurrence-filters__state" role="status">Cargando filtros…</p>}
    {catalogState === "error" && !catalog && <div className="recurrence-filters__state recurrence-filters__state--error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>No fue posible cargar los filtros.</span><button type="button" onClick={onRetryCatalog}>Reintentar filtros</button></div>}
  </div>;
}
