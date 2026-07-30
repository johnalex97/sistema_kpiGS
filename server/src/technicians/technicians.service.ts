import { ApiError } from "../utils/api-error.js";
import {
  mapPublicTechnician,
  type CreateTechnicianResult,
  type TechnicianMutationResult,
  type TechniciansRepository,
  type UserEligibility,
} from "./technicians.repository.js";
import type {
  ChangeTechnicianStatusInput,
  CreateTechnicianInput,
  DeactivateTechnicianInput,
  PublicTechnician,
  TechnicianActorContext,
  TechnicianListFilters,
  TechnicianListResult,
  ReactivateTechnicianInput,
  UpdateTechnicianInput,
} from "./technicians.types.js";

export interface TechniciansService {
  list(filters: TechnicianListFilters): Promise<TechnicianListResult>;
  getById(id: string): Promise<PublicTechnician>;
  create(
    input: CreateTechnicianInput,
    actor: TechnicianActorContext,
  ): Promise<PublicTechnician>;
  update(
    id: string,
    input: UpdateTechnicianInput,
    actor: TechnicianActorContext,
  ): Promise<PublicTechnician>;
  changeStatus(
    id: string,
    input: ChangeTechnicianStatusInput,
    actor: TechnicianActorContext,
  ): Promise<PublicTechnician>;
  deactivate(
    id: string,
    input: DeactivateTechnicianInput,
    actor: TechnicianActorContext,
  ): Promise<PublicTechnician>;
  reactivate(
    id: string,
    input: ReactivateTechnicianInput,
    actor: TechnicianActorContext,
  ): Promise<PublicTechnician>;
}

interface TechniciansServiceDependencies {
  repository: TechniciansRepository;
  now: () => Date;
  today: () => string;
}

function eligibilityError(outcome: UserEligibility): ApiError | null {
  if (outcome.kind === "NOT_ELIGIBLE") {
    return new ApiError(
      409,
      "El usuario no es elegible como técnico",
      "USER_NOT_ELIGIBLE_AS_TECHNICIAN",
    );
  }
  if (outcome.kind === "ALREADY_LINKED") {
    return new ApiError(
      409,
      "El usuario ya está vinculado a otro técnico",
      "USER_ALREADY_LINKED",
    );
  }
  return null;
}

function mutationError(
  outcome: Exclude<TechnicianMutationResult, { kind: "UPDATED" }>,
): ApiError {
  switch (outcome.kind) {
    case "NOT_FOUND":
      return new ApiError(
        404,
        "El técnico solicitado no existe",
        "TECHNICIAN_NOT_FOUND",
      );
    case "VERSION_CONFLICT":
      return new ApiError(
        409,
        "El técnico fue modificado por otra operación",
        "VERSION_CONFLICT",
      );
    case "INACTIVE":
      return new ApiError(
        409,
        "El estado actual del técnico no permite esta operación",
        "INVALID_TECHNICIAN_STATUS",
      );
    case "WORK_EMAIL_CONFLICT":
      return new ApiError(
        409,
        "El correo laboral ya está en uso",
        "WORK_EMAIL_ALREADY_EXISTS",
      );
    case "USER_NOT_ELIGIBLE":
      return new ApiError(
        409,
        "El usuario no es elegible como técnico",
        "USER_NOT_ELIGIBLE_AS_TECHNICIAN",
      );
    case "USER_ALREADY_LINKED":
      return new ApiError(
        409,
        "El usuario ya está vinculado a otro técnico",
        "USER_ALREADY_LINKED",
      );
    case "ACTIVE_WORK":
      return new ApiError(
        409,
        "El técnico tiene trabajo activo asignado",
        "TECHNICIAN_HAS_ACTIVE_WORK",
      );
  }
}

function createError(
  outcome: Exclude<CreateTechnicianResult, { kind: "CREATED" }>,
): ApiError {
  if (outcome.kind === "WORK_EMAIL_CONFLICT") {
    return new ApiError(
      409,
      "El correo laboral ya está en uso",
      "WORK_EMAIL_ALREADY_EXISTS",
    );
  }
  if (outcome.kind === "USER_NOT_ELIGIBLE") {
    return new ApiError(
      409,
      "El usuario no es elegible como técnico",
      "USER_NOT_ELIGIBLE_AS_TECHNICIAN",
    );
  }
  return new ApiError(
    409,
    "El usuario ya está vinculado a otro técnico",
    "USER_ALREADY_LINKED",
  );
}

export function createTechniciansService(
  dependencies: TechniciansServiceDependencies,
): TechniciansService {
  const { repository } = dependencies;

  return {
    async list(filters) {
      const result = await repository.list(filters);
      return {
        items: result.items.map(mapPublicTechnician),
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems: result.totalItems,
          totalPages:
            result.totalItems === 0
              ? 0
              : Math.ceil(result.totalItems / filters.pageSize),
        },
      };
    },

    async getById(id) {
      const technician = await repository.findById(id);
      if (!technician) {
        throw new ApiError(
          404,
          "El técnico solicitado no existe",
          "TECHNICIAN_NOT_FOUND",
        );
      }
      return mapPublicTechnician(technician);
    },

    async create(input, actor) {
      if (input.userId) {
        const error = eligibilityError(
          await repository.findUserEligibility(input.userId),
        );
        if (error) throw error;
      }
      const result = await repository.create(
        input,
        actor,
        dependencies.now(),
      );
      if (result.kind !== "CREATED") throw createError(result);
      return mapPublicTechnician(result.technician);
    },

    async update(id, input, actor) {
      if (input.userId) {
        const error = eligibilityError(
          await repository.findUserEligibility(input.userId, id),
        );
        if (error) throw error;
      }
      const result = await repository.update(
        id,
        input,
        actor,
        dependencies.now(),
      );
      if (result.kind !== "UPDATED") throw mutationError(result);
      return mapPublicTechnician(result.technician);
    },

    async changeStatus(id, input, actor) {
      const result = await repository.changeStatus(
        id,
        input,
        actor,
        dependencies.now(),
      );
      if (result.kind !== "UPDATED") throw mutationError(result);
      return mapPublicTechnician(result.technician);
    },

    async deactivate(id, input, actor) {
      const current = await repository.findById(id);
      if (!current) {
        throw new ApiError(
          404,
          "El técnico solicitado no existe",
          "TECHNICIAN_NOT_FOUND",
        );
      }
      const leftOn = input.leftOn ?? dependencies.today();
      const hiredOn = current.hiredOn?.toISOString().slice(0, 10);
      if (hiredOn && leftOn < hiredOn) {
        throw new ApiError(
          400,
          "La fecha de salida no puede ser anterior a la contratación",
          "VALIDATION_ERROR",
        );
      }
      const result = await repository.deactivate(
        id,
        { ...input, leftOn },
        actor,
        dependencies.now(),
      );
      if (result.kind !== "UPDATED") throw mutationError(result);
      return mapPublicTechnician(result.technician);
    },

    async reactivate(id, input, actor) {
      const result = await repository.reactivate(
        id,
        input,
        actor,
        dependencies.now(),
      );
      if (result.kind !== "UPDATED") throw mutationError(result);
      return mapPublicTechnician(result.technician);
    },
  };
}
