import { requestJson } from "./http";
import type { OperationalDashboard } from "../models/dashboard";

export interface OperationalDashboardApi {
  getOperationalDashboard(date?: string, signal?: AbortSignal): Promise<OperationalDashboard>;
}

export function createOperationalDashboardApi(): OperationalDashboardApi {
  return {
    getOperationalDashboard(date, signal) {
      const query = date === undefined ? "" : `?date=${encodeURIComponent(date)}`;
      return requestJson<OperationalDashboard>(`/dashboard/operational${query}`, { signal });
    },
  };
}
