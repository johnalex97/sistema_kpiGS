import { AlertTriangle, Building2, Clock3, MapPin, Pencil, UserRound, X } from "lucide-react";
import type { OrderAction } from "../../hooks/order-workspace.helpers";
import type { OrderCatalog, OrderDetail as Detail } from "../../models/order";
import { OrderRoute } from "./OrderRoute";
import { OrderMaterials } from "./OrderMaterials";

const labels: Partial<Record<OrderAction, string>> = {
  onRoute: "Salir en camino",
  start: "Iniciar trabajo",
  pause: "Pausar trabajo",
  resume: "Reanudar trabajo",
  complete: "Finalizar orden",
  cancel: "Cancelar orden",
  adjust: "Ajustar orden",
};

const primaryByStatus: Partial<Record<Detail["status"], OrderAction>> = {
  ASSIGNED: "onRoute",
  ON_ROUTE: "start",
  IN_PROGRESS: "complete",
  PAUSED: "resume",
  COMPLETED: "adjust",
  CANCELLED: "adjust",
};

interface OrderDetailProps {
  order: Detail;
  actions?: OrderAction[];
  actionPending?: boolean;
  actionError?: string | null;
  onClose(): void;
  onEdit?: () => void;
  onAction?: (action: OrderAction) => void;
  materialCatalog?: OrderCatalog;
  materialCanManage?: boolean;
  materialPending?: boolean;
  materialError?: string | null;
  onAddMaterial?: (input: { materialId: string; quantity: string; observation?: string | null }) => Promise<boolean>;
  onUpdateMaterial?: (usageId: string, input: { quantity?: string; observation?: string | null }) => Promise<boolean>;
  onRemoveMaterial?: (usageId: string) => Promise<boolean>;
}

export function OrderDetail({ order, actions = [], actionPending = false, actionError = null, onClose, onEdit, onAction, materialCatalog, materialCanManage = false, materialPending = false, materialError = null, onAddMaterial, onUpdateMaterial, onRemoveMaterial }: OrderDetailProps) {
  const actionable = actions.filter((action) => labels[action]);
  const primary = primaryByStatus[order.status];
  const ordered = primary && actionable.includes(primary)
    ? [primary, ...actionable.filter((action) => action !== primary)]
    : actionable;
  return <aside className="order-detail" aria-label={`Detalle de ${order.orderNumber}`}>
    <header><div><span>ORDEN DE TRABAJO</span><h2>{order.orderNumber}</h2><p>Versión {order.version}</p></div><div className="order-detail__actions">{onEdit && <button type="button" aria-label="Editar orden" onClick={onEdit}><Pencil size={17} /></button>}<button type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={18} /></button></div></header>
    <OrderRoute status={order.status} />
    <div className="order-detail__identity"><span><Building2 size={15} />{order.client.tradeName}</span><span><MapPin size={15} />{order.branch.name}</span><span><UserRound size={15} />{order.primaryTechnician?.fullName ?? "Sin responsable"}</span><span><Clock3 size={15} />{order.estimatedMinutes ? `${order.estimatedMinutes} min estimados` : "Sin estimación"}</span></div>
    <section><span className="order-detail__label">Problema reportado</span><h3>{order.reportedProblem}</h3>{order.description && <p>{order.description}</p>}</section>
    <section><span className="order-detail__label">Servicio</span><h3>{order.serviceType.name}</h3><p>Prioridad {order.priority.toLowerCase()} · {order.overdue ? "Agenda atrasada" : "Dentro de agenda"}</p></section>
    {materialCatalog && onAddMaterial && onUpdateMaterial && onRemoveMaterial && <OrderMaterials order={order} catalog={materialCatalog} canManage={materialCanManage} pending={materialPending} error={materialError} onAdd={onAddMaterial} onUpdate={onUpdateMaterial} onRemove={onRemoveMaterial} />}
    {actionError && <p className="order-detail__action-error" role="alert"><AlertTriangle size={15} />{actionError}</p>}
    {ordered.length > 0 && <footer className="order-detail__workflow">{ordered.map((action, index) => <button key={action} type="button" className={index === 0 ? "button button--primary" : "button button--ghost"} disabled={actionPending} onClick={() => onAction?.(action)}>{labels[action]}</button>)}</footer>}
  </aside>;
}
