import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { catalogsApi } from "../api/catalogs";
import { useAuth } from "../auth/useAuth";
import type { CatalogFields, CatalogHistoryEntry, CatalogItem, CatalogKind, CatalogPage } from "../models/catalog";
import "../components/users/users.css";
import "../components/catalogs/catalogs.css";

const labels: Record<CatalogKind, string> = { services: "Servicios", activities: "Actividades", "recurrence-causes": "Causas de reincidencia" };
function Pagination({ pagination, loading, onPage }: { pagination: CatalogPage<unknown>["pagination"]; loading: boolean; onPage: (page: number) => void }) {
  return <footer className="users-pagination"><span>{pagination.totalItems} registros · Página {pagination.page} de {Math.max(1, pagination.totalPages)}</span><div>
    <button type="button" className="button button--secondary" disabled={loading || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Anterior</button>
    <button type="button" className="button button--secondary" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>Siguiente</button>
  </div></footer>;
}
function historyChanges(entry: CatalogHistoryEntry) {
  const fields = ["code", "name", "description", "isActive", "displayOrder"] as const;
  const fieldLabels = { code: "Código", name: "Nombre", description: "Descripción", isActive: "Estado", displayOrder: "Orden" };
  const format = (field: typeof fields[number], value: unknown) => field === "isActive" ? value ? "Activa" : "Inactiva" : value == null || value === "" ? "Sin descripción" : String(value);
  return fields.filter(field => !entry.beforeData || entry.beforeData[field] !== entry.afterData[field]).map(field =>
    `${fieldLabels[field]}: ${entry.beforeData ? `${format(field, entry.beforeData[field])} → ` : ""}${format(field, entry.afterData[field])}`);
}
function CatalogHistory({ kind, item, onClose }: { kind: CatalogKind; item: CatalogItem; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const key = `${page}:${revision}`;
  const [state, setState] = useState<{ key: string; data: CatalogPage<CatalogHistoryEntry> | null; error: string | null }>({ key: "", data: null, error: null });
  const loading = state.key !== key;
  useEffect(() => {
    const controller = new AbortController();
    void catalogsApi.history(kind, item.id, page, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: error instanceof Error ? error.message : "No fue posible consultar el historial" });
    });
    return () => controller.abort();
  }, [kind, item.id, page, key]);
  return <section className="catalog-history" aria-labelledby="catalog-history-heading">
    <header><div><p className="eyebrow">Trazabilidad</p><h3 id="catalog-history-heading">Historial de {item.name}</h3></div><button type="button" className="button button--secondary" onClick={onClose}>Cerrar historial</button></header>
    {loading ? <p className="users-help">Consultando historial…</p> : state.error ? <p role="alert" className="users-error">{state.error} <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></p> : <>
      {state.data?.items.length === 0 && <p className="users-help">Esta opción no tiene cambios registrados desde Configuración.</p>}
      <ol>{state.data?.items.map(entry => <li key={entry.id}><p><strong>{entry.action === "CATALOG_CREATED" ? "Creación" : "Actualización"} · {entry.actor?.displayName ?? "Usuario no disponible"}</strong><time dateTime={entry.occurredAt}>{new Intl.DateTimeFormat("es-HN", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Tegucigalpa" }).format(new Date(entry.occurredAt))} · Honduras</time></p><ul>{historyChanges(entry).map(change => <li key={change}>{change}</li>)}</ul></li>)}</ol>
      {state.data && <Pagination pagination={state.data.pagination} loading={loading} onPage={setPage} />}
    </>}
  </section>;
}
function CatalogEditor({ kind, item, onCancel, onSaved, onSavingChange }: { kind: CatalogKind; item: CatalogItem | null; onCancel: () => void; onSaved: (message: string) => void; onSavingChange: (saving: boolean) => void }) {
  const [code, setCode] = useState(item?.code ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [order, setOrder] = useState(String(item?.displayOrder ?? 0));
  const [active, setActive] = useState(item?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const displayOrder = Number(order);
    if (!name.trim() || !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000 || (!item && !/^[A-Z][A-Z0-9_-]{0,49}$/.test(code.trim().toUpperCase()))) {
      setError("Revisa el nombre, el código y el orden de aparición"); return;
    }
    savingRef.current = true; setSaving(true); onSavingChange(true); setError(null);
    const input: CatalogFields = { name: name.trim(), description: description.trim() || null, displayOrder, isActive: active };
    try {
      if (item) await catalogsApi.update(kind, item, input);
      else await catalogsApi.create(kind, { ...input, code: code.trim().toUpperCase() });
      onSaved(item ? "Opción actualizada" : "Opción creada");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No fue posible guardar la opción"); }
    finally { savingRef.current = false; setSaving(false); onSavingChange(false); }
  }
  return <form className="users-form catalog-editor" aria-labelledby="catalog-editor-heading" onSubmit={event => void submit(event)}>
    <h3 id="catalog-editor-heading">{item ? `Editar ${item.name}` : `Nueva opción · ${labels[kind]}`}</h3>
    <fieldset disabled={saving}><div className="users-fields">
      <label htmlFor="catalog-code">Código interno<input id="catalog-code" value={code} readOnly={Boolean(item)} onChange={event => setCode(event.target.value.toUpperCase())} required maxLength={50} aria-describedby="catalog-code-help" autoFocus={!item} /></label>
      <label htmlFor="catalog-name">Nombre<input id="catalog-name" value={name} onChange={event => setName(event.target.value)} required maxLength={kind === "recurrence-causes" ? 160 : 120} autoFocus={Boolean(item)} /></label>
      <label htmlFor="catalog-description">Descripción<textarea id="catalog-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={3} /></label>
      <label htmlFor="catalog-order">Orden de aparición<input id="catalog-order" type="number" value={order} onChange={event => setOrder(event.target.value)} required min={0} max={100000} step={1} /><span className="users-help">Los números menores aparecen primero.</span></label>
    </div><p id="catalog-code-help" className="users-help">El código permanece fijo después de crear la opción. Usa letras, números, guion o guion bajo; empieza con una letra.</p>
    <label className="catalog-active"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Disponible en nuevos trabajos</label>
    <p className="catalog-retention">Los trabajos existentes conservarán esta opción aunque la desactives. No se eliminan registros históricos.</p></fieldset>
    {error && <p className="users-error" role="alert">{error}. Si la opción cambió, cancela, actualiza el listado y vuelve a editar.</p>}
    <div className="users-actions"><button type="button" className="button button--secondary" disabled={saving} onClick={onCancel}>Cancelar</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? "Guardando…" : item ? "Guardar cambios" : "Crear opción"}</button></div>
  </form>;
}
function CatalogWorkspace({ kind, onSavingChange }: { kind: CatalogKind; onSavingChange: (saving: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([page, query, revision]);
  const [state, setState] = useState<{ key: string; data: CatalogPage<CatalogItem> | null; error: string | null }>({ key: "", data: null, error: null });
  const loading = state.key !== key;
  const [editor, setEditor] = useState<{ item: CatalogItem | null } | null>(null);
  const [history, setHistory] = useState<CatalogItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void catalogsApi.list(kind, query, page, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState(current => ({ key, data: current.data, error: error instanceof Error ? error.message : "No fue posible consultar el catálogo" }));
    });
    return () => controller.abort();
  }, [kind, query, page, key]);
  return <>
    <header className="catalog-toolbar"><div><h3>{labels[kind]}</h3><p>Opciones activas e inactivas para clasificar el trabajo del equipo.</p></div><button type="button" className="button button--primary" disabled={Boolean(editor)} onClick={() => { setNotice(null); setHistory(null); setEditor({ item: null }); }}><Plus size={17} aria-hidden="true" />Nueva opción</button></header>
    {notice && <p className="users-notice" role="status">{notice}</p>}
    {editor && <CatalogEditor key={editor.item?.id ?? "new"} kind={kind} item={editor.item} onSavingChange={onSavingChange} onCancel={() => setEditor(null)} onSaved={message => { setEditor(null); setNotice(message); setHistory(null); setSearch(""); setQuery(""); setPage(1); setRevision(value => value + 1); }} />}
    {!editor && <form className="users-search" onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); setRevision(value => value + 1); }}>
      <label htmlFor="catalog-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar catálogo por nombre o código</span><input id="catalog-search" value={search} maxLength={160} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre o código" /></label>
      <button type="submit" className="button button--secondary" disabled={loading}>Buscar</button><button type="button" className="button button--secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Actualizar</button>
    </form>}
    {loading ? <p className="catalog-loading">Consultando catálogo…</p> : state.error ? <p className="users-error" role="alert">{state.error} <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></p> : state.data && <>
      <div className="users-table-wrap"><table className="users-table catalog-table"><caption className="sr-only">Opciones de {labels[kind]}</caption><thead><tr><th scope="col">Opción</th><th scope="col">Estado</th><th scope="col">Orden</th><th scope="col">Acciones</th></tr></thead><tbody>{state.data.items.map(item => <tr key={item.id}><td><strong>{item.name}</strong><code>{item.code}</code>{item.description && <span>{item.description}</span>}</td><td><span className={`users-badge ${item.isActive ? "is-active" : ""}`}>{item.isActive ? "Activa" : "Inactiva"}</span></td><td className="mono">{item.displayOrder}</td><td><div className="catalog-row-actions"><button type="button" className="button button--secondary" aria-label={`Editar ${item.name}`} disabled={Boolean(editor)} onClick={() => { setNotice(null); setHistory(null); setEditor({ item }); }}>Editar</button><button type="button" className="button button--secondary" aria-label={`Ver cambios de ${item.name}`} disabled={Boolean(editor)} onClick={() => setHistory(item)}>Ver cambios</button></div></td></tr>)}</tbody></table></div>
      {state.data.items.length === 0 && <p className="users-empty">No hay opciones para esta búsqueda. Usa Nueva opción para agregar una.</p>}
      {!editor && <Pagination pagination={state.data.pagination} loading={loading} onPage={setPage} />}
    </>}
    {history && <CatalogHistory key={history.id} kind={kind} item={history} onClose={() => setHistory(null)} />}
  </>;
}
export function CatalogsSettingsPage({ onSavingChange }: { onSavingChange?: (saving: boolean) => void }) {
  const { user, hasPermission } = useAuth();
  const [kind, setKind] = useState<CatalogKind>("services");
  const [saving, setSaving] = useState(false);
  if (!user?.roles.includes("ADMIN") || !hasPermission("USERS_MANAGE")) return <p>No tienes permiso para administrar catálogos.</p>;
  return <section className="users-workspace catalogs-workspace" aria-labelledby="catalogs-heading"><header className="users-header"><div><p className="eyebrow">Clasificación del trabajo</p><h2 id="catalogs-heading">Catálogos</h2><p>Define las opciones del equipo sin eliminar su historial.</p></div></header>
    <nav className="catalog-kinds" aria-label="Tipos de catálogo">{(Object.keys(labels) as CatalogKind[]).map(value => <button type="button" disabled={saving} key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{labels[value]}</button>)}</nav>
    <CatalogWorkspace key={kind} kind={kind} onSavingChange={value => { setSaving(value); onSavingChange?.(value); }} />
  </section>;
}
