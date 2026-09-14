import { AlertTriangle, ChevronsUpDown, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
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
  lookupApi?: RecurrenceLookupApi;
  lookupCapabilities?: RecurrenceFilterLookupCapabilities;
  onChange(patch: Partial<RecurrenceListFilters>): void;
  onRetryCatalog(): void;
  now?(): Date;
}

export interface RecurrenceFilterLookupCapabilities {
  orders: boolean;
  technicians: boolean;
  clients: boolean;
  branches: boolean;
}

interface ScopeOption {
  id: string;
  label: string;
}

interface ScopePage {
  items: ScopeOption[];
  totalPages: number;
}

interface ScopeLookupProps {
  label: string;
  name: string;
  valueId: string;
  valueLabel?: string;
  placeholder: string;
  disabled: boolean;
  load(search: string, page: number, signal: AbortSignal): Promise<ScopePage>;
  onChange(option: ScopeOption | null): void;
}

function ScopeLookup({ label, name, valueId, valueLabel, placeholder, disabled, load, onChange }: ScopeLookupProps) {
  const id = useId();
  const listId = `${id}-list`;
  const normalizedValueLabel = valueLabel ?? "";
  const [inputState, setInputState] = useState(() => ({ valueId, valueLabel: normalizedValueLabel, query: normalizedValueLabel }));
  const query = inputState.valueId === valueId && inputState.valueLabel === normalizedValueLabel
    ? inputState.query
    : normalizedValueLabel;
  const [options, setOptions] = useState<ScopeOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeIndex, setActiveIndex] = useState(-1);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const loadRef = useRef(load);

  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const request = useCallback(async (search: string, requestedPage: number) => {
    if (disabled) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = ++generationRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const result = await loadRef.current(search, requestedPage, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setOptions((current) => requestedPage === 1
        ? result.items
        : [...new Map([...current, ...result.items].map((item) => [item.id, item])).values()]);
      setPage(requestedPage);
      setTotalPages(Math.max(1, result.totalPages));
      setActiveIndex(result.items.length ? 0 : -1);
      setOpen(true);
    } catch (error: unknown) {
      if (controller.signal.aborted || error instanceof Error && error.name === "AbortError") return;
      setFailed(true);
      setOpen(true);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (generation === generationRef.current) setLoading(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (disabled || !open || valueId && query === valueLabel) return;
    const timer = window.setTimeout(() => { void request(query.trim(), 1); }, 250);
    return () => window.clearTimeout(timer);
  }, [disabled, open, query, request, valueId, valueLabel]);

  const choose = (option: ScopeOption) => {
    setInputState({ valueId: option.id, valueLabel: option.label, query: option.label });
    setOpen(false);
    setOptions([]);
    onChange(option);
  };

  const clear = () => {
    controllerRef.current?.abort();
    generationRef.current += 1;
    setInputState({ valueId: "", valueLabel: "", query: "" });
    setOptions([]);
    setOpen(false);
    setFailed(false);
    onChange(null);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setOpen(true); void request(query.trim(), 1); return; }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => options.length ? (current + direction + options.length) % options.length : -1);
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return <div className="recurrence-scope-combobox">
    <label htmlFor={id}>{label}</label>
    <div className="recurrence-scope-combobox__control">
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        placeholder={disabled ? "No disponible para tu perfil" : placeholder}
        onFocus={() => { if (!open) { setOpen(true); void request(query.trim(), 1); } }}
        onChange={(event) => {
          if (valueId) onChange(null);
          setInputState({ valueId: "", valueLabel: "", query: event.target.value });
          setOpen(true);
          setFailed(false);
        }}
        onKeyDown={onKeyDown}
      />
      {valueId ? <button type="button" aria-label={`Quitar ${label.toLowerCase()}`} onClick={clear}><X size={14} aria-hidden="true" /></button> : <ChevronsUpDown size={14} aria-hidden="true" />}
    </div>
    {open && <div className="recurrence-scope-combobox__popover" id={listId} role="listbox" aria-label={`Opciones de ${label}`}>
      {loading && options.length === 0 && <p role="status">Buscando…</p>}
      {!loading && failed && <p role="alert">No fue posible cargar las opciones.</p>}
      {!loading && !failed && options.length === 0 && <p>Sin coincidencias.</p>}
      {options.map((option, index) => <div
        id={`${id}-option-${index}`}
        key={option.id}
        role="option"
        tabIndex={-1}
        aria-selected={option.id === valueId}
        data-active={index === activeIndex || undefined}
        onMouseDown={(event) => event.preventDefault()}
        onMouseMove={() => setActiveIndex(index)}
        onClick={() => choose(option)}
      >{option.label}</div>)}
      {!loading && !failed && page < totalPages && <button className="recurrence-scope-combobox__more" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void request(query.trim(), page + 1)}>Cargar más</button>}
    </div>}
  </div>;
}

const systemNow = () => new Date();

