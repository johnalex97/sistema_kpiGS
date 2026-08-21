import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import {
  addRecurrenceNoteSchema,
  addRecurrenceVisitSchema,
  adjustRecurrenceSchema,
  analyzeRecurrenceSchema,
  closeRecurrenceSchema,
  correctRecurrenceSchema,
  dismissRecurrenceSchema,
  recurrenceIdSchema,
  recurrenceListQuerySchema,
  reportRecurrenceSchema,
} from "./recurrences.schemas.js";
import type { RecurrenceService } from "./recurrences.service.js";
import type { RecurrenceActorContext } from "./recurrences.types.js";

const messages = {
  catalog: "Catálogo de reincidencias consultado",
  list: "Reincidencias consultadas",
  detail: "Reincidencia consultada",
  report: "Reincidencia reportada",
  analyze: "Reincidencia analizada",
  correct: "Corrección de reincidencia actualizada",
  visit: "Visita correctiva agregada",
  note: "Nota de reincidencia agregada",
  dismiss: "Reincidencia descartada",
  close: "Reincidencia cerrada",
  adjust: "Reincidencia ajustada",
} as const;

function validationError(error: ZodError): ApiError {
  return new ApiError(
    400,
    "Los datos enviados no son válidos",
    "VALIDATION_ERROR",
    error.issues.map((issue) => ({
      field: issue.path.join("."),
      code: "VALIDATION_ERROR",
      message: issue.message,
    })),
  );
}

type WithoutUndefined<T> = T extends Date
  ? T
  : T extends readonly (infer Item)[]
    ? WithoutUndefined<Item>[]
    : T extends Record<string, unknown>
      ? { [Key in keyof T]: WithoutUndefined<Exclude<T[Key], undefined>> }
      : Exclude<T, undefined>;

function removeUndefined(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, removeUndefined(fieldValue)]),
    );
  }
  return value;
}

function parse<T extends Record<string, unknown>>(
  result: { success: true; data: T } | { success: false; error: ZodError },
): WithoutUndefined<T> {
  if (!result.success) throw validationError(result.error);
  return removeUndefined(result.data) as WithoutUndefined<T>;
}

function actor(request: Request): RecurrenceActorContext {
  return {
    userId: request.auth!.userId,
    technicianId: request.auth!.technicianId,
    permissions: request.auth!.permissions,
    requestId: request.requestId,
  };
}

function success(
  request: Request,
  response: Response,
  status: number,
  message: string,
  data: unknown,
): void {
  response.status(status).json({
    success: true,
    message,
    data,
    errors: [],
    meta: { requestId: request.requestId },
  });
}

export function createRecurrencesController(service: RecurrenceService) {
  const recurrenceId = (request: Request): string =>
    parse(recurrenceIdSchema.safeParse(request.params)).recurrenceId;

  return {
    catalog: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(request, response, 200, messages.catalog, await service.getCatalog(actor(request)));
      } catch (error) {
        next(error);
      }
    },
    list: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parse(recurrenceListQuerySchema.safeParse(request.query));
        success(request, response, 200, messages.list, await service.list(query, actor(request)));
      } catch (error) {
        next(error);
      }
    },
    detail: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(request, response, 200, messages.detail, await service.get(recurrenceId(request), actor(request)));
      } catch (error) {
        next(error);
      }
    },
    report: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const recurrence = await service.report(
          parse(reportRecurrenceSchema.safeParse(request.body)),
          actor(request),
        );
        response.location(`/api/v1/recurrences/${recurrence.id}`);
        success(request, response, 201, messages.report, recurrence);
      } catch (error) {
        next(error);
      }
    },
    analyze: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(
          request,
          response,
          200,
          messages.analyze,
          await service.analyze(
            recurrenceId(request),
            parse(analyzeRecurrenceSchema.safeParse(request.body)),
            actor(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    correct: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(
          request,
          response,
          200,
          messages.correct,
          await service.correct(
            recurrenceId(request),
            parse(correctRecurrenceSchema.safeParse(request.body)),
            actor(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    addVisit: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(
          request,
          response,
          200,
          messages.visit,
          await service.addVisit(
            recurrenceId(request),
            parse(addRecurrenceVisitSchema.safeParse(request.body)),
            actor(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    addNote: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(
          request,
          response,
          200,
          messages.note,
          await service.addNote(
            recurrenceId(request),
            parse(addRecurrenceNoteSchema.safeParse(request.body)),
            actor(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    dismiss: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(
          request,
          response,
          200,
          messages.dismiss,
          await service.dismiss(
            recurrenceId(request),
            parse(dismissRecurrenceSchema.safeParse(request.body)),
            actor(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    close: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(
          request,
          response,
          200,
          messages.close,
          await service.close(
            recurrenceId(request),
            parse(closeRecurrenceSchema.safeParse(request.body)),
            actor(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    adjust: async (request: Request, response: Response, next: NextFunction) => {
      try {
        success(
          request,
          response,
          200,
          messages.adjust,
          await service.adjust(
            recurrenceId(request),
            parse(adjustRecurrenceSchema.safeParse(request.body)),
            actor(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  };
}
