import { type PropsWithChildren, useCallback, useEffect, useState } from "react";
import { createKpiApi } from "../../api/kpis";
import { ApiClientError } from "../../api/http";
import { useAuth } from "../../auth/useAuth";
import { currentWeekStart } from "../../hooks/technician-workspace.helpers";
import { WeeklyGoalContext, type WeeklyGoalState } from "./WeeklyGoalContext";

const api = createKpiApi();
export function WeeklyGoalProvider({ children, refreshKey }: PropsWithChildren<{ refreshKey: string }>) {
  const { user } = useAuth();
  const all = Boolean(user?.permissions.includes("KPI_VIEW_ALL"));
  const allowed = all || Boolean(user?.permissions.includes("KPI_VIEW_OWN") && user.technicianId);
  const identity = `${user?.id}:${all}:${user?.technicianId}:${allowed}:${user?.permissions.join(",")}`;
  const [revision, setRevision] = useState(0);
  const weekStart = currentWeekStart(new Date());
  const requestKey = `${identity}:${refreshKey}:${revision}:${weekStart}`;
  const [state, setState] = useState<WeeklyGoalState & { requestKey: string }>({ status: "loading", data: null, weekStart, refreshedAt: null, requestKey });
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const controller = new AbortController();
    api.getDashboard({ periodStart: weekStart, granularity: "WEEK" }, controller.signal).then(data => {
      if (!active) return;
      const scoped = all ? data : { ...data, items: data.items.filter(item => item.technicianId === user?.technicianId) };
      setState({ status: "ready", data: scoped, weekStart, refreshedAt: new Date().toISOString(), requestKey });
    }).catch(error => {
      if (active) setState({ status: "error", data: null, weekStart, refreshedAt: null, requestKey, errorCode: error instanceof ApiClientError ? error.code : undefined });
    });
    return () => { active = false; controller.abort(); };
  }, [allowed, all, requestKey, user?.technicianId, weekStart]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);
  const current = state.requestKey === requestKey ? state : { ...state, weekStart, status: "loading" as const, data: null, refreshedAt: null };
  return <WeeklyGoalContext.Provider value={allowed ? { ...current, api, refresh } : null}>{children}</WeeklyGoalContext.Provider>;
}
