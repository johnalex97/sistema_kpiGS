import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../api/http";
import type { PerformanceAnalyticsApi } from "../api/performance-analytics";
import type { PerformanceAnalyticsQuery, PerformanceAnalyticsSummary } from "../models/performance-analytics";

type State = { status: "loading"; data?: PerformanceAnalyticsSummary } | { status: "success" | "empty"; data: PerformanceAnalyticsSummary } | { status: "error"; data?: PerformanceAnalyticsSummary; message: string };
const keyOf = (query: PerformanceAnalyticsQuery) => JSON.stringify(query);

export function usePerformanceAnalytics(api: PerformanceAnalyticsApi, initialQuery: PerformanceAnalyticsQuery) {
  const [query, setQuery] = useState(initialQuery);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const generation = useRef(0);
  const begin = useCallback(() => setState((current) => ({ status: "loading", ...(current.status !== "error" && current.data ? { data: current.data } : {}) })), []);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    api.getSummary(query, controller.signal).then((data) => {
      if (generation.current !== current) return;
      setState({ status: data.rows.length === 0 ? "empty" : "success", data });
    }).catch((error: unknown) => {
      if (generation.current !== current || (error instanceof DOMException && error.name === "AbortError")) return;
      if (error instanceof ApiClientError && error.status === 403) { setState({ status: "error", message: error.message }); return; }
      setState((previous) => ({ status: "error", ...(previous.data ? { data: previous.data } : {}), message: error instanceof Error ? error.message : "No fue posible cargar el análisis" }));
    });
    return () => controller.abort();
  }, [api, query, revision]);
  return { state, query, setQuery: useCallback((next: PerformanceAnalyticsQuery) => { begin(); setQuery(next); }, [begin]), retry: useCallback(() => { begin(); setRevision((value) => value + 1); }, [begin]), exportCsv: useCallback((signal?: AbortSignal) => api.exportCsv(query, signal), [api, query]), queryKey: keyOf(query) };
}
