import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import type { ClientListFilters } from "../../models/client";

interface ClientFiltersProps {
  filters: ClientListFilters;
  onChange(patch: Partial<ClientListFilters>): void;
  onClear(): void;
}

export function ClientFilters({ filters, onChange, onClear }: ClientFiltersProps) {
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (input.current) input.current.value = filters.search ?? "";
  }, [filters.search, filters.isActive, filters.includeInactive, filters.page, filters.pageSize]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const search = (value: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onChange({ search: value.trim() || undefined, page: 1 });
    }, 300);
  };

  return <div className="clients-filters">
    <label className="clients-filters__search"><span>Buscar clientes</span><span className="clients-filters__search-field"><Search size={15} aria-hidden="true" /><input ref={input} type="search" defaultValue={filters.search ?? ""} onChange={(event) => search(event.target.value)} placeholder="Nombre, código o RTN" /></span></label>
    <label className="clients-filters__state"><span>Estado del cliente</span><select value={filters.isActive === undefined ? "all" : filters.isActive ? "active" : "inactive"} onChange={(event) => {
      const isActive = event.target.value === "all" ? undefined : event.target.value === "active";
      onChange({ isActive, includeInactive: isActive === false, page: 1 });
    }}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select></label>
    <label className="clients-filters__inactive"><input type="checkbox" checked={filters.includeInactive} disabled={filters.isActive === false} onChange={(event) => onChange({ includeInactive: event.target.checked, page: 1 })} /><span>Incluir inactivos</span></label>
    <button className="button button--ghost clients-filters__clear" type="button" onClick={() => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      if (input.current) input.current.value = "";
      onClear();
    }}>Limpiar filtros</button>
  </div>;
}
