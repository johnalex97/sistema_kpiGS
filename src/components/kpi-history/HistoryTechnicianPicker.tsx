import { useEffect, useState } from "react";
import type { KpiHistoryApi } from "../../api/kpi-history";
import type { HistoryTechnician, HistoryTechnicianPage } from "../../models/kpi-history";
export function HistoryTechnicianPicker({ api, value, onSelect }: { api: KpiHistoryApi; value: HistoryTechnician | null; onSelect(technician: HistoryTechnician): void }) {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: HistoryTechnicianPage; error?: string } | null>(null);
  const key = JSON.stringify([search, page, revision]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = window.setTimeout(() => {
      void api.searchTechnicians({ search: search.trim(), page, pageSize: 20 }, controller.signal).then(data => {
        if (active) setResult({ key, data });
      }).catch(() => { if (active) setResult({ key, error: "No fue posible buscar técnicos." }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [api, search, page, key]);
  const current = result?.key === key ? result : null;
  return <div className="kpi-history__picker"><label>Buscar técnico por nombre o código<input type="search" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Nombre o código del técnico" /></label>
    {value && <p className="kpi-history__selection">Seleccionado: <strong>{value.fullName}</strong> · {value.code}{value.inactive ? " · Inactivo con historial" : ""}</p>}
    {!current && <p role="status">Buscando técnicos…</p>}
    {current?.error && <div role="alert">{current.error}<button type="button" onClick={() => setRevision(v => v + 1)}>Reintentar búsqueda</button></div>}
    {current?.data && <><ul aria-label="Técnicos disponibles para historial">{current.data.items.map(t => <li key={t.id}><button type="button" aria-pressed={value?.id === t.id} onClick={() => onSelect(t)}><strong>{t.fullName}</strong><span>{t.code}{t.inactive ? " · Inactivo con historial" : ""}</span></button></li>)}</ul>{current.data.items.length === 0 && <p>No hay técnicos para esta búsqueda.</p>}
      {current.data.pagination.totalPages > 1 && <nav aria-label="Páginas de técnicos"><button type="button" aria-label="Página anterior de técnicos" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span>Página {page} de {current.data.pagination.totalPages}</span><button type="button" aria-label="Siguiente página de técnicos" disabled={page >= current.data.pagination.totalPages} onClick={() => setPage(v => v + 1)}>Siguiente</button></nav>}</>}
  </div>;
}
