import { ArrowUpRight, Clock3 } from "lucide-react";
import type { Order, OrderStatus } from "../../models/order";

const statusLabel: Record<OrderStatus, string> = {
  PENDING: "Pendiente", ASSIGNED: "Asignada", ON_ROUTE: "En camino",
  IN_PROGRESS: "En progreso", PAUSED: "Pausada", COMPLETED: "Finalizada", CANCELLED: "Cancelada",
};

function schedule(value: string | null) {
  if (!value) return "Sin programar";
  return new Intl.DateTimeFormat("es-HN", { timeZone: "America/Tegucigalpa", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function OrderSignal({ order }: { order: Order }) {
  return <span className={`order-signal order-signal--${order.status.toLowerCase()}`}><i />{statusLabel[order.status]}</span>;
}

export function OrderTable({ items, selectedId, onOpen }: {
  items: Order[];
  selectedId: string | null;
  onOpen(id: string): void;
}) {
  return <>
    <div className="order-table-wrap"><table className="order-table" aria-label="Órdenes de trabajo"><thead><tr><th>Orden</th><th>Cliente / sede</th><th>Servicio</th><th>Prioridad</th><th>Estado</th><th>Agenda</th><th>Responsable</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>{items.map((order) => <tr key={order.id} data-selected={selectedId === order.id}><td><strong>{order.orderNumber}</strong>{order.overdue && <span className="order-overdue"><Clock3 size={12} />Atrasada</span>}</td><td><b>{order.client.tradeName}</b><small>{order.branch.name}</small></td><td>{order.serviceType.name}</td><td><span className={`order-priority order-priority--${order.priority.toLowerCase()}`}>{order.priority}</span></td><td><OrderSignal order={order} /></td><td>{schedule(order.scheduledFor)}</td><td>{order.primaryTechnician?.fullName ?? "Sin asignar"}</td><td><button type="button" aria-label={`Abrir ${order.orderNumber}`} onClick={() => onOpen(order.id)}><ArrowUpRight size={16} /></button></td></tr>)}</tbody></table></div>
    <div className="order-cards" role="list" aria-label="Órdenes de trabajo en móvil">{items.map((order) => <article role="listitem" className="order-card" key={order.id} data-selected={selectedId === order.id}><header><div><strong>{order.orderNumber}</strong><p>{order.reportedProblem}</p></div><OrderSignal order={order} /></header><dl><div><dt>Cliente</dt><dd>{order.client.tradeName}<small>{order.branch.name}</small></dd></div><div><dt>Responsable</dt><dd>{order.primaryTechnician?.fullName ?? "Sin asignar"}</dd></div><div><dt>Agenda</dt><dd>{schedule(order.scheduledFor)}</dd></div><div><dt>Prioridad</dt><dd>{order.priority}</dd></div></dl>{order.overdue && <span className="order-overdue"><Clock3 size={12} />Atrasada</span>}<button type="button" aria-label={`Abrir ${order.orderNumber} en móvil`} onClick={() => onOpen(order.id)}>Ver orden <ArrowUpRight size={15} /></button></article>)}</div>
  </>;
}
