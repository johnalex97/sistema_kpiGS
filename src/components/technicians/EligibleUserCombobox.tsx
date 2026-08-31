import { ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { TechnicianApi } from "../../api/technicians";
import type { EligibleTechnicianUser } from "../../models/technician";

export interface EligibleUserComboboxProps {
  api: TechnicianApi;
  value: EligibleTechnicianUser | null;
  technicianId?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange(user: EligibleTechnicianUser | null): void;
}

const optionLabel = (user: EligibleTechnicianUser) => `${user.displayName} · ${user.email}`;

export function EligibleUserCombobox({ api, value, technicianId, disabled = false, invalid = false, describedBy, onChange }: EligibleUserComboboxProps) {
  const inputId = useId();
  const listId = `${inputId}-eligible-users`;
  const [query, setQuery] = useState(() => value ? optionLabel(value) : "");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<EligibleTechnicianUser[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [requestRevision, setRequestRevision] = useState(0);
  const apiRef = useRef(api);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const selectedRef = useRef(value);
  const debounceInitializedRef = useRef(false);

  useEffect(() => { apiRef.current = api; }, [api]);
  useEffect(() => {
    if (!debounceInitializedRef.current) {
      debounceInitializedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search);
      setRequestRevision((current) => current + 1);
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
      setLoadError(false);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      if (!(error instanceof Error && error.name === "AbortError")) {
        if (page === 1) {
          setItems([]);
          setTotalPages(1);
        }
        setLoadError(true);
      }
    }).finally(() => {
      if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
    });
    return () => controller.abort();
  }, [debouncedSearch, page, requestRevision, technicianId]);

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
    setActiveIndex(-1);
    setOpen(true);
    setLoading(true);
    setLoadError(false);
  };

  const clear = () => {
    requestRef.current?.abort();
    generationRef.current += 1;
    selectedRef.current = null;
    setQuery("");
    setSearch("");
    setPage(1);
    setActiveIndex(-1);
    setOpen(true);
    setLoading(true);
    setLoadError(false);
    setRequestRevision((current) => current + 1);
    onChange(null);
  };

  const retry = () => {
    requestRef.current?.abort();
    generationRef.current += 1;
    setLoading(true);
    setLoadError(false);
    setRequestRevision((current) => current + 1);
  };

  const selectUser = (user: EligibleTechnicianUser) => {
    selectedRef.current = user;
    setQuery(optionLabel(user));
    setSearch("");
    setActiveIndex(-1);
    setOpen(false);
    onChange(user);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (items.length > 0) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => current < 0
          ? direction > 0 ? 0 : items.length - 1
          : (current + direction + items.length) % items.length);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setActiveIndex(-1);
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const activeUser = items[activeIndex];
      if (activeUser) selectUser(activeUser);
    }
  };

  const activeUser = activeIndex >= 0 ? items[activeIndex] : undefined;

  return <div className="lookup-combobox technician-user-combobox">
    <label htmlFor={inputId}>Usuario vinculado</label>
    <p className="technician-user-combobox__hint">Conecta el perfil laboral con su acceso a Geek Solution.</p>
    <div className="lookup-combobox__input">
      <Search size={14} aria-hidden="true" />
      <input id={inputId} name="eligible-user-search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={activeUser ? `${listId}-option-${activeUser.id}` : undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy} autoComplete="off" placeholder="Buscar nombre o correo…" value={query} disabled={disabled} onFocus={() => setOpen(true)} onChange={(event) => changeQuery(event.target.value)} onKeyDown={handleKeyDown} />
      {value && !disabled ? <button type="button" className="icon-button" aria-label="Quitar usuario vinculado" onClick={clear}><X size={14} aria-hidden="true" /></button> : loading ? <LoaderCircle className="lookup-combobox__loader" size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
    </div>
    {open && !disabled && <div className="lookup-combobox__list" id={listId} role="listbox" aria-label="Usuarios elegibles">
      {!loading && loadError && <div role="alert"><p>No fue posible cargar los usuarios elegibles.</p><button type="button" aria-label="Reintentar usuarios elegibles" onClick={retry}>Reintentar</button></div>}
      {!loading && !loadError && items.length === 0 && <p>No hay usuarios elegibles para esta búsqueda.</p>}
      {items.map((user, index) => <button id={`${listId}-option-${user.id}`} type="button" role="option" aria-selected={value?.id === user.id} data-active={activeIndex === index || undefined} key={user.id} onClick={() => selectUser(user)}>{optionLabel(user)}</button>)}
      {!loading && !loadError && page < totalPages && <button className="lookup-combobox__more" type="button" aria-label="Cargar más usuarios" onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Cargar más</button>}
    </div>}
  </div>;
}
