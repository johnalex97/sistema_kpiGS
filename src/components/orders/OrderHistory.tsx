import { AlertTriangle, History as HistoryIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrdersApi } from "../../api/orders";
import type { OrderHistoryPage } from "../../models/order";

export interface OrderHistoryProps {
  orderId: string;
  api: Pick<OrdersApi, "history">;
  canView: boolean;
  historyState?: { status: "idle" | "loading" | "success" | "error"; data: OrderHistoryPage | null; error: string | null };
  onLoadHistory?: (page?: number) => Promise<void>;
}

export function OrderHistory({ orderId, api, canView, historyState, onLoadHistory }: OrderHistoryProps) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "success" | "error"; data: OrderHistoryPage | null }>({ status: canView ? "loading" : "idle", data: null });
  const [localPage, setPage] = useState(1);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const load = useCallback(async (requestedPage: number) => {
    if (!canView) return;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const generation = ++generationRef.current;
    setState((current) => ({ status: "loading", data: current.data }));
    try {
      const data = await api.history(orderId, requestedPage, controller.signal);
      if (!controller.signal.aborted && generation === generationRef.current) { setPage(requestedPage); setState({ status: "success", data }); }
    } catch (error: unknown) {
      if (!controller.signal.aborted && generation === generationRef.current && !(error instanceof Error && error.name === "AbortError")) setState((current) => ({ status: "error", data: current.data }));
    } finally { if (controllerRef.current === controller) controllerRef.current = null; }
  }, [api, canView, orderId]);
  useEffect(() => {
    if (!canView) {
      generationRef.current += 1; controllerRef.current?.abort(); controllerRef.current = null;
      let active = true;
      void Promise.resolve().then(() => { if (active) { setPage(1); setState({ status: "idle", data: null }); } });
      return () => { active = false; };
    }
    let active = true;
    void Promise.resolve().then(() => { if (active) void (onLoadHistory ? onLoadHistory(1) : load(1)); });
    return () => { active = false; generationRef.current += 1; controllerRef.current?.abort(); controllerRef.current = null; };
  }, [canView, load, onLoadHistory, orderId]);
  if (!canView) return <section className="order-history" aria-label="Historial"><p>El historial no está disponible para tu perfil.</p></section>;
  const shown = historyState ?? state;
  const data = shown.data;
  const page = historyState?.data?.pagination.page ?? localPage;
  const loadPage = (requested: number) => onLoadHistory ? onLoadHistory(requested) : load(requested);
  return <section className="order-history" aria-label="Historial de la orden"><header><span><HistoryIcon size={15} /> AUDITORÍA</span><h3>Historial de cambios</h3></header>{shown.status === "loading" && !data && <p role="status">Cargando historial…</p>}{shown.status === "error" && <div role="alert"><AlertTriangle size={15} />No fue posible cargar el historial.<button type="button" onClick={() => void loadPage(page)}>Reintentar historial</button></div>}{shown.status === "success" && data?.items.length === 0 && <p role="status">No hay movimientos registrados.</p>}{data && data.items.length > 0 && <ol>{data.items.map((item) => <li key={item.id}><strong>{item.action}</strong>{item.previousStatus && item.newStatus && <span>{item.previousStatus} → {item.newStatus}</span>}{item.comment && <p>{item.comment}</p>}<small>{item.user?.displayName ?? "Sistema"} · {new Date(item.occurredAt).toLocaleString("es-HN", { timeZone: "America/Tegucigalpa" })}</small></li>)}</ol>}{data && data.pagination.totalPages > 1 && <nav aria-label="Paginación del historial"><button type="button" aria-label="Página anterior del historial" disabled={page <= 1 || shown.status === "loading"} onClick={() => void loadPage(page - 1)}>Anterior</button><span>Página {page} de {data.pagination.totalPages}</span><button type="button" aria-label="Siguiente página del historial" disabled={page >= data.pagination.totalPages || shown.status === "loading"} onClick={() => void loadPage(page + 1)}>Siguiente</button></nav>}</section>;
}
