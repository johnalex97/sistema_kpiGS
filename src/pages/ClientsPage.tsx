import { useRef } from "react";
import { AlertTriangle, RefreshCw, Search, UserRoundPlus } from "lucide-react";
import { createClientsApi, type ClientsApi } from "../api/clients";
import { useAuth } from "../auth/useAuth";
import { ClientDetail } from "../components/clients/ClientDetail";
import { BranchForm } from "../components/clients/BranchForm";
import { ClientForm } from "../components/clients/ClientForm";
import { BranchLifecycleDialog, ClientLifecycleDialog } from "../components/clients/ClientLifecycleDialog";
import { ClientFilters } from "../components/clients/ClientFilters";
import { ClientTable } from "../components/clients/ClientTable";
import { ClientWizard } from "../components/clients/ClientWizard";
import "../components/clients/clients.css";
import { useClientsWorkspace, type ClientsWorkspace } from "../hooks/useClientsWorkspace";

const defaultApi = createClientsApi();

export interface ClientsPageProps {
  search?: string;
  onClearSearch?: () => void;
  api?: ClientsApi;
  workspace?: ClientsWorkspace;
}

function ConnectedClientsPage({ search = "", onClearSearch, api }: Omit<ClientsPageProps, "workspace">) {
  const { user } = useAuth();
  const workspace = useClientsWorkspace({ api: api ?? defaultApi, permissions: user?.permissions ?? [], search });
  return <ClientsWorkspaceView workspace={workspace} onClearSearch={onClearSearch} />;
}

export function ClientsPage({ workspace, ...props }: ClientsPageProps) {
  return workspace ? <ClientsWorkspaceView workspace={workspace} onClearSearch={props.onClearSearch} /> : <ConnectedClientsPage {...props} />;
}

