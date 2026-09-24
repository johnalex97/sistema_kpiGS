import { AlertTriangle, Building2, Clock3, MapPin, Pencil, UserRound, X } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import type { OrderEvidenceApi } from "../../api/evidences";
import type { Evidence, EvidenceUploadInput } from "../../models/evidence";
import type { OrdersApi } from "../../api/orders";
import type { OrderAction } from "../../hooks/order-workspace.helpers";
import type { OrderCatalog, OrderDetail as Detail } from "../../models/order";
import { OrderRoute } from "./OrderRoute";
import { OrderMaterials } from "./OrderMaterials";
import { OrderEvidencePanel } from "./OrderEvidencePanel";
import { OrderHistory } from "./OrderHistory";

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

const statusLabels: Record<Detail["status"], string> = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignada",
  ON_ROUTE: "En camino",
  IN_PROGRESS: "En progreso",
  PAUSED: "Pausada",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
};

const detailAreas = ["summary", "team", "materials", "evidence", "history"] as const;
type DetailArea = typeof detailAreas[number];

const areaLabels: Record<DetailArea, string> = {
  summary: "Resumen",
  team: "Equipo",
  materials: "Materiales",
  evidence: "Evidencias",
  history: "Historial",
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
  ordersApi?: Pick<OrdersApi, "history">;
  historyState?: { status: "idle" | "loading" | "success" | "error"; data: import("../../models/order").OrderHistoryPage | null; error: string | null };
  onLoadHistory?: (page?: number) => Promise<void>;
  evidenceApi?: Pick<OrderEvidenceApi, "listOrder">;
  canViewEvidence?: boolean;
  canUploadEvidence?: boolean;
  canManageEvidence?: boolean;
  evidenceError?: string | null;
  evidencePending?: boolean;
  onUploadEvidence?: (input: EvidenceUploadInput) => Promise<boolean>;
  onDownloadEvidence?: (evidence: Evidence) => Promise<boolean>;
  onArchiveEvidence?: (evidence: Evidence, reason: string) => Promise<boolean>;
  onEvidenceReadInvalidated?: (status: 403 | 404) => void;
}

