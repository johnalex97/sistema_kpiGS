import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ClientDetail as ClientRecord, ClientTab } from "../../models/client";
import type { BranchListFilters, BranchPage, ClientBranch, ClientContact, ContactListFilters, ContactPage } from "../../models/client";
import type { AsyncState } from "../../hooks/useClientsWorkspace";
import { ClientBranches } from "./ClientBranches";
import { ClientContacts } from "./ClientContacts";

interface ClientDetailProps {
  client: ClientRecord;
  tab: ClientTab;
  onTabChange(tab: ClientTab): void;
  onClose(): void;
  canManage?: boolean;
  onEdit?(): void;
  onLifecycle?(action: "deactivate" | "reactivate"): void;
  branches: AsyncState<BranchPage>;
  branchFilters: BranchListFilters;
  onBranchFiltersChange(patch: Partial<BranchListFilters>): void;
  onRefreshBranches(): void;
  onBranchCreate?(): void;
  onBranchEdit?(branch: ClientBranch): void;
  onBranchLifecycle?(branch: ClientBranch, action: "deactivate" | "reactivate"): void;
  branchClientActive?: boolean;
  contacts: AsyncState<ContactPage>;
  contactBranches: ClientBranch[];
  contactFilters: ContactListFilters;
  onContactFiltersChange(patch: Partial<ContactListFilters>): void;
  onRefreshContacts(): void;
  onContactCreate?(): void;
  onContactEdit?(contact: ClientContact): void;
  onContactLifecycle?(contact: ClientContact, action: "deactivate" | "reactivate"): void;
}

const tabs: { id: ClientTab; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "branches", label: "Sucursales" },
  { id: "contacts", label: "Contactos" },
];

function value(text: string | null) { return text || "No registrado"; }
function date(text: string) { return new Intl.DateTimeFormat("es-HN", { dateStyle: "medium" }).format(new Date(text)); }

export function ClientDetail({ client, tab, onTabChange, onClose, canManage, onEdit, onLifecycle, branches, branchFilters, onBranchFiltersChange, onRefreshBranches, onBranchCreate, onBranchEdit, onBranchLifecycle, branchClientActive, contacts, contactBranches, contactFilters, onContactFiltersChange, onRefreshContacts, onContactCreate, onContactEdit, onContactLifecycle }: ClientDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, [client.id]);

  return <article className="clients-detail" aria-label={`Ficha de ${client.tradeName}`}>
    <header className="clients-detail__head">
      <div className="clients-detail__identity">
        <span className="clients-detail__code">Ficha empresarial <b>{client.code}</b></span>
        <h2>{client.tradeName}</h2>
        <span className={`clients-status ${client.isActive ? "clients-status--active" : "clients-status--inactive"}`}><i aria-hidden="true" />{client.isActive ? "Activo" : "Inactivo"}</span>
      </div>
      <button ref={closeRef} type="button" className="clients-detail__close" aria-label="Cerrar ficha del cliente" onClick={onClose}><X size={19} aria-hidden="true" /></button>
    </header>
    <div className="clients-detail__metrics" aria-label="Ubicaciones y contactos">
      <div><strong>{client.branches.filter((branch) => branch.isEffectivelyActive).length}</strong><span>Sucursales activas</span></div>
      <div><strong>{client.contacts.filter((contact) => contact.isEffectivelyActive).length}</strong><span>Contactos activos</span></div>
    </div>
    <div className="clients-tabs" role="tablist" aria-label="Secciones del cliente" onKeyDown={(event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const current = tabs.findIndex((item) => item.id === tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      onTabChange(tabs[next].id);
      document.getElementById(`client-tab-${tabs[next].id}`)?.focus();
    }}>
      {tabs.map((item) => <button key={item.id} type="button" role="tab" id={`client-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`client-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => onTabChange(item.id)}>{item.label}</button>)}
    </div>
    <section role="tabpanel" id="client-panel-summary" aria-labelledby="client-tab-summary" tabIndex={0} hidden={tab !== "summary"} className="clients-detail__body">
      <dl className="clients-detail__facts">
        <div><dt>Razón social</dt><dd>{value(client.legalName)}</dd></div>
        <div><dt>RTN</dt><dd>{value(client.taxId)}</dd></div>
        <div><dt>Teléfono</dt><dd>{value(client.phone)}</dd></div>
        <div><dt>Correo</dt><dd>{value(client.email)}</dd></div>
        <div className="clients-detail__notes"><dt>Notas</dt><dd>{value(client.notes)}</dd></div>
        <div><dt>Versión</dt><dd>{client.version}</dd></div>
        <div><dt>Creado</dt><dd>{date(client.createdAt)}</dd></div>
        <div><dt>Actualizado</dt><dd>{date(client.updatedAt)}</dd></div>
      </dl>
      {canManage && <div className="clients-wizard__actions">
        {client.isActive && <button className="button button--ghost" type="button" onClick={onEdit}>Editar cliente</button>}
        <button className="button button--ghost" type="button" onClick={() => onLifecycle?.(client.isActive ? "deactivate" : "reactivate")}>{client.isActive ? "Desactivar cliente" : "Reactivar cliente"}</button>
      </div>}
    </section>
    <section role="tabpanel" id="client-panel-branches" aria-labelledby="client-tab-branches" tabIndex={0} hidden={tab !== "branches"} className="clients-detail__body">{tab === "branches" && <ClientBranches clientActive={client.isActive && branchClientActive !== false} canManage={canManage} filters={branchFilters} branches={branches} onChange={onBranchFiltersChange} onRetry={onRefreshBranches} onCreate={onBranchCreate} onEdit={onBranchEdit} onLifecycle={onBranchLifecycle} />}</section>
    <section role="tabpanel" id="client-panel-contacts" aria-labelledby="client-tab-contacts" tabIndex={0} hidden={tab !== "contacts"} className="clients-detail__body">{tab === "contacts" && <ClientContacts clientActive={client.isActive && branchClientActive !== false} canManage={canManage} branches={contactBranches} contacts={contacts} filters={contactFilters} onChange={onContactFiltersChange} onRetry={onRefreshContacts} onCreate={onContactCreate} onEdit={onContactEdit} onLifecycle={onContactLifecycle} />}</section>
  </article>;
}
