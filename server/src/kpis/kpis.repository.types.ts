import type { Prisma } from "../../generated/prisma/client.js";
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

export type KpiResultRecord = Prisma.ResultadoKPIGetPayload<object>;

export interface CloseWeekInput {
  week: KpiWeek;
  actor: KpiActorContext;
  reason?: string;
  calculationType?: "OFFICIAL" | "MANUAL_RECALCULATION" | "AUTOMATIC_REVISION";
}

export interface CloseWeekResult {
  kind: "CLOSED" | "REVISED" | "UNCHANGED";
  results: KpiResultRecord[];
  warnings: Array<{ code: "MISSING_TARGET"; technicianId: string }>;
}

export interface RevisionBatchResult {
  processed: number;
  failed: number;
}

export interface KpiCloseRepository {
  closeWeek(input: CloseWeekInput): Promise<CloseWeekResult>;
  recalculateWeek(input: CloseWeekInput & { reason: string }): Promise<CloseWeekResult>;
  processRevisionRequests(limit: number, now: Date): Promise<RevisionBatchResult>;
}
