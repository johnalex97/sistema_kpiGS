import { ArrowUpRight } from "lucide-react";
import type { ClientSummary } from "../../models/client";

interface ClientTableProps {
  clients: ClientSummary[];
  selectedId: string | null;
  onSelect(id: string): void;
}

function ClientIdentity({ client }: { client: ClientSummary }) {
  return <span className="clients-identity"><strong>{client.tradeName}</strong><small>{client.legalName ?? client.taxId ?? "Sin razón social ni RTN"}</small></span>;
}

function ClientStatus({ active }: { active: boolean }) {
  return <span className={`clients-status ${active ? "clients-status--active" : "clients-status--inactive"}`}>
    <i aria-hidden="true" />{active ? "Activo" : "Inactivo"}
  </span>;
}

export function ClientTable({ clients, selectedId, onSelect }: ClientTableProps) {
  return <>
    <div className="clients-table-wrap">
      <table className="clients-table" aria-label="Listado de clientes">
        <thead><tr><th>Código</th><th>Cliente</th><th>RTN / razón social</th><th>Contacto</th><th>Sucursales</th><th>Contactos</th><th>Estado</th><th><span className="sr-only">Ficha</span></th></tr></thead>
        <tbody>{clients.map((client) => <tr key={client.id} data-selected={selectedId === client.id || undefined}>
          <td className="clients-code">{client.code}</td>
          <td><strong>{client.tradeName}</strong></td>
          <td>{client.taxId ?? client.legalName ?? "—"}</td>
          <td>{client.phone ?? client.email ?? "—"}</td>
          <td className="clients-count">{client.activeBranchCount}</td>
          <td className="clients-count">{client.activeContactCount}</td>
          <td><ClientStatus active={client.isActive} /></td>
          <td><button type="button" className="clients-open" aria-label={`Abrir ficha de ${client.tradeName}`} onClick={() => onSelect(client.id)}><ArrowUpRight size={17} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="clients-cards" aria-label="Clientes">
      {clients.map((client) => <article key={client.id} className="clients-card" data-selected={selectedId === client.id || undefined}>
        <div className="clients-card__top"><span className="clients-code">{client.code}</span><ClientStatus active={client.isActive} /></div>
        <ClientIdentity client={client} />
        <div className="clients-card__counts"><span>{client.activeBranchCount} sucursales</span><span>{client.activeContactCount} contactos</span></div>
        <button type="button" className="clients-card__open" aria-label={`Abrir ficha de ${client.tradeName}`} onClick={() => onSelect(client.id)}>Abrir ficha <ArrowUpRight size={16} aria-hidden="true" /></button>
      </article>)}
    </div>
  </>;
}