export function OrderDetail({ order, actions = [], actionPending = false, actionError = null, onClose, onEdit, onAction, materialCatalog, materialCanManage = false, materialPending = false, materialError = null, onAddMaterial, onUpdateMaterial, onRemoveMaterial, ordersApi, historyState, onLoadHistory, evidenceApi, canViewEvidence = false, canUploadEvidence = false, canManageEvidence = false, evidenceError = null, onUploadEvidence, onDownloadEvidence, onArchiveEvidence, onEvidenceReadInvalidated }: OrderDetailProps) {
  const [area, setArea] = useState<DetailArea>("summary");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const actionable = actions.filter((action) => labels[action]);
  const primary = primaryByStatus[order.status];
  const ordered = primary && actionable.includes(primary)
    ? [primary, ...actionable.filter((action) => action !== primary)]
    : actionable;
  const selectAreaFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % detailAreas.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + detailAreas.length) % detailAreas.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = detailAreas.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setArea(detailAreas[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };
  const panelId = `order-detail-${order.id}-${area}-panel`;
  return <aside className="order-detail" aria-label={`Detalle de ${order.orderNumber}`}>
    <header><div><span>ORDEN DE TRABAJO</span><h2>{order.orderNumber}</h2><p>Versión {order.version}</p></div><div className="order-detail__actions">{onEdit && <button type="button" aria-label="Editar orden" onClick={onEdit}><Pencil size={17} /></button>}<button type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={18} /></button></div></header>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{order.orderNumber}: {statusLabels[order.status]}. Versión {order.version}.</p>
    <OrderRoute status={order.status} />
    <nav className="order-detail__areas" aria-label="Áreas del detalle" role="tablist">{detailAreas.map((key, index) => <button
      type="button"
      role="tab"
      id={`order-detail-${order.id}-${key}-tab`}
      aria-controls={`order-detail-${order.id}-${key}-panel`}
      aria-selected={area === key}
      tabIndex={area === key ? 0 : -1}
      key={key}
      ref={(node) => { tabRefs.current[index] = node; }}
      onClick={() => setArea(key)}
      onKeyDown={(event) => selectAreaFromKeyboard(event, index)}
    >{areaLabels[key]}</button>)}</nav>
    <div className="order-detail__tabpanel" id={panelId} role="tabpanel" aria-labelledby={`order-detail-${order.id}-${area}-tab`}>
      {area === "summary" && <>
        <div className="order-detail__identity"><span><Building2 size={15} />{order.client.tradeName}</span><span><MapPin size={15} />{order.branch.name}</span><span><UserRound size={15} />{order.primaryTechnician?.fullName ?? "Sin responsable"}</span><span><Clock3 size={15} />{order.estimatedMinutes ? `${order.estimatedMinutes} min estimados` : "Sin estimación"}</span></div>
        <section><span className="order-detail__label">Problema reportado</span><h3>{order.reportedProblem}</h3>{order.description && <p>{order.description}</p>}</section>
        <section><span className="order-detail__label">Servicio</span><h3>{order.serviceType.name}</h3><p>Prioridad {order.priority.toLowerCase()} · {order.overdue ? "Agenda atrasada" : "Dentro de agenda"}</p></section>
        <section aria-label="Agenda y tiempos"><h3>Agenda y tiempos</h3>{([["Agenda", order.scheduledFor], ["Inicio real", order.startedAt], ["Fin real", order.endedAt]] as const).map(([label, value]) => <p key={label}>{label}: {value ? new Date(value).toLocaleString("es-HN", { timeZone: "America/Tegucigalpa" }) : "Sin registrar"}</p>)}<p>{order.totalMinutes === null ? "Sin duración real" : `${order.totalMinutes} min reales`}</p></section>
        {order.diagnosis && <section><h3>Diagnóstico</h3><p>{order.diagnosis}</p></section>}
        {order.result && <section><h3>Resultado</h3><p>{order.result}</p></section>}
        {order.cancellationReason && <section><h3>Motivo de cancelación</h3><p>{order.cancellationReason}</p></section>}
      </>}
      {area === "team" && <section aria-label="Equipo de la orden"><h3>Equipo</h3><p>Principal: {order.primaryTechnician?.fullName ?? "Sin responsable"}</p>{order.participants.length === 0 ? <p>Sin participaciones registradas.</p> : <ul>{order.participants.map((participant) => <li key={`${participant.id}-${participant.assignedAt}`}><strong>{participant.fullName}</strong><p>{participant.role === "PRIMARY" ? "Principal" : "Apoyo"} · {participant.active ? "Activo" : "Histórico"}</p></li>)}</ul>}</section>}
      {area === "materials" && materialCatalog && onAddMaterial && onUpdateMaterial && onRemoveMaterial && <OrderMaterials order={order} catalog={materialCatalog} canManage={materialCanManage} pending={materialPending} error={materialError} onAdd={onAddMaterial} onUpdate={onUpdateMaterial} onRemove={onRemoveMaterial} />}
      {area === "evidence" && evidenceApi && onUploadEvidence && onDownloadEvidence && onArchiveEvidence && <OrderEvidencePanel onReadInvalidated={onEvidenceReadInvalidated} orderId={order.id} orderNumber={order.orderNumber} evidenceApi={evidenceApi} canView={canViewEvidence} canUpload={canUploadEvidence} canManage={canManageEvidence} error={evidenceError} onUpload={onUploadEvidence} onDownload={onDownloadEvidence} onArchive={onArchiveEvidence} />}
      {area === "history" && ordersApi && <OrderHistory orderId={order.id} api={ordersApi} canView={true} historyState={historyState} onLoadHistory={onLoadHistory} />}
    </div>
    {actionError && <p className="order-detail__action-error" role="alert"><AlertTriangle size={15} />{actionError}</p>}
    {ordered.length > 0 && <footer className="order-detail__workflow">{ordered.map((action, index) => <button key={action} type="button" className={index === 0 ? "button button--primary" : "button button--ghost"} disabled={actionPending} onClick={() => onAction?.(action)}>{labels[action]}</button>)}</footer>}
  </aside>;
}
