import { ApiError } from "../utils/api-error.js";
import {
  mapRecurrenceDetail,
  mapRecurrenceSummary,
} from "./recurrences.mapper.js";
import { recurrenceWorkflowMetadata } from "./recurrences.state-machine.js";
import type {
  RecurrenceDetailRecord,
  RecurrenceFailureKind,
  RecurrenceMutationResult,
  RecurrencesRepository,
} from "./recurrences.repository.types.js";
import type {
  AddRecurrenceNoteInput,
  AddRecurrenceVisitInput,
  AdjustRecurrenceInput,
  AnalyzeRecurrenceInput,
  CloseRecurrenceInput,
  CorrectRecurrenceInput,
  DismissRecurrenceInput,
  PaginatedResult,
  PublicRecurrenceCatalog,
  PublicRecurrenceDetail,
  PublicRecurrenceSummary,
  PublicRecurrenceSummaryMetrics,
  RecurrenceAccessScope,
  RecurrenceActorContext,
  RecurrenceListFilters,
  RecurrenceSummaryFilters,
  ReportRecurrenceInput,
} from "./recurrences.types.js";

export type PaginatedRecurrences = PaginatedResult<PublicRecurrenceSummary>;
type RecurrenceServiceRepository = Omit<RecurrencesRepository, "summarizeRecurrences">
  & Partial<Pick<RecurrencesRepository, "summarizeRecurrences">>;

