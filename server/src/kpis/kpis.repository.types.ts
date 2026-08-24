import type { KpiWeek, WeeklySourceRows } from "./kpis.types.js";
import type { CreateConfigurationInput, CreateTargetInput, UpdateTargetInput } from "./kpis.schemas.js";
import type { KpiActorContext } from "./kpis.types.js";

export type KpiAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export interface KpiFactsRepository {
  loadWeeklySources(week: KpiWeek, scope: KpiAccessScope): Promise<WeeklySourceRows>;
}

export interface KpiManagementRepository {
  listTargets(week: KpiWeek): Promise<unknown[]>;
  createTarget(input: CreateTargetInput, actor: KpiActorContext): Promise<unknown>;
  updateTarget(targetId: string, input: UpdateTargetInput, actor: KpiActorContext): Promise<unknown>;
  listConfigurations(): Promise<unknown[]>;
  createConfiguration(input: CreateConfigurationInput, actor: KpiActorContext): Promise<unknown>;
}

export type KpiRepository = KpiFactsRepository & KpiManagementRepository;
