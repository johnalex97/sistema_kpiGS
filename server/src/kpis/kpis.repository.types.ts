import type { KpiWeek, WeeklySourceRows } from "./kpis.types.js";

export type KpiAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export interface KpiFactsRepository {
  loadWeeklySources(week: KpiWeek, scope: KpiAccessScope): Promise<WeeklySourceRows>;
}
