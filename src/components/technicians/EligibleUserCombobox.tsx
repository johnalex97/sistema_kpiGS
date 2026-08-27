import { ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { TechnicianApi } from "../../api/technicians";
import type { EligibleTechnicianUser } from "../../models/technician";

export interface EligibleUserComboboxProps {
  api: TechnicianApi;
  value: EligibleTechnicianUser | null;
  technicianId?: string;
  disabled?: boolean;
  onChange(user: EligibleTechnicianUser | null): void;
}

const optionLabel = (user: EligibleTechnicianUser) => `${user.displayName} · ${user.email}`;

export function EligibleUserCombobox({ api, value, technicianId, disabled = false, onChange }: EligibleUserComboboxProps) {
  const inputId = useId();
  const listId = `${inputId}-eligible-users`;
  const [query, setQuery] = useState(() => value ? optionLabel(value) : "");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<EligibleTechnicianUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const apiRef = useRef(api);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const selectedRef = useRef(value);

  useEffect(() => { apiRef.current = api; }, [api]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const generation = ++generationRef.current;
    apiRef.current.eligibleUsers(debouncedSearch, page, technicianId, controller.signal).then((result) => {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setItems((current) => {
        const incoming = page === 1 ? result.items : [...current, ...result.items];
        return [...new Map(incoming.map((item) => [item.id, item])).values()];
      });
      setTotalPages(result.pagination.totalPages);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      if (!(error instanceof Error && error.name === "AbortError")) {
        setItems([]);
        setTotalPages(1);
      }
    }).finally(() => {
      if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
    });
    return () => controller.abort();
  }, [debouncedSearch, page, technicianId]);

  const changeQuery = (next: string) => {
    requestRef.current?.abort();
    generationRef.current += 1;
    if (selectedRef.current) {
      selectedRef.current = null;
      onChange(null);
    }
    setQuery(next);
    setSearch(next);
    setPage(1);
    setOpen(true);
    setLoading(true);
  };

  const clear = () => {
    requestRef.current?.abort();
    generationRef.current += 1;
    selectedRef.current = null;
    setQuery("");
    setSearch("");
    setPage(1);
    setOpen(true);
    onChange(null);
  };

  return <div className="lookup-combobox technician-user-combobox">
    <label htmlFor={inputId}>Usuario vinculado</label>
    <p className="technician-user-combobox__hint">Conecta el perfil laboral con su acceso a Geek Solution.</p>
    <div className="lookup-combobox__input">
      <Search size={14} aria-hidden="true" />
      <input id={inputId} name="eligible-user-search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} autoComplete="off" placeholder="Buscar nombre o correo…" value={query} disabled={disabled} onFocus={() => setOpen(true)} onChange={(event) => changeQuery(event.target.value)} />
      {value && !disabled ? <button type="button" className="icon-button" aria-label="Quitar usuario vinculado" onClick={clear}><X size={14} aria-hidden="true" /></button> : loading ? <LoaderCircle className="lookup-combobox__loader" size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
    </div>
    {open && !disabled && <div className="lookup-combobox__list" id={listId} role="listbox" aria-label="Usuarios elegibles">
      {!loading && items.length === 0 && <p>No hay usuarios elegibles para esta búsqueda.</p>}
      {items.map((user) => <button type="button" role="option" aria-selected={value?.id === user.id} key={user.id} onClick={() => { selectedRef.current = user; setQuery(optionLabel(user)); setSearch(""); setOpen(false); onChange(user); }}>{optionLabel(user)}</button>)}
      {page < totalPages && <button className="lookup-combobox__more" type="button" aria-label="Cargar más usuarios" onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Cargar más</button>}
    </div>}
  </div>;
}
