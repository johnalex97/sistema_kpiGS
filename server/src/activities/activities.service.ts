import { ApiError } from "../utils/api-error.js";
import {
  mapPublicActivityDetail,
  mapPublicActivitySummary,
  mapPublicActivityType,
} from "./activities.mapper.js";
import type {
  ActivitiesRepository,
  ActivityFailureKind,
  ActivityMutationResult,
} from "./activities.repository.types.js";
import type {
  ActivityAccessScope,
  ActivityActorContext,
  ActivityListFilters,
  ActivityVersionInput,
  AdjustActivityInput,
  CancelActivityInput,
  CompleteActivityInput,
  CreateActivityInput,
  ManualActivityInput,
  PaginatedResult,
  PauseActivityInput,
  PublicActivityDetail,
  PublicActivitySummary,
  PublicActivityType,
  ReplaceActivityTeamInput,
  UpdateActivityInput,
} from "./activities.types.js";

const errors: Record<ActivityFailureKind, () => ApiError> = {
  ACTIVITY_NOT_FOUND: () =>
    new ApiError(404, "La actividad solicitada no existe", "ACTIVITY_NOT_FOUND"),
  ACTIVITY_TYPE_NOT_FOUND: () =>
    new ApiError(404, "El tipo de actividad solicitado no existe", "ACTIVITY_TYPE_NOT_FOUND"),
  VERSION_CONFLICT: () =>
    new ApiError(409, "La actividad fue modificada por otro usuario", "VERSION_CONFLICT"),
  INVALID_TEMPORAL_RANGE: () =>
    new ApiError(400, "Los datos enviados no son válidos", "VALIDATION_ERROR"),
  INVALID_ACTIVITY_STATE: () =>
    new ApiError(409, "La transición de estado no es válida", "INVALID_ACTIVITY_STATE"),
  ACTIVE_TIMER_EXISTS: () =>
    new ApiError(409, "El técnico ya tiene otra actividad activa", "ACTIVE_TIMER_EXISTS"),
  TIME_OVERLAP: () =>
    new ApiError(409, "El intervalo de tiempo se superpone con otra actividad", "TIME_OVERLAP"),
  INVALID_PARTICIPATION_TOTAL: () =>
    new ApiError(400, "La participación del equipo no es válida", "INVALID_PARTICIPATION_TOTAL"),
  TECHNICIAN_NOT_ASSIGNED_TO_ORDER: () =>
    new ApiError(400, "El técnico no está asignado a la orden", "TECHNICIAN_NOT_ASSIGNED_TO_ORDER"),
  RESOURCE_INACTIVE: () =>
    new ApiError(409, "El recurso relacionado está inactivo", "RESOURCE_INACTIVE"),
  FORBIDDEN: forbidden,
};

function forbidden(): ApiError {
  return new ApiError(
    403,
    "No tiene permiso para realizar esta acción",
    "FORBIDDEN",
  );
}

function hasPermission(actor: ActivityActorContext, permission: string): boolean {
  return actor.permissions.includes(permission);
}

function requireManage(actor: ActivityActorContext): void {
  if (!hasPermission(actor, "ACTIVITIES_MANAGE")) throw forbidden();
}

function requireOwnCreate(actor: ActivityActorContext): string {
  if (!hasPermission(actor, "ACTIVITIES_CREATE_OWN") || actor.technicianId === null) {
    throw forbidden();
  }
  return actor.technicianId;
}

function requireOperation(actor: ActivityActorContext): void {
  if (hasPermission(actor, "ACTIVITIES_MANAGE")) return;
  if (!hasPermission(actor, "ACTIVITIES_OPERATE_OWN") || actor.technicianId === null) {
    throw forbidden();
  }
}

function requireCancellation(actor: ActivityActorContext): void {
  if (hasPermission(actor, "ACTIVITIES_MANAGE")) return;
  requireOwnCreate(actor);
}

function accessScope(actor: ActivityActorContext): ActivityAccessScope {
  if (hasPermission(actor, "ACTIVITIES_VIEW_ALL")) return { kind: "ALL" };
  if (
    (hasPermission(actor, "ACTIVITIES_CREATE_OWN")
      || hasPermission(actor, "ACTIVITIES_OPERATE_OWN"))
    && actor.technicianId !== null
  ) {
    return { kind: "TECHNICIAN", technicianId: actor.technicianId };
  }
  throw forbidden();
}

function ownTeam(technicianId: string) {
  return [{
    technicianId,
    role: "RESPONSIBLE" as const,
    participationPercentage: "100.00",
  }];
}

