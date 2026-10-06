import { useCallback, useEffect, useState } from "react";
import type { KpiHistoryApi } from "../api/kpi-history";
import type { HistoryQuery, HistorySeries } from "../models/kpi-history";

interface HistoryState { status: "idle" | "loading" | "success" | "error"; data?: HistorySeries; error?: string; }
export function useKpiHistory(api: KpiHistoryApi, id: string | null, query: HistoryQuery, session: string) {
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{ key: string; state: HistoryState } | null>(null);
  const { granularity, endDate } = query;
  const key = JSON.stringify([id, granularity, endDate, session, revision]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let active = true;
    const request: HistoryQuery = { granularity, ...(endDate ? { endDate } : {}) };
    void api.getTrend(id, request, controller.signal).then(data => {
      if (active) setResponse({ key, state: { status: "success", data } });
    }).catch((error: unknown) => {
      if (active) setResponse({ key, state: { status: "error", error: error instanceof Error ? error.message : "No fue posible cargar el historial" } });
    });
    return () => { active = false; controller.abort(); };
  }, [api, id, granularity, endDate, session, key]);
  const state: HistoryState = !id ? { status: "idle" } : response?.key === key ? response.state : { status: "loading" };
  const retry = useCallback(() => setRevision(value => value + 1), []);
  return { state, retry };
}
