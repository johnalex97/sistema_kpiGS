import type { Prisma } from "../../generated/prisma/client.js";
import type {
  ActivityAccessScope,
  ActivityListFilters,
} from "./activities.types.js";
import type {
  ActivityActorContext,
  CreateActivityInput,
  ManualActivityInput,
  PauseActivityInput,
  CompleteActivityInput,
  CancelActivityInput,
  ReplaceActivityTeamInput,
  UpdateActivityInput,
  ActivityVersionInput,
} from "./activities.types.js";

export const activityTypeSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  displayOrder: true,
} as const satisfies Prisma.TipoActividadSelect;

export const activitySummarySelect = {
  id: true,
  status: true,
  description: true,
  result: true,
  startedAt: true,
  endedAt: true,
  pausedMinutes: true,
  productiveMinutes: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  sucursal: {
    select: {
      id: true,
      code: true,
      name: true,
      cliente: { select: { id: true, code: true, tradeName: true } },
    },
  },
  orden: { select: { id: true, orderNumber: true } },
  tipoActividad: { select: activityTypeSelect },
  tecnicos: {
    where: { role: "RESPONSIBLE" },
    take: 1,
    select: { tecnico: { select: { id: true, code: true, fullName: true } } },
  },
} as const satisfies Prisma.ActividadSelect;

export const activityDetailSelect = {
  ...activitySummarySelect,
  observations: true,
  tecnicos: {
    orderBy: [{ role: "asc" }, { tecnico: { code: "asc" } }],
    select: {
      role: true,
      participationPercentage: true,
      startedAt: true,
      endedAt: true,
      tecnico: { select: { id: true, code: true, fullName: true } },
    },
  },
  pausas: {
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    select: { id: true, startedAt: true, endedAt: true, reason: true },
  },
} as const satisfies Prisma.ActividadSelect;

export type ActivityTypeRecord = Prisma.TipoActividadGetPayload<{
  select: typeof activityTypeSelect;
}>;
export type ActivitySummaryRecord = Prisma.ActividadGetPayload<{
  select: typeof activitySummarySelect;
}>;
export type ActivityDetailRecord = Prisma.ActividadGetPayload<{
  select: typeof activityDetailSelect;
}>;

export interface PageRecord<T> {
  items: T[];
  totalItems: number;
}

export interface ActivitiesReadRepository {
  listActivityTypes(): Promise<ActivityTypeRecord[]>;
  listActivities(
    filters: ActivityListFilters,
    scope: ActivityAccessScope,
  ): Promise<PageRecord<ActivitySummaryRecord>>;
  findActivityById(
    id: string,
    scope: ActivityAccessScope,
  ): Promise<ActivityDetailRecord | null>;
}

export interface ActivitiesPendingMutationRepository {
  createActivity(
    input: CreateActivityInput,
    actor: ActivityActorContext,
    now: Date,
  ): Promise<ActivityMutationResult>;
  updateActivity(
    id: string,
    input: UpdateActivityInput,
    actor: ActivityActorContext,
    now: Date,
  ): Promise<ActivityMutationResult>;
  replaceActivityTeam(
    id: string,
    input: ReplaceActivityTeamInput,
    actor: ActivityActorContext,
    now: Date,
  ): Promise<ActivityMutationResult>;
}

export interface ActivitiesManualMutationRepository {
  createManualActivity(
    input: ManualActivityInput,
    actor: ActivityActorContext,
    now: Date,
  ): Promise<ActivityMutationResult>;
}

export interface ActivitiesTimerRepository {
  startActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  pauseActivity(id: string, input: PauseActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  resumeActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
}

export interface ActivitiesCloseRepository extends ActivitiesTimerRepository {
  completeActivity(id: string, input: CompleteActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  cancelActivity(id: string, input: CancelActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
}

export interface ActivitiesMutationRepository extends
  ActivitiesPendingMutationRepository,
  ActivitiesManualMutationRepository {}

export type ActivityFailureKind =
  | "ACTIVITY_NOT_FOUND"
  | "ACTIVITY_TYPE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_TEMPORAL_RANGE"
  | "INVALID_ACTIVITY_STATE"
  | "ACTIVE_TIMER_EXISTS"
  | "TIME_OVERLAP"
  | "INVALID_PARTICIPATION_TOTAL"
  | "TECHNICIAN_NOT_ASSIGNED_TO_ORDER"
  | "RESOURCE_INACTIVE"
  | "FORBIDDEN";

export type ActivityMutationResult =
  | { kind: "CREATED" | "UPDATED"; activity: ActivityDetailRecord }
  | { kind: ActivityFailureKind };
