import { Building2, Clock3, MapPin, Pencil, UserRound, X } from "lucide-react";
import type { OrderDetail as Detail } from "../../models/order";
import { OrderRoute } from "./OrderRoute";

export function OrderDetail({ order, onClose, onEdit }: { order: Detail; onClose(): void; onEdit?: () => void }) {
  return <aside className="order-detail" aria-label={`Detalle de ${order.orderNumber}`}>
    <header><div><span>ORDEN DE TRABAJO</span><h2>{order.orderNumber}</h2><p>Versión {order.version}</p></div><div className="order-detail__actions">{onEdit && <button type="button" aria-label="Editar orden" onClick={onEdit}><Pencil size={17} /></button>}<button type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={18} /></button></div></header>
    <OrderRoute status={order.status} />
    <div className="order-detail__identity"><span><Building2 size={15} />{order.client.tradeName}</span><span><MapPin size={15} />{order.branch.name}</span><span><UserRound size={15} />{order.primaryTechnician?.fullName ?? "Sin responsable"}</span><span><Clock3 size={15} />{order.estimatedMinutes ? `${order.estimatedMinutes} min estimados` : "Sin estimación"}</span></div>
    <section><span className="order-detail__label">Problema reportado</span><h3>{order.reportedProblem}</h3>{order.description && <p>{order.description}</p>}</section>
    <section><span className="order-detail__label">Servicio</span><h3>{order.serviceType.name}</h3><p>Prioridad {order.priority.toLowerCase()} · {order.overdue ? "Agenda atrasada" : "Dentro de agenda"}</p></section>
  </aside>;
}
