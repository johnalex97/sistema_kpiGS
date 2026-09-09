import { ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
import type { OrderLookup, OrderStatus } from "../../models/order-lookup";

interface OrderRequest {
  search: string;
  page: number;
  statuses: OrderStatus[];
  excludeId?: string;
  scopeKey: string;
  revision: number;
}

interface PendingSearch {
  search: string;
  scopeKey: string;
  revision: number;
}

export interface OrderLookupComboboxProps {
  label: string;
  name: string;
  api: RecurrenceLookupApi;
  statuses: readonly OrderStatus[];
  value: OrderLookup | null;
  excludeId?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange(order: OrderLookup | null): void;
}

const optionLabel = (order: OrderLookup) =>
  `${order.orderNumber} · ${order.clientName} · ${order.branchName}`;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function OrderLookupCombobox({
  label,
  name,
  api,
  statuses,
  value,
  excludeId,
  disabled = false,
  invalid = false,
  describedBy,
  inputRef,
  onChange,
}: OrderLookupComboboxProps) {
  const inputId = useId();
  const listId = `${inputId}-orders`;
  const scopeKey = `${statuses.join(",")}|${excludeId ?? ""}`;
  const [query, setQuery] = useState("");
  const [request, setRequest] = useState<OrderRequest | null>(null);
  const [pendingSearch, setPendingSearch] = useState<PendingSearch | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<OrderLookup[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const apiRef = useRef(api);
  const statusesRef = useRef(statuses);
  const excludeIdRef = useRef(excludeId);
  const scopeKeyRef = useRef(scopeKey);
  const desiredSearchRef = useRef("");
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const revisionRef = useRef(0);
  const selectedRef = useRef(value);
  const itemsRef = useRef<OrderLookup[]>([]);
  const loadedKeyRef = useRef<string | null>(null);
  const previousScopeKeyRef = useRef(scopeKey);

  useEffect(() => { apiRef.current = api; }, [api]);
  useEffect(() => { statusesRef.current = statuses; }, [statuses]);
  useEffect(() => { selectedRef.current = value; }, [value]);
  useEffect(() => { excludeIdRef.current = excludeId; }, [excludeId]);
  useEffect(() => { scopeKeyRef.current = scopeKey; }, [scopeKey]);

  const createRequest = (search: string, page: number): OrderRequest => ({
    search,
    page,
    statuses: [...statusesRef.current],
    excludeId: excludeIdRef.current,
    scopeKey: scopeKeyRef.current,
    revision: ++revisionRef.current,
  });

  const cancelRequest = () => {
    controllerRef.current?.abort();
    generationRef.current += 1;
  };

  useEffect(() => {
    if (previousScopeKeyRef.current === scopeKey) return;
    previousScopeKeyRef.current = scopeKey;
    cancelRequest();
    desiredSearchRef.current = "";
    itemsRef.current = [];
    loadedKeyRef.current = null;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || scopeKeyRef.current !== scopeKey) return;
      setQuery("");
      setRequest(null);
      setPendingSearch(null);
      setCurrentPage(1);
      setTotalPages(1);
      setItems([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      setLoadError(false);
    });
    return () => { active = false; };
  }, [scopeKey]);

  const startRequest = (search: string, page: number) => {
    cancelRequest();
    setLoading(true);
    setLoadError(false);
    setRequest(createRequest(search, page));
  };

  useEffect(() => {
    if (!pendingSearch) return;
    const timer = window.setTimeout(() => {
      if (desiredSearchRef.current !== pendingSearch.search || scopeKeyRef.current !== pendingSearch.scopeKey) return;
      setRequest({
        search: pendingSearch.search,
        page: 1,
        statuses: [...statusesRef.current],
        excludeId: excludeIdRef.current,
        scopeKey: scopeKeyRef.current,
        revision: pendingSearch.revision,
      });
      setPendingSearch(null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pendingSearch]);

  useEffect(() => {
    if (!open || disabled || !request) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const generation = ++generationRef.current;
    apiRef.current.orders(request.search, request.statuses, request.page, controller.signal).then((result) => {
      if (
        controller.signal.aborted
        || generation !== generationRef.current
        || desiredSearchRef.current !== request.search
        || scopeKeyRef.current !== request.scopeKey
      ) return;
      const allowedStatuses = new Set(request.statuses);
      const visible = result.items.filter((order) => order.id !== request.excludeId && allowedStatuses.has(order.status));
      setItems((current) => {
        const incoming = request.page === 1 ? visible : [...current, ...visible];
        const unique = [...new Map(incoming.map((order) => [order.id, order])).values()];
        itemsRef.current = unique;
        return unique;
      });
      loadedKeyRef.current = `${request.scopeKey}|${request.search}`;
      setCurrentPage(request.page);
      setTotalPages(result.pagination.totalPages);
      setLoadError(false);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || generation !== generationRef.current || isAbortError(error)) return;
      if (request.page === 1) {
        itemsRef.current = [];
        setItems([]);
      }
      setLoadError(true);
    }).finally(() => {
      if (!controller.signal.aborted && generation === generationRef.current) {
        setLoading(false);
        setRequest((current) => current?.revision === request.revision ? null : current);
      }
    });
    return () => controller.abort();
  }, [disabled, open, request]);

  useEffect(() => {
    const activeOrder = activeIndex >= 0 ? items[activeIndex] : undefined;
    if (!open || !activeOrder) return;
    document.getElementById(`${listId}-option-${activeOrder.id}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, items, listId, open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    const desiredKey = `${scopeKeyRef.current}|${desiredSearchRef.current}`;
    if (loadedKeyRef.current !== desiredKey && !loading) {
      itemsRef.current = [];
      setItems([]);
      setActiveIndex(-1);
      startRequest(desiredSearchRef.current, 1);
    }
  };

  const changeQuery = (next: string) => {
    cancelRequest();
    desiredSearchRef.current = next;
    if (selectedRef.current) {
      selectedRef.current = null;
      onChange(null);
    }
    itemsRef.current = [];
    setItems([]);
    setQuery(next);
    setRequest(null);
    setCurrentPage(1);
    setTotalPages(1);
    setActiveIndex(-1);
    setOpen(true);
    setLoading(true);
    setLoadError(false);
    setPendingSearch({ search: next, scopeKey: scopeKeyRef.current, revision: ++revisionRef.current });
  };

  const clear = () => {
    cancelRequest();
    selectedRef.current = null;
    desiredSearchRef.current = "";
    itemsRef.current = [];
    loadedKeyRef.current = null;
    setItems([]);
    setQuery("");
    setRequest(null);
    setPendingSearch(null);
    setCurrentPage(1);
    setTotalPages(1);
    setActiveIndex(-1);
    setOpen(true);
    startRequest("", 1);
    onChange(null);
  };

  const selectOrder = (order: OrderLookup) => {
    cancelRequest();
    selectedRef.current = order;
    desiredSearchRef.current = "";
    setQuery("");
    setRequest(null);
    setPendingSearch(null);
    setLoading(false);
    setActiveIndex(-1);
    setOpen(false);
    onChange(order);
  };

  const retry = () => startRequest(desiredSearchRef.current, 1);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openList();
      if (items.length > 0) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => current < 0
          ? direction > 0 ? 0 : items.length - 1
          : (current + direction + items.length) % items.length);
      }
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const active = items[activeIndex];
      if (active) selectOrder(active);
    }
  };

  const handleComboboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.target !== event.currentTarget.querySelector('[role="combobox"]')) {
      event.currentTarget.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();
    }
    setActiveIndex(-1);
    setOpen(false);
  };

  const activeOrder = activeIndex >= 0 ? items[activeIndex] : undefined;
  const statusText = loading
    ? "Buscando órdenes"
    : loadError ? "No fue posible cargar las órdenes"
      : `${items.length} ${items.length === 1 ? "orden disponible" : "órdenes disponibles"}`;

  return <div className="recurrence-order-combobox" onKeyDown={handleComboboxKeyDown}>
    <label htmlFor={inputId}>{label}</label>
    <div className="recurrence-order-combobox__control">
      <Search size={15} aria-hidden="true" />
      <input
        id={inputId}
        name={name}
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeOrder ? `${listId}-option-${activeOrder.id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder="Ej.: OT-2026-0042, Hospital Norte…"
        value={value ? optionLabel(value) : query}
        disabled={disabled}
        onFocus={openList}
        onClick={openList}
        onChange={(event) => changeQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {value && !disabled
        ? <button type="button" aria-label={`Quitar ${label.toLowerCase()}`} onClick={clear}><X size={15} aria-hidden="true" /></button>
        : loading ? <LoaderCircle className="recurrence-order-combobox__loader" size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
    </div>
    <p className="sr-only" role="status" aria-live="polite" aria-label={statusText}>{statusText}.</p>
    {open && !disabled && <div className="recurrence-order-combobox__popup">
      <div className="recurrence-order-combobox__list" id={listId} role="listbox" aria-label={`Opciones de ${label}`}>
        {items.map((order, index) => <div
          id={`${listId}-option-${order.id}`}
          role="option"
          tabIndex={-1}
          aria-selected={value?.id === order.id}
          data-active={activeIndex === index || undefined}
          key={order.id}
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={() => setActiveIndex(index)}
          onClick={() => selectOrder(order)}
        ><strong>{order.orderNumber}</strong><span>{order.clientName} · {order.branchName}</span></div>)}
      </div>
      {!loading && loadError && <div className="recurrence-order-combobox__message" role="alert"><p>No fue posible cargar las órdenes.</p><button type="button" aria-label="Reintentar órdenes" onClick={retry}>Reintentar</button></div>}
      {!loading && !loadError && items.length === 0 && <p className="recurrence-order-combobox__message">No hay órdenes disponibles para esta búsqueda.</p>}
      {!loading && !loadError && currentPage < totalPages && <button className="recurrence-order-combobox__more" type="button" aria-label="Cargar más órdenes" onClick={() => startRequest(desiredSearchRef.current, currentPage + 1)}>Cargar más</button>}
    </div>}
  </div>;
}
