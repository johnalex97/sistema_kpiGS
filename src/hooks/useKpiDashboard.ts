import { useCallback, useEffect, useState } from "react";
import type { KpiApi } from "../api/kpis";
import type { KpiDashboardData, KpiGranularity, KpiPeriod } from "../models/kpi";

type State = { status: "loading"; data?: KpiDashboardData } | { status: "success" | "empty"; data: KpiDashboardData } | { status: "error"; data?: KpiDashboardData; message: string };
function shift(period: KpiPeriod, direction: number): KpiPeriod {
  const date = new Date(`${period.periodStart}T00:00:00.000Z`);
  if (period.granularity === "WEEK") date.setUTCDate(date.getUTCDate() + direction * 7);
  else if (period.granularity === "MONTH") date.setUTCMonth(date.getUTCMonth() + direction);
  else date.setUTCFullYear(date.getUTCFullYear() + direction);
  return { ...period, periodStart: date.toISOString().slice(0, 10) };
}
export function useKpiDashboard(api: KpiApi, initialPeriod: KpiPeriod) {
  const [period, setPeriod] = useState(initialPeriod);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const beginLoading = useCallback(() => {
    setState((current) => ({ status: "loading", ...(current.data ? { data: current.data } : {}) }));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.getDashboard(period, controller.signal).then((data) => {
      setState({ status: data.items.length === 0 ? "empty" : "success", data });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState((current) => ({ status: "error", ...(current.data ? { data: current.data } : {}), message: error instanceof Error ? error.message : "No fue posible cargar los KPI" }));
    });
    return () => controller.abort();
  }, [api, period, revision]);
  return {
    state, period,
    setGranularity: useCallback((granularity: KpiGranularity) => { beginLoading(); setPeriod((current) => ({ ...current, granularity })); }, [beginLoading]),
    previous: useCallback(() => { beginLoading(); setPeriod((current) => shift(current, -1)); }, [beginLoading]),
    next: useCallback(() => { beginLoading(); setPeriod((current) => shift(current, 1)); }, [beginLoading]),
    retry: useCallback(() => { beginLoading(); setRevision((current) => current + 1); }, [beginLoading]),
  };
}
