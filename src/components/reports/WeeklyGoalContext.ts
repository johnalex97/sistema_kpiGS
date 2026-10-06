import { createContext, useContext } from "react";
import type { KpiApi } from "../../api/kpis";
import type { KpiDashboardData } from "../../models/kpi";

export interface WeeklyGoalState {
  status: "loading" | "ready" | "error";
  data: KpiDashboardData | null;
  weekStart: string;
  refreshedAt: string | null;
  errorCode?: string;
}
export interface WeeklyGoalValue extends WeeklyGoalState {
  api: KpiApi;
  refresh: () => void;
}
export const WeeklyGoalContext = createContext<WeeklyGoalValue | null>(null);
export const useWeeklyGoal = () => useContext(WeeklyGoalContext);