function ClientsWorkspaceView({ workspace, onClearSearch }: { workspace: ClientsWorkspace; onClearSearch?: () => void }) {
  const { hasPermission } = useAuth();
  const canManage = workspace.capabilities.canManage && hasPermission("CLIENTS_MANAGE");
  const triggerRef = useRef<HTMLElement | null>(null);
  const { list, detail, query } = workspace;
  const pagination = list.data?.pagination;
  const hasDetail = Boolean(query.clientId);
  const selected = detail.data?.id === query.clientId ? detail.data : null;
  const lifecycleBranch = workspace.branchLifecycle?.open
    ? workspace.branches.data?.items.find((branch) => branch.id === workspace.branchLifecycle?.branchId)
      ?? selected?.branches.find((branch) => branch.id === workspace.branchLifecycle?.branchId)
    : null;
  const open = (id: string) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    workspace.selectClient(id);
  };
  const close = () => {
    workspace.closeDetail();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  return <section className={`panel clients-workspace ${hasDetail ? "clients-workspace--detail" : ""}`} aria-label="Registro de clientes">
    <header className="clients-toolbar">
      <div><p className="eyebrow">Directorio de servicio</p><h2>Registro de clientes</h2><p>{pagination ? `${pagination.totalItems} ${pagination.totalItems === 1 ? "cliente" : "clientes"}` : "Empresas atendidas por Geek Solution"}</p></div>
      <div className="clients-toolbar__actions"><button className="button button--ghost" type="button" onClick={() => void workspace.refreshList()}><RefreshCw size={16} aria-hidden="true" />Actualizar</button>
        {canManage && <button className="button button--primary" type="button" onClick={() => workspace.openCreate?.()}><UserRoundPlus size={16} aria-hidden="true" />Nuevo cliente</button>}</div>
    </header>
    <ClientFilters filters={query.clients} onChange={workspace.setClientFilters} onClear={() => { onClearSearch?.(); workspace.clearClientFilters(); }} />
    <div className="clients-layout">
      <div className="clients-list">
        {list.stale && <div className="clients-notice" role="status"><AlertTriangle size={16} aria-hidden="true" />Datos posiblemente desactualizados. {list.error}<button type="button" onClick={() => void workspace.refreshList()}>Reintentar</button></div>}
        {list.status === "loading" && !list.data && <p className="clients-state" role="status">Cargando clientes…</p>}
        {list.status === "loading" && list.data && <p className="clients-state clients-state--compact" role="status">Actualizando clientes…</p>}
        {list.status === "error" && !list.data && <div className="clients-state" role="alert"><strong>No fue posible cargar los clientes</strong><p>{list.error}</p><button className="button button--ghost" type="button" onClick={() => void workspace.refreshList()}>Reintentar</button></div>}
        {list.status === "success" && list.data?.items.length === 0 && <div className="clients-state clients-state--empty"><Search size={25} aria-hidden="true" /><strong>No hay clientes para estos filtros</strong><p>Ajusta el estado o la búsqueda para ampliar los resultados.</p>{query.clients.search && <button className="button button--ghost" type="button" onClick={() => { onClearSearch?.(); workspace.setClientFilters({ search: undefined, page: 1 }); }}>Limpiar búsqueda</button>}</div>}
        {list.data && list.data.items.length > 0 && <ClientTable clients={list.data.items} selectedId={query.clientId} onSelect={open} />}
        {pagination && pagination.totalPages > 1 && <nav className="clients-pagination" aria-label="Paginación de clientes"><button className="button button--ghost" type="button" disabled={pagination.page <= 1} onClick={() => workspace.setClientFilters({ page: pagination.page - 1 })}>Anterior</button><span>Página {pagination.page} de {pagination.totalPages}</span><button className="button button--ghost" type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => workspace.setClientFilters({ page: pagination.page + 1 })}>Siguiente</button></nav>}
      </div>
      {hasDetail && <div className="clients-detail-region">
        {selected && detail.stale && <div className="clients-notice clients-detail-notice" role="status"><AlertTriangle size={16} aria-hidden="true" /><span>Ficha posiblemente desactualizada. {detail.error}</span><button type="button" onClick={() => void workspace.refreshDetail()}>Reintentar ficha</button></div>}
        {selected && detail.status === "loading" && <p className="clients-detail-loading" role="status">Actualizando ficha del cliente…</p>}
        {selected && <ClientDetail client={selected} tab={query.tab} onTabChange={workspace.setTab} onClose={close} canManage={canManage && Boolean(workspace.openEdit && workspace.openClientLifecycle)} onEdit={() => workspace.openEdit?.()} onLifecycle={(action) => workspace.openClientLifecycle?.(action)} branches={workspace.branches} branchFilters={query.branches} onBranchFiltersChange={workspace.setBranchFilters} onRefreshBranches={() => void workspace.refreshBranches()} onBranchCreate={() => workspace.openBranchCreate?.()} onBranchEdit={(branch) => workspace.openBranchEdit?.(branch)} onBranchLifecycle={(branch, action) => workspace.openBranchLifecycle?.(branch, action)} branchClientActive={workspace.branchClientActive} contacts={workspace.contacts} contactFilters={query.contacts} onContactFiltersChange={workspace.setContactFilters} onRefreshContacts={() => void workspace.refreshContacts()} />}
        {!selected && <div className="clients-detail-state" role={detail.status === "error" ? "alert" : "status"}>
          <strong>{detail.status === "error" ? "No fue posible cargar la ficha" : "Cargando ficha del cliente…"}</strong>
          {detail.status === "error" && <><p>{detail.error}</p><button className="button button--ghost" type="button" onClick={() => void workspace.refreshDetail()}>Reintentar ficha</button></>}
          <button className="button button--ghost" type="button" onClick={close}>Cerrar ficha</button>
        </div>}
      </div>}
    </div>
    {canManage && workspace.create?.open && <ClientWizard pending={workspace.create.pending} error={workspace.create.error} fieldErrors={workspace.create.fieldErrors} onSubmit={workspace.submitCreate ?? (async () => {})} onClose={() => workspace.closeForm?.()} />}
    {canManage && selected && workspace.edit?.open && workspace.edit.draft && <ClientForm client={selected} draft={workspace.edit.draft} pending={workspace.edit.pending} reviewPending={workspace.edit.reviewPending} error={workspace.edit.error} reviewError={workspace.edit.reviewError} versionConflict={workspace.edit.versionConflict} fieldErrors={workspace.edit.fieldErrors} onChange={(patch) => workspace.changeClientEdit?.(patch)} onSubmit={async (values) => workspace.submitClientEdit?.(values)} onClose={() => workspace.closeForm?.()} onReview={async () => workspace.reviewClientConflict?.()} onAdopt={() => workspace.adoptClientConflict?.()} />}
    {canManage && selected && workspace.lifecycle?.open && <ClientLifecycleDialog client={selected} action={workspace.lifecycle.action} baseVersion={workspace.lifecycle.baseVersion} reason={workspace.lifecycle.reason} pending={workspace.lifecycle.pending} reviewPending={workspace.lifecycle.reviewPending} error={workspace.lifecycle.error} reviewError={workspace.lifecycle.reviewError} versionConflict={workspace.lifecycle.versionConflict} conflict={workspace.lifecycle.conflict} fieldErrors={workspace.lifecycle.fieldErrors} onReasonChange={(reason) => workspace.changeClientLifecycleReason?.(reason)} onSubmit={async (reason) => workspace.submitClientLifecycle?.(reason)} onClose={() => workspace.closeForm?.()} onReview={async () => workspace.reviewClientConflict?.()} onAdopt={() => workspace.adoptClientConflict?.()} />}
    {canManage && selected?.isActive && workspace.branchClientActive !== false && workspace.branchForm?.open && workspace.branchForm.draft && <BranchForm mode={workspace.branchForm.mode} draft={workspace.branchForm.draft} pending={workspace.branchForm.pending} reviewPending={workspace.branchForm.reviewPending} error={workspace.branchForm.error} reviewError={workspace.branchForm.reviewError} versionConflict={workspace.branchForm.versionConflict} fieldErrors={workspace.branchForm.fieldErrors} onChange={(patch) => workspace.changeBranchForm?.(patch)} onSubmit={async (values) => workspace.submitBranchForm?.(values)} onClose={() => workspace.closeBranchDialogs?.()} onReview={async () => workspace.reviewBranchConflict?.()} onAdopt={() => workspace.adoptBranchConflict?.()} />}
    {canManage && selected?.isActive && workspace.branchClientActive !== false && lifecycleBranch && workspace.branchLifecycle?.open && <BranchLifecycleDialog branch={lifecycleBranch} action={workspace.branchLifecycle.action} baseVersion={workspace.branchLifecycle.baseVersion} reason={workspace.branchLifecycle.reason} pending={workspace.branchLifecycle.pending} reviewPending={workspace.branchLifecycle.reviewPending} error={workspace.branchLifecycle.error} reviewError={workspace.branchLifecycle.reviewError} versionConflict={workspace.branchLifecycle.versionConflict} conflict={workspace.branchLifecycle.conflict} fieldErrors={workspace.branchLifecycle.fieldErrors} onReasonChange={(reason) => workspace.changeBranchLifecycleReason?.(reason)} onSubmit={async (reason) => workspace.submitBranchLifecycle?.(reason)} onClose={() => workspace.closeBranchDialogs?.()} onReview={async () => workspace.reviewBranchConflict?.()} onAdopt={() => workspace.adoptBranchConflict?.()} />}
  </section>;
}
