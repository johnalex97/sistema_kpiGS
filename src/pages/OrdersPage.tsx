import { AlertTriangle, Plus, RefreshCw, Search } from "lucide-react";
import { createOrderLookupApi, type OrderLookupApi } from "../api/order-lookups";
import { createOrdersApi, type OrdersApi } from "../api/orders";
import { OrderDetail } from "../components/orders/OrderDetail";
import { OrderFilters } from "../components/orders/OrderFilters";
import { OrderForm } from "../components/orders/OrderForm";
import { OrderTable } from "../components/orders/OrderTable";
import { useOrdersWorkspace, type OrdersWorkspace } from "../hooks/useOrdersWorkspace";
import "../components/orders/orders.css";

const defaultApi = createOrdersApi();
const defaultLookupApi = createOrderLookupApi();

interface OrdersPageProps {
  search?: string;
  api?: OrdersApi;
  lookupApi?: OrderLookupApi;
  workspace?: OrdersWorkspace;
}

function ConnectedOrdersPage({ search = "", api = defaultApi, lookupApi = defaultLookupApi }: Omit<OrdersPageProps, "workspace">) {
  const workspace = useOrdersWorkspace({ api, lookupApi, search });
  return <OrdersWorkspaceView workspace={workspace} lookupApi={lookupApi} />;
}

export function OrdersPage({ workspace, ...props }: OrdersPageProps) {
  return workspace
    ? <OrdersWorkspaceView workspace={workspace} lookupApi={props.lookupApi ?? defaultLookupApi} />
    : <ConnectedOrdersPage {...props} />;
}

function OrdersWorkspaceView({ workspace, lookupApi }: { workspace: OrdersWorkspace; lookupApi: OrderLookupApi }) {
  const page = workspace.list.data;
  const pagination = page?.pagination;
  return <section className="orders-workspace">
    <header className="orders-toolbar"><div><span>DESPACHO OPERATIVO</span><strong>{pagination?.totalItems ?? 0}</strong><p>órdenes en esta consulta</p></div><div><button type="button" className="button button--ghost" onClick={() => void workspace.refresh()}><RefreshCw size={15} />Actualizar</button>{workspace.capabilities.canManage && <button type="button" className="button button--primary" onClick={workspace.openCreate}><Plus size={15} />Nueva orden</button>}</div></header>
    <OrderFilters filters={workspace.filters} onChange={workspace.setFilters} />
    {workspace.list.stale && <div className="orders-notice" role="status"><AlertTriangle size={15} />Los datos pueden estar desactualizados. <button type="button" onClick={() => void workspace.refreshList()}>Reintentar</button></div>}
    <div className={`orders-register ${workspace.selectedOrderId ? "orders-register--detail" : ""}`}>
      <div className="orders-register__list">
        {workspace.list.status === "loading" && !page && <div className="orders-state" role="status"><span />Cargando órdenes…</div>}
        {workspace.list.status === "error" && !page && <div className="orders-state orders-state--error" role="alert"><AlertTriangle size={22} /><strong>No fue posible cargar las órdenes</strong><p>{workspace.list.error}</p><button type="button" className="button button--ghost" onClick={() => void workspace.refreshList()}>Reintentar</button></div>}
        {workspace.list.status === "success" && page?.items.length === 0 && <div className="orders-state"><Search size={25} /><strong>No hay órdenes para estos filtros</strong><p>Cambia los filtros o limpia la consulta para revisar otros trabajos.</p></div>}
        {page && page.items.length > 0 && <OrderTable items={page.items} selectedId={workspace.selectedOrderId} onOpen={workspace.selectOrder} />}
        {pagination && pagination.totalPages > 1 && <nav className="orders-pagination" aria-label="Paginación de órdenes"><button type="button" disabled={pagination.page <= 1} onClick={() => workspace.setPage(pagination.page - 1)}>Anterior</button><span>Página <b>{pagination.page}</b> de {pagination.totalPages}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => workspace.setPage(pagination.page + 1)}>Siguiente</button></nav>}
      </div>
      {workspace.selectedOrderId && <div className="orders-register__detail">{workspace.detail.status === "loading" && <div className="orders-state" role="status"><span />Cargando detalle…</div>}{workspace.detail.status === "error" && <div className="orders-state orders-state--error" role="alert"><strong>No fue posible abrir la orden</strong><p>{workspace.detail.error}</p><button type="button" onClick={workspace.closeDetail}>Cerrar</button></div>}{workspace.detail.data && <OrderDetail order={workspace.detail.data} onClose={workspace.closeDetail} onEdit={workspace.capabilities.canManage && ["PENDING", "ASSIGNED"].includes(workspace.detail.data.status) ? workspace.openEdit : undefined} />}</div>}
    </div>
    {workspace.form && workspace.catalog.data && <OrderForm mode={workspace.form.mode} order={workspace.form.order ?? undefined} catalog={workspace.catalog.data} lookupApi={lookupApi} pending={workspace.form.pending} error={workspace.form.error} fieldErrors={workspace.form.fieldErrors} onCancel={workspace.closeForm} onSubmit={workspace.submitOrder} />}
  </section>;
}
