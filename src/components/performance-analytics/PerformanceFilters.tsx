import { useEffect, useState } from "react";
import type { OrderBranchOption, OrderCatalog } from "../../models/order";
import type { OrderLookupApi } from "../../api/order-lookups";
import type { PerformanceAnalyticsQuery, PerformanceGranularity } from "../../models/performance-analytics";
import "./performance-analytics.css";

function normalizedPeriodStart(value: string, granularity: PerformanceGranularity) {
  if (granularity === "MONTH") return `${value.slice(0, 7)}-01`;
  if (granularity === "YEAR") return `${value.slice(0, 4)}-01-01`;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

const orderStatuses = [
  ["PENDING", "Pendiente"], ["ASSIGNED", "Asignada"], ["ON_ROUTE", "En camino"],
  ["IN_PROGRESS", "En progreso"], ["PAUSED", "Pausada"], ["COMPLETED", "Finalizada"], ["CANCELLED", "Cancelada"],
] as const;

function OperationalFilters({ query, onChange, disabled, lookupApi }: { query: PerformanceAnalyticsQuery; onChange(query: PerformanceAnalyticsQuery): void; disabled: boolean; lookupApi?: OrderLookupApi }) {
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; code: string; tradeName: string }>>([]);
  const [branches, setBranches] = useState<{ clientId: string; items: OrderBranchOption[] } | null>(null);
  const [catalog, setCatalog] = useState<OrderCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lookupApi) return;
    const controller = new AbortController();
    void lookupApi.catalog(controller.signal).then((value) => { if (!controller.signal.aborted) setCatalog(value); }).catch(() => { if (!controller.signal.aborted) setError("No fue posible cargar los tipos de servicio."); });
    return () => controller.abort();
  }, [lookupApi]);
  useEffect(() => {
    if (!lookupApi || clientSearch.trim().length < 2) return;
    const controller = new AbortController();
    void lookupApi.clients(clientSearch.trim(), 1, controller.signal).then((page) => { if (!controller.signal.aborted) setClients(page.items); }).catch(() => { if (!controller.signal.aborted) setError("No fue posible buscar clientes."); });
    return () => controller.abort();
  }, [clientSearch, lookupApi]);
  useEffect(() => {
    if (!lookupApi || !query.clientId) return;
    const controller = new AbortController();
    void lookupApi.branches(query.clientId, controller.signal).then((items) => { if (!controller.signal.aborted) setBranches({ clientId: query.clientId!, items }); }).catch(() => { if (!controller.signal.aborted) setError("No fue posible cargar las sucursales."); });
    return () => controller.abort();
  }, [lookupApi, query.clientId]);

  return <div className="performance-filters__advanced">
    <label><span>Cliente</span><input aria-label="Cliente" type="search" value={clientSearch} disabled={disabled || !lookupApi} placeholder="Buscar por nombre o código" onChange={(event) => setClientSearch(event.target.value)} /></label>
    {clientSearch.trim().length >= 2 && clients.length > 0 && <div className="performance-filters__matches" role="listbox" aria-label="Resultados de cliente">{clients.map((client) => <button key={client.id} type="button" role="option" onClick={() => { onChange({ ...query, clientId: client.id, branchId: undefined }); setClientSearch(""); setClients([]); }}>{client.tradeName} · {client.code}</button>)}</div>}
    {query.clientId && <button className="performance-filters__clear" type="button" disabled={disabled} onClick={() => onChange({ ...query, clientId: undefined, branchId: undefined })}>Quitar cliente</button>}
    <label><span>Sucursal</span><select aria-label="Sucursal" value={query.branchId ?? ""} disabled={disabled || !query.clientId} onChange={(event) => onChange({ ...query, branchId: event.target.value || undefined })}><option value="">Todas</option>{branches && branches.clientId === query.clientId && branches.items.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    <label><span>Tipo de servicio</span><select aria-label="Tipo de servicio" value={query.serviceTypeId ?? ""} disabled={disabled || !catalog} onChange={(event) => onChange({ ...query, serviceTypeId: event.target.value || undefined })}><option value="">Todos</option>{catalog?.serviceTypes.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
    {error && <p className="performance-filters__error" role="alert">{error}</p>}
  </div>;
}

export function PerformanceFilters({ query, onChange, onExport, disabled = false, exportDisabled = disabled, lookupApi }: { query: PerformanceAnalyticsQuery; onChange(query: PerformanceAnalyticsQuery): void; onExport(): void; disabled?: boolean; exportDisabled?: boolean; lookupApi?: OrderLookupApi }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return <section className="performance-filters" aria-label="Filtros de rendimiento">
    <label><span>Periodo</span><select aria-label="Periodo" value={query.granularity} disabled={disabled} onChange={(event) => { const granularity = event.target.value as PerformanceGranularity; onChange({ ...query, granularity, periodStart: normalizedPeriodStart(query.periodStart, granularity) }); }}><option value="WEEK">Semana</option><option value="MONTH">Mes</option><option value="YEAR">Año</option></select></label>
    <label><span>Fecha de inicio</span><input aria-label="Fecha de inicio" type="date" value={query.periodStart} disabled={disabled} onChange={(event) => onChange({ ...query, periodStart: event.target.value })} /></label>
    <label><span>Estado de orden</span><select aria-label="Estado de orden" value={query.orderStatus ?? ""} disabled={disabled} onChange={(event) => onChange({ ...query, orderStatus: event.target.value || undefined })}><option value="">Todos</option>{orderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <button className="button performance-filters__more" type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? "Ocultar filtros" : "Más filtros"}</button>
    <button className="button performance-filters__export" type="button" disabled={exportDisabled} onClick={onExport}>Exportar CSV</button>
    {showAdvanced && <OperationalFilters query={query} onChange={onChange} disabled={disabled} lookupApi={lookupApi} />}
  </section>;
}