function normalizeOwnCreate<T extends CreateActivityInput>(
  input: T,
  actor: ActivityActorContext,
): T {
  const technicianId = requireOwnCreate(actor);
  const team = ownTeam(technicianId);
  if (
    input.team !== undefined
    && (input.team.length !== 1
      || input.team[0]?.technicianId !== technicianId
      || input.team[0]?.role !== "RESPONSIBLE"
      || input.team[0]?.participationPercentage !== "100.00")
  ) {
    throw forbidden();
  }
  return { ...input, team };
}

function pagination(page: number, pageSize: number, totalItems: number) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

function mapMutationResult(result: ActivityMutationResult): PublicActivityDetail {
  if (result.kind === "CREATED" || result.kind === "UPDATED") {
    return mapPublicActivityDetail(result.activity);
  }
  throw errors[result.kind]();
}

export interface ActivitiesService {
  listActivityTypes(actor: ActivityActorContext): Promise<PublicActivityType[]>;
  listActivities(filters: ActivityListFilters, actor: ActivityActorContext): Promise<PaginatedResult<PublicActivitySummary>>;
  getActivity(id: string, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  createActivity(input: CreateActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  createManualActivity(input: ManualActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  updateActivity(id: string, input: UpdateActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  replaceActivityTeam(id: string, input: ReplaceActivityTeamInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  startActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  pauseActivity(id: string, input: PauseActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  resumeActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  completeActivity(id: string, input: CompleteActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  cancelActivity(id: string, input: CancelActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  adjustCompletedActivity(id: string, input: AdjustActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
}

export function createActivitiesService(
  repository: ActivitiesRepository,
  now: () => Date = () => new Date(),
): ActivitiesService {
  async function mutate(
    operation: (timestamp: Date) => Promise<ActivityMutationResult>,
  ): Promise<PublicActivityDetail> {
    const timestamp = now();
    return mapMutationResult(await operation(timestamp));
  }

  return {
    async listActivityTypes(actor) {
      accessScope(actor);
      return (await repository.listActivityTypes()).map(mapPublicActivityType);
    },

    async listActivities(filters, actor) {
      const result = await repository.listActivities(filters, accessScope(actor));
      return {
        items: result.items.map(mapPublicActivitySummary),
        pagination: pagination(filters.page, filters.pageSize, result.totalItems),
      };
    },

    async getActivity(id, actor) {
      const activity = await repository.findActivityById(id, accessScope(actor));
      if (!activity) throw errors.ACTIVITY_NOT_FOUND();
      return mapPublicActivityDetail(activity);
    },

    async createActivity(input, actor) {
      if (hasPermission(actor, "ACTIVITIES_MANAGE")) {
        return mutate((timestamp) => repository.createActivity(input, actor, timestamp));
      }
      const normalized = normalizeOwnCreate(input, actor);
      return mutate((timestamp) => repository.createActivity(normalized, actor, timestamp));
    },

    async createManualActivity(input, actor) {
      if (hasPermission(actor, "ACTIVITIES_MANAGE")) {
        return mutate((timestamp) => repository.createManualActivity(input, actor, timestamp));
      }
      const normalized = normalizeOwnCreate(input, actor);
      return mutate((timestamp) => repository.createManualActivity(normalized, actor, timestamp));
    },

    async updateActivity(id, input, actor) {
      requireManage(actor);
      return mutate((timestamp) => repository.updateActivity(id, input, actor, timestamp));
    },

    async replaceActivityTeam(id, input, actor) {
      requireManage(actor);
      return mutate((timestamp) => repository.replaceActivityTeam(id, input, actor, timestamp));
    },

    async startActivity(id, input, actor) {
      requireOperation(actor);
      return mutate((timestamp) => repository.startActivity(id, input, actor, timestamp));
    },

    async pauseActivity(id, input, actor) {
      requireOperation(actor);
      return mutate((timestamp) => repository.pauseActivity(id, input, actor, timestamp));
    },

    async resumeActivity(id, input, actor) {
      requireOperation(actor);
      return mutate((timestamp) => repository.resumeActivity(id, input, actor, timestamp));
    },

    async completeActivity(id, input, actor) {
      requireOperation(actor);
      return mutate((timestamp) => repository.completeActivity(id, input, actor, timestamp));
    },

    async cancelActivity(id, input, actor) {
      requireCancellation(actor);
      return mutate((timestamp) => repository.cancelActivity(id, input, actor, timestamp));
    },

    async adjustCompletedActivity(id, input, actor) {
      requireManage(actor);
      return mutate((timestamp) => repository.adjustCompletedActivity(id, input, actor, timestamp));
    },
  };
}
