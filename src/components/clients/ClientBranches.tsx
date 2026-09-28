import type { BranchListFilters, BranchPage, ClientBranch } from "../../models/client";
import type { AsyncState } from "../../hooks/useClientsWorkspace";

export interface ClientBranchesProps {
  clientActive: boolean;
  filters: BranchListFilters;
  branches: AsyncState<BranchPage>;
  onChange(patch: Partial<BranchListFilters>): void;
  onRetry(): void;
  canManage?: boolean;
  onCreate?(): void;
  onEdit?(branch: ClientBranch): void;
  onLifecycle?(branch: ClientBranch, action: "deactivate" | "reactivate"): void;
}

function locationUrl(branch: BranchPage["items"][number]): string | null {
  if (!branch.lat?.trim() || !branch.long?.trim()) return null;
  const latitude = Number(branch.lat);
  const longitude = Number(branch.long);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function ClientBranches({ clientActive, filters, branches, onChange, onRetry, canManage, onCreate, onEdit, onLifecycle }: ClientBranchesProps) {
  const pagination = branches.data?.pagination;
  return <div className="clients-branches">
    {canManage && clientActive && <button className="button button--primary" type="button" onClick={onCreate}>Nueva sucursal</button>}
    <div className="clients-branches__filters">
      <label>Buscar sucursales<input type="search" value={filters.search ?? ""} maxLength={100} onChange={(event) => onChange({ search: event.target.value || undefined })} /></label>
      <label>Ciudad<input type="text" value={filters.city ?? ""} maxLength={100} onChange={(event) => onChange({ city: event.target.value || undefined })} /></label>
      <label>Región<input type="text" value={filters.region ?? ""} maxLength={100} onChange={(event) => onChange({ region: event.target.value || undefined })} /></label>
      <label>Estado de sucursal<select value={filters.isActive === undefined ? "all" : String(filters.isActive)} onChange={(event) => onChange({ isActive: event.target.value === "all" ? undefined : event.target.value === "true" })}><option value="all">Todas</option><option value="true">Activas</option><option value="false">Inactivas</option></select></label>
      <label className="clients-branches__inactive"><input type="checkbox" checked={filters.includeInactive} disabled={filters.isActive === false} onChange={(event) => onChange({ includeInactive: event.target.checked })} />Incluir sucursales inactivas</label>
    </div>
    {branches.stale && <div className="clients-notice" role="status">Sucursales posiblemente desactualizadas. {branches.error}<button type="button" onClick={onRetry}>Reintentar sucursales</button></div>}
    {branches.status === "loading" && <p className={`clients-state ${branches.data ? "clients-state--compact" : ""}`} role="status">{branches.data ? "Actualizando sucursales…" : "Cargando sucursales…"}</p>}
    {branches.status === "error" && !branches.data && <div className="clients-state" role="alert"><strong>No fue posible cargar las sucursales</strong><p>{branches.error}</p><button className="button button--ghost" type="button" onClick={onRetry}>Reintentar sucursales</button></div>}
    {branches.status === "success" && branches.data?.items.length === 0 && <div className="clients-state"><strong>No hay sucursales para estos filtros</strong><p>Cambia la búsqueda o el estado para ampliar los resultados.</p></div>}
    {branches.data && branches.data.items.length > 0 && <div className="clients-branches__list">{branches.data.items.map((branch) => {
      const href = locationUrl(branch);
      const effectiveActive = clientActive && branch.isEffectivelyActive;
      const effectiveLabel = !clientActive && branch.isActive ? "No disponible por cliente inactivo" : effectiveActive ? "Disponible" : "No disponible";
      return <article key={branch.id} className="clients-branch" aria-label={`Sucursal ${branch.name}`}>
        <div className="clients-branch__heading"><span className="clients-code">{branch.code}</span><h3>{branch.name}</h3></div>
        <p className="clients-branch__address">{branch.address}</p>
        {(branch.city || branch.region) && <p className="clients-branch__area">{[branch.city, branch.region].filter(Boolean).join(" · ")}</p>}
        {branch.locationReference && <p className="clients-branch__reference"><span>Referencia</span>{branch.locationReference}</p>}
        {href && <p className="clients-branch__coordinates"><span>Coordenadas</span>{branch.lat?.trim()}, {branch.long?.trim()}</p>}
        <div className="clients-branch__foot"><span className={`clients-status ${branch.isActive ? "clients-status--active" : "clients-status--inactive"}`}><i aria-hidden="true" />Estado interno: {branch.isActive ? "Activa" : "Inactiva"}</span><span className={`clients-branch__effective ${effectiveActive ? "clients-branch__effective--active" : ""}`}>{effectiveLabel}</span></div>
        {href && <a className="clients-branch__map" href={href} target="_blank" rel="noreferrer" aria-label={`Ver ubicación de ${branch.name}`}>Ver ubicación</a>}
        {canManage && clientActive && <div className="clients-wizard__actions">
          {branch.isActive && <button className="button button--ghost" type="button" onClick={() => onEdit?.(branch)}>Editar sucursal</button>}
          <button className="button button--ghost" type="button" onClick={() => onLifecycle?.(branch, branch.isActive ? "deactivate" : "reactivate")}>{branch.isActive ? "Desactivar sucursal" : "Reactivar sucursal"}</button>
        </div>}
      </article>;
    })}</div>}
    {pagination && pagination.totalPages > 1 && <nav className="clients-pagination" aria-label="Paginación de sucursales"><button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => onChange({ page: pagination.page - 1 })}>Anterior</button><span>Página {pagination.page} de {pagination.totalPages}</span><button className="button button--ghost" type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onChange({ page: pagination.page + 1 })}>Siguiente</button></nav>}
  </div>;
}