export interface RecurrenceService {
  getCatalog(actor: RecurrenceActorContext): Promise<PublicRecurrenceCatalog>;
  list(filters: RecurrenceListFilters, actor: RecurrenceActorContext): Promise<PaginatedRecurrences>;
  summary(filters: RecurrenceSummaryFilters, actor: RecurrenceActorContext): Promise<PublicRecurrenceSummaryMetrics>;
  get(id: string, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  report(input: ReportRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  analyze(id: string, input: AnalyzeRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  correct(id: string, input: CorrectRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  addVisit(id: string, input: AddRecurrenceVisitInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  addNote(id: string, input: AddRecurrenceNoteInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  dismiss(id: string, input: DismissRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  close(id: string, input: CloseRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  adjust(id: string, input: AdjustRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
}

const errors: Record<RecurrenceFailureKind, () => ApiError> = {
  RECURRENCE_NOT_FOUND: () => recurrenceNotFound(),
  RECURRENCE_NUMBER_EXHAUSTED: () => new ApiError(409, "La numeraciÃ³n anual de reincidencias estÃ¡ agotada", "RECURRENCE_NUMBER_EXHAUSTED"),
  RECURRENCE_DUPLICATE: () => new ApiError(409, "La reincidencia o visita ya existe", "RECURRENCE_DUPLICATE"),
  RECURRENCE_ORDER_MISMATCH: () => new ApiError(409, "Las órdenes no pertenecen al mismo cliente y sucursal", "RECURRENCE_ORDER_MISMATCH"),
  RECURRENCE_ORDER_NOT_FOUND: () => new ApiError(404, "La orden solicitada no existe", "ORDER_NOT_FOUND"),
  RECURRENCE_CAUSE_NOT_FOUND: () => recurrenceNotFound(),
  RECURRENCE_VISIT_DUPLICATE: () => new ApiError(409, "La reincidencia o visita ya existe", "RECURRENCE_DUPLICATE"),
  RECURRENCE_QUALITY_INVALID: () => new ApiError(422, "La documentación de la reincidencia está incompleta", "RECURRENCE_DOCUMENTATION_INCOMPLETE"),
  RECURRENCE_DOCUMENTATION_INCOMPLETE: () => new ApiError(422, "La documentación de la reincidencia está incompleta", "RECURRENCE_DOCUMENTATION_INCOMPLETE"),
  RECURRENCE_EVIDENCE_REQUIRED: () => new ApiError(422, "La reincidencia requiere al menos una evidencia activa", "RECURRENCE_EVIDENCE_REQUIRED"),
  VERSION_CONFLICT: () => new ApiError(409, "La reincidencia fue modificada por otra operación", "VERSION_CONFLICT"),
  INVALID_RECURRENCE_TRANSITION: () => new ApiError(409, "La transición de estado no es válida", "INVALID_RECURRENCE_TRANSITION"),
};

function forbidden(): ApiError {
  return new ApiError(403, "No tiene permiso para realizar esta acción", "FORBIDDEN");
}

function recurrenceNotFound(): ApiError {
  return new ApiError(404, "El caso de reincidencia solicitado no existe", "RECURRENCE_NOT_FOUND");
}

function internalError(): ApiError {
  return new ApiError(500, "Ocurrió un error interno", "INTERNAL_ERROR");
}

function hasPermission(actor: RecurrenceActorContext, permission: string): boolean {
  return actor.permissions.includes(permission);
}

function isManagement(actor: RecurrenceActorContext): boolean {
  return hasPermission(actor, "RECURRENCES_VIEW_ALL")
    || hasPermission(actor, "RECURRENCES_REVIEW");
}

function accessScope(actor: RecurrenceActorContext): RecurrenceAccessScope {
  if (isManagement(actor)) return { kind: "ALL" };
  if (hasPermission(actor, "RECURRENCES_VIEW_OWN") && actor.technicianId !== null) {
    return { kind: "TECHNICIAN", technicianId: actor.technicianId };
  }
  throw forbidden();
}

function requireReview(actor: RecurrenceActorContext): void {
  if (!hasPermission(actor, "RECURRENCES_REVIEW")) throw forbidden();
}

function requireReport(actor: RecurrenceActorContext): void {
  if (hasPermission(actor, "RECURRENCES_REVIEW")) return;
  if (hasPermission(actor, "RECURRENCES_REPORT_OWN") && actor.technicianId !== null) return;
  throw forbidden();
}

function requireNote(actor: RecurrenceActorContext): void {
  if (hasPermission(actor, "RECURRENCES_REVIEW")) return;
  if (hasPermission(actor, "RECURRENCES_VIEW_OWN") && actor.technicianId !== null) return;
  throw forbidden();
}

function pagination(
  filters: RecurrenceListFilters,
  totalItems: number,
): PaginatedRecurrences["pagination"] {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / filters.pageSize),
  };
}

function mapDetailForActor(
  recurrence: RecurrenceDetailRecord,
  actor: RecurrenceActorContext,
): PublicRecurrenceDetail {
  return mapRecurrenceDetail(recurrence, isManagement(actor) ? "ALL" : "TECHNICIAN");
}

function mapMutationResult(
  result: RecurrenceMutationResult,
  actor: RecurrenceActorContext,
): PublicRecurrenceDetail {
  if (result.kind === "CREATED" || result.kind === "UPDATED") {
    return mapDetailForActor(result.recurrence, actor);
  }
  throw errors[result.kind]();
}

async function publicOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw internalError();
  }
}

export function createRecurrenceService(
  repository: RecurrenceServiceRepository,
  now: () => Date,
  warningDays: number,
  processRevisionRequests: (limit: number, now: Date) => Promise<unknown> = async () => undefined,
): RecurrenceService {
  async function mutate(
    actor: RecurrenceActorContext,
    operation: (timestamp: Date) => Promise<RecurrenceMutationResult>,
  ): Promise<PublicRecurrenceDetail> {
    return publicOperation(async () => mapMutationResult(await operation(now()), actor));
  }

  async function mutateAndProcess(
    actor: RecurrenceActorContext,
    operation: (timestamp: Date) => Promise<RecurrenceMutationResult>,
  ): Promise<PublicRecurrenceDetail> {
    const timestamp = now();
    const result = await publicOperation(async () => mapMutationResult(await operation(timestamp), actor));
    try { await processRevisionRequests(10, timestamp); } catch { /* durable request is retried later */ }
    return result;
  }

  return {
    async getCatalog(actor) {
      return publicOperation(async () => {
        accessScope(actor);
        return {
          causes: await repository.listCauses(),
          ...recurrenceWorkflowMetadata,
        };
      });
    },

    async list(filters, actor) {
      return publicOperation(async () => {
        const result = await repository.listRecurrences(filters, accessScope(actor));
        return {
          items: result.items.map(mapRecurrenceSummary),
          pagination: pagination(filters, result.totalItems),
        };
      });
    },

    async summary(filters, actor) {
      return publicOperation(() => {
        if (repository.summarizeRecurrences === undefined) throw internalError();
        return repository.summarizeRecurrences(filters, accessScope(actor));
      });
    },

    async get(id, actor) {
      return publicOperation(async () => {
        const recurrence = await repository.findRecurrence(id, accessScope(actor));
        if (recurrence === null) throw recurrenceNotFound();
        return mapDetailForActor(recurrence, actor);
      });
    },

    async report(input, actor) {
      requireReport(actor);
      return mutate(actor, (timestamp) => repository.reportRecurrence(input, actor, timestamp));
    },

    async analyze(id, input, actor) {
      requireReview(actor);
      return mutate(actor, (timestamp) => repository.analyzeRecurrence(id, input, actor, timestamp, warningDays));
    },

    async correct(id, input, actor) {
      requireReview(actor);
      return mutate(actor, (timestamp) => repository.correctRecurrence(id, input, actor, timestamp));
    },

    async addVisit(id, input, actor) {
      requireReview(actor);
      return mutate(actor, (timestamp) => repository.addVisit(id, input, actor, timestamp));
    },

    async addNote(id, input, actor) {
      requireNote(actor);
      return mutate(actor, (timestamp) => repository.addNote(id, input, actor, timestamp));
    },

    async dismiss(id, input, actor) {
      requireReview(actor);
      return mutate(actor, (timestamp) => repository.dismissRecurrence(id, input, actor, timestamp));
    },

    async close(id, input, actor) {
      requireReview(actor);
      return mutateAndProcess(actor, (timestamp) => repository.closeRecurrence(id, input, actor, timestamp));
    },

    async adjust(id, input, actor) {
      requireReview(actor);
      return mutateAndProcess(actor, (timestamp) => repository.adjustClosedRecurrence(id, input, actor, timestamp));
    },
  };
}
