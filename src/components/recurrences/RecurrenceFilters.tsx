import { AlertTriangle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { currentRecurrenceMonth } from "../../hooks/recurrence-workspace.helpers";
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
  now?(): Date;
}

const systemNow = () => new Date();

export function RecurrenceFilters({ filters, catalog, catalogState, canViewAll, onChange, onRetryCatalog, now = systemNow }: RecurrenceFiltersProps) {
  const disabled = !catalog;
  const change = (patch: Partial<RecurrenceListFilters>) => onChange({ ...patch, page: 1 });
  const incomingScope = {
    originalOrderId: filters.originalOrderId ?? "",
    technicianId: filters.technicianId ?? "",
    clientId: filters.clientId ?? "",
    branchId: filters.branchId ?? "",
  };
  const scopeKey = JSON.stringify(incomingScope);
  const [draftState, setDraftState] = useState(() => ({ scopeKey, values: incomingScope }));
  const scopeDraft = draftState.scopeKey === scopeKey ? draftState.values : incomingScope;
  const updateScopeDraft = (field: keyof typeof scopeDraft, value: string) => {
    setDraftState({ scopeKey, values: { ...scopeDraft, [field]: value } });
  };

  const applyScope = () => change({
    originalOrderId: scopeDraft.originalOrderId.trim() || undefined,
    technicianId: scopeDraft.technicianId.trim() || undefined,
    clientId: scopeDraft.clientId.trim() || undefined,
    branchId: scopeDraft.branchId.trim() || undefined,
  });

  const clear = () => {
    const period = currentRecurrenceMonth(now());
    setDraftState({ scopeKey, values: { originalOrderId: "", technicianId: "", clientId: "", branchId: "" } });
    onChange({
      status: undefined,
      impact: undefined,
      responsibility: undefined,
      originalOrderId: undefined,
      technicianId: undefined,
      clientId: undefined,
      branchId: undefined,
      detectedFrom: period.detectedFrom,
      detectedTo: period.detectedTo,
      page: 1,
    });
  };

  return <div className="recurrence-filters-region">
    <div className="recurrence-filters" aria-label="Filtros de reincidencias">
      <label><span>Estado</span><select name="recurrenceStatus" autoComplete="off" value={filters.status?.[0] ?? ""} disabled={disabled} onChange={(event) => change({ status: event.target.value ? [event.target.value as RecurrenceStatus] : undefined })}><option value="">Todos</option>{catalog?.states.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
      <label><span>Impacto</span><select name="recurrenceImpact" autoComplete="off" value={filters.impact?.[0] ?? ""} disabled={disabled} onChange={(event) => change({ impact: event.target.value ? [event.target.value as RecurrenceImpact] : undefined })}><option value="">Todos</option>{catalog?.impacts.map((impact) => <option key={impact} value={impact}>{impactLabel[impact]}</option>)}</select></label>
      <label><span>Responsabilidad</span><select name="recurrenceResponsibility" autoComplete="off" value={filters.responsibility?.[0] ?? ""} disabled={disabled} onChange={(event) => change({ responsibility: event.target.value ? [event.target.value as RecurrenceResponsibility] : undefined })}><option value="">Todas</option>{catalog?.responsibilities.map((responsibility) => <option key={responsibility} value={responsibility}>{responsibilityLabel[responsibility]}</option>)}</select></label>
      <label><span>Desde</span><input name="recurrenceDetectedFrom" autoComplete="off" type="date" value={filters.detectedFrom?.slice(0, 10) ?? ""} onChange={(event) => change({ detectedFrom: startOfHondurasDay(event.target.value) })} /></label>
      <label><span>Hasta</span><input name="recurrenceDetectedTo" autoComplete="off" type="date" value={filters.detectedTo?.slice(0, 10) ?? ""} onChange={(event) => change({ detectedTo: endOfHondurasDay(event.target.value) })} /></label>
      {canViewAll && <div className="recurrence-filters__scope" aria-label="Filtros globales">
        <label><span>Orden original</span><input name="recurrenceOriginalOrder" autoComplete="off" spellCheck={false} value={scopeDraft.originalOrderId} onChange={(event) => updateScopeDraft("originalOrderId", event.target.value)} placeholder="Ej. ID de orden…" /></label>
        <label><span>Técnico</span><input name="recurrenceTechnician" autoComplete="off" spellCheck={false} value={scopeDraft.technicianId} onChange={(event) => updateScopeDraft("technicianId", event.target.value)} placeholder="Ej. ID de técnico…" /></label>
        <label><span>Cliente</span><input name="recurrenceClient" autoComplete="off" spellCheck={false} value={scopeDraft.clientId} onChange={(event) => updateScopeDraft("clientId", event.target.value)} placeholder="Ej. ID de cliente…" /></label>
        <label><span>Sucursal</span><input name="recurrenceBranch" autoComplete="off" spellCheck={false} value={scopeDraft.branchId} onChange={(event) => updateScopeDraft("branchId", event.target.value)} placeholder="Ej. ID de sucursal…" /></label>
        <button className="recurrence-filters__apply" type="button" onClick={applyScope}>Aplicar alcance</button>
      </div>}
      <button className="recurrence-filters__clear" type="button" onClick={clear}><RotateCcw size={14} aria-hidden="true" />Limpiar filtros</button>
    </div>
    {catalogState === "loading" && <p className="recurrence-filters__state" role="status" aria-live="polite">{catalog ? "Actualizando filtros…" : "Cargando filtros…"}</p>}
    {catalogState === "error" && !catalog && <div className="recurrence-filters__state recurrence-filters__state--error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>No fue posible cargar los filtros.</span><button type="button" onClick={onRetryCatalog}>Reintentar filtros</button></div>}
    {catalogState === "error" && catalog && <div className="recurrence-filters__state recurrence-filters__state--stale" role="status" aria-live="polite" aria-label="Catálogo desactualizado"><AlertTriangle size={15} aria-hidden="true" /><span>Los filtros disponibles pueden estar desactualizados.</span><button type="button" onClick={onRetryCatalog}>Reintentar filtros</button></div>}
  </div>;
}