export function RecurrenceFilters({ filters, catalog, catalogState, canViewAll, lookupApi, lookupCapabilities, onChange, onRetryCatalog, now = systemNow }: RecurrenceFiltersProps) {
  const disabled = !catalog;
  const change = (patch: Partial<RecurrenceListFilters>) => onChange({ ...patch, page: 1 });
  const incomingScope = {
    originalOrder: filters.originalOrderId ? { id: filters.originalOrderId, label: "Orden filtrada" } : null,
    technician: filters.technicianId ? { id: filters.technicianId, label: "Técnico filtrado" } : null,
    client: filters.clientId ? { id: filters.clientId, label: "Cliente filtrado" } : null,
    branch: filters.branchId ? { id: filters.branchId, label: "Sucursal filtrada" } : null,
  };
  const scopeKey = JSON.stringify(Object.fromEntries(Object.entries(incomingScope).map(([key, value]) => [key, value?.id ?? ""])));
  const [draftState, setDraftState] = useState(() => ({ scopeKey, values: incomingScope }));
  const scopeDraft = draftState.scopeKey === scopeKey ? draftState.values : incomingScope;
  const updateScopeDraft = (field: keyof typeof scopeDraft, value: ScopeOption | null) => {
    setDraftState({ scopeKey, values: { ...scopeDraft, [field]: value } });
  };

  const applyScope = () => {
    const applied = {
      originalOrderId: scopeDraft.originalOrder?.id || undefined,
      technicianId: scopeDraft.technician?.id || undefined,
      clientId: scopeDraft.client?.id || undefined,
      branchId: scopeDraft.branch?.id || undefined,
    };
    setDraftState({
      scopeKey: JSON.stringify({
        originalOrder: applied.originalOrderId ?? "",
        technician: applied.technicianId ?? "",
        client: applied.clientId ?? "",
        branch: applied.branchId ?? "",
      }),
      values: scopeDraft,
    });
    change(applied);
  };

  const clear = () => {
    const period = currentRecurrenceMonth(now());
    setDraftState({ scopeKey, values: { originalOrder: null, technician: null, client: null, branch: null } });
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
        <ScopeLookup label="Orden original" name="recurrenceOriginalOrder" valueId={scopeDraft.originalOrder?.id ?? ""} valueLabel={scopeDraft.originalOrder?.label} placeholder="Busca por número de orden" disabled={!lookupApi || !lookupCapabilities?.orders} load={async (search, page, signal) => { const result = await lookupApi!.orders(search, ["COMPLETED"], page, signal); return { items: result.items.map((item) => ({ id: item.id, label: `${item.orderNumber} · ${item.clientName} · ${item.branchName}` })), totalPages: result.pagination.totalPages }; }} onChange={(option) => updateScopeDraft("originalOrder", option)} />
        <ScopeLookup label="Técnico" name="recurrenceTechnician" valueId={scopeDraft.technician?.id ?? ""} valueLabel={scopeDraft.technician?.label} placeholder="Busca por nombre o código" disabled={!lookupApi || !lookupCapabilities?.technicians} load={async (search, page, signal) => { const result = await lookupApi!.technicians(search, page, signal); return { items: result.items.map((item) => ({ id: item.id, label: `${item.fullName} · ${item.code}` })), totalPages: result.pagination.totalPages }; }} onChange={(option) => updateScopeDraft("technician", option)} />
        <ScopeLookup label="Cliente" name="recurrenceClient" valueId={scopeDraft.client?.id ?? ""} valueLabel={scopeDraft.client?.label} placeholder="Busca por nombre o código" disabled={!lookupApi || !lookupCapabilities?.clients} load={async (search, page, signal) => { const result = await lookupApi!.clients(search, page, signal); return { items: result.items.map((item) => ({ id: item.id, label: `${item.name} · ${item.code}` })), totalPages: result.pagination.totalPages }; }} onChange={(option) => setDraftState((current) => ({ ...current, values: { ...current.values, client: option, branch: null } }))} />
        <ScopeLookup key={scopeDraft.client?.id ?? "no-client"} label="Sucursal" name="recurrenceBranch" valueId={scopeDraft.branch?.id ?? ""} valueLabel={scopeDraft.branch?.label} placeholder={scopeDraft.client ? "Busca por nombre o código" : "Selecciona primero un cliente"} disabled={!lookupApi || !lookupCapabilities?.branches || !scopeDraft.client} load={async (search, page, signal) => { const result = await lookupApi!.branches(scopeDraft.client!.id, search, page, signal); return { items: result.items.map((item) => ({ id: item.id, label: `${item.name} · ${item.code}` })), totalPages: result.pagination.totalPages }; }} onChange={(option) => updateScopeDraft("branch", option)} />
        <button className="recurrence-filters__apply" type="button" onClick={applyScope}>Aplicar alcance</button>
      </div>}
      <button className="recurrence-filters__clear" type="button" onClick={clear}><RotateCcw size={14} aria-hidden="true" />Limpiar filtros</button>
    </div>
    {catalogState === "loading" && <p className="recurrence-filters__state" role="status" aria-live="polite">{catalog ? "Actualizando filtros…" : "Cargando filtros…"}</p>}
    {catalogState === "error" && !catalog && <div className="recurrence-filters__state recurrence-filters__state--error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>No fue posible cargar los filtros.</span><button type="button" onClick={onRetryCatalog}>Reintentar filtros</button></div>}
    {catalogState === "error" && catalog && <div className="recurrence-filters__state recurrence-filters__state--stale" role="status" aria-live="polite" aria-label="Catálogo desactualizado"><AlertTriangle size={15} aria-hidden="true" /><span>Los filtros disponibles pueden estar desactualizados.</span><button type="button" onClick={onRetryCatalog}>Reintentar filtros</button></div>}
  </div>;
}
