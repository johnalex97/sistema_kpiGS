import type { ClientBranch, ClientContact, ContactListFilters, ContactPage } from "../../models/client";
import type { AsyncState } from "../../hooks/useClientsWorkspace";

interface ClientContactsProps {
  clientActive: boolean;
  branches: ClientBranch[];
  filters: ContactListFilters;
  contacts: AsyncState<ContactPage>;
  onChange(patch: Partial<ContactListFilters>): void;
  onRetry(): void;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

function emailHref(value: string | null): string | null {
  if (!value || value !== value.trim() || value.length > 254 || /\s/.test(value) || hasControlCharacter(value)) return null;
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value)) return null;
  return `mailto:${value}`;
}

function phoneHref(value: string | null): string | null {
  if (!value || /[A-Za-z:;]/.test(value) || hasControlCharacter(value)) return null;
  const dial = value.replace(/[^+\d]/g, "");
  return /^\+?\d{3,20}$/.test(dial) ? `tel:${dial}` : null;
}

function ContactCard({ contact, clientActive, branch }: { contact: ClientContact; clientActive: boolean; branch?: ClientBranch }) {
  const effective = contact.isActive && contact.isEffectivelyActive && clientActive && (contact.scope === "CLIENT" || Boolean(branch?.isActive));
  const effectiveLabel = !clientActive && contact.isActive ? "No disponible por cliente inactivo"
    : contact.scope === "BRANCH" && branch && !branch.isActive && contact.isActive
      ? "No disponible por sucursal inactiva" : contact.scope === "BRANCH" && !branch
        ? "No disponible: sucursal no verificada" : effective ? "Disponible" : "No disponible";
  const email = emailHref(contact.email);
  const phone = phoneHref(contact.phone);
  return <article className="clients-contact" aria-label={`Contacto ${contact.fullName}`}>
    <h4>{contact.fullName}</h4>
    <dl>
      <div><dt>Cargo</dt><dd>{contact.position || "No registrado"}</dd></div>
      <div><dt>Teléfono</dt><dd>{contact.phone ? phone ? <a href={phone}>{contact.phone}</a> : contact.phone : "No registrado"}</dd></div>
      <div><dt>Correo</dt><dd>{contact.email ? email ? <a href={email}>{contact.email}</a> : contact.email : "No registrado"}</dd></div>
      <div><dt>Ámbito</dt><dd>{contact.scope === "CLIENT" ? "General" : "Sucursal"}</dd></div>
      <div><dt>Sucursal</dt><dd>{contact.scope === "CLIENT" ? "No aplica" : branch?.name || contact.branchName || "No registrada"}</dd></div>
    </dl>
    <div className="clients-contact__foot">
      {contact.isPrimary && <span className="clients-contact__primary">{contact.scope === "CLIENT" ? "Principal general" : "Principal de sucursal"}</span>}
      <span className={`clients-status ${contact.isActive ? "clients-status--active" : "clients-status--inactive"}`}><i aria-hidden="true" />Estado interno: {contact.isActive ? "Activo" : "Inactivo"}</span>
      <span className={`clients-branch__effective ${effective ? "clients-branch__effective--active" : ""}`}>{effectiveLabel}</span>
    </div>
  </article>;
}

export function ClientContacts({ clientActive, branches, filters, contacts, onChange, onRetry }: ClientContactsProps) {
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const general: ClientContact[] = [];
  const grouped = new Map<string, ClientContact[]>();
  for (const contact of contacts.data?.items ?? []) {
    if (contact.scope === "CLIENT") general.push(contact);
    else {
      const key = contact.branchId || contact.branchName || "unknown";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(contact);
    }
  }
  const pagination = contacts.data?.pagination;
  return <div className="clients-contacts">
    <div className="clients-contacts__filters">
      <label>Buscar contactos<input type="search" maxLength={100} value={filters.search ?? ""} onChange={(event) => onChange({ search: event.target.value || undefined })} /></label>
      <label>Ámbito<select value={filters.scope ?? "all"} onChange={(event) => onChange({ scope: event.target.value === "all" ? undefined : event.target.value as ContactListFilters["scope"], branchId: event.target.value === "CLIENT" ? undefined : filters.branchId })}><option value="all">Todos</option><option value="CLIENT">Generales</option><option value="BRANCH">De sucursal</option></select></label>
      <label>Sucursal<select value={filters.scope === "CLIENT" ? "" : filters.branchId ?? ""} disabled={filters.scope === "CLIENT"} onChange={(event) => onChange({ branchId: event.target.value || undefined })}><option value="">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label>Estado de contacto<select value={filters.isActive === undefined ? "all" : String(filters.isActive)} onChange={(event) => onChange({ isActive: event.target.value === "all" ? undefined : event.target.value === "true" })}><option value="all">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></label>
      <label className="clients-contacts__inactive"><input type="checkbox" checked={filters.includeInactive} disabled={filters.isActive === false} onChange={(event) => onChange({ includeInactive: event.target.checked })} />Incluir contactos inactivos</label>
    </div>
    {contacts.stale && <div className="clients-notice" role="status">Contactos posiblemente desactualizados. {contacts.error}<button type="button" onClick={onRetry}>Reintentar contactos</button></div>}
    {contacts.status === "loading" && <p className="clients-state" role="status">{contacts.data ? "Actualizando contactos…" : "Cargando contactos…"}</p>}
    {contacts.status === "error" && !contacts.data && <div className="clients-state" role="alert"><strong>No fue posible cargar los contactos</strong><p>{contacts.error}</p><button className="button button--ghost" type="button" onClick={onRetry}>Reintentar contactos</button></div>}
    {contacts.status === "success" && contacts.data?.items.length === 0 && <div className="clients-state"><strong>No hay contactos para estos filtros</strong><p>Cambia la búsqueda o el estado para ampliar los resultados.</p></div>}
    {general.length > 0 && <section className="clients-contact-group" aria-label="Contactos generales"><h3>Contactos generales</h3><div className="clients-contacts__list">{general.map((item) => <ContactCard key={item.id} contact={item} clientActive={clientActive} />)}</div></section>}
    {[...grouped].map(([key, items]) => {
      const branch = branchById.get(key);
      const name = branch?.name || items[0]?.branchName || "Sucursal no registrada";
      return <section key={key} className="clients-contact-group" role="region" aria-label={name}><h3>{name}</h3><div className="clients-contacts__list">{items.map((item) => <ContactCard key={item.id} contact={item} clientActive={clientActive} branch={branch} />)}</div></section>;
    })}
    {pagination && pagination.totalPages > 1 && <nav className="clients-pagination" aria-label="Paginación de contactos"><button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => onChange({ page: pagination.page - 1 })}>Anterior</button><span>Página {pagination.page} de {pagination.totalPages}</span><button className="button button--ghost" type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onChange({ page: pagination.page + 1 })}>Siguiente</button></nav>}
  </div>;
}
