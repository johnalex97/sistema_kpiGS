import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import {
  activityIdSchema,
  activityListQuerySchema,
  adjustActivitySchema,
  cancelActivitySchema,
  completeActivitySchema,
  createActivitySchema,
  manualActivitySchema,
  pauseActivitySchema,
  replaceActivityTeamSchema,
  updateActivitySchema,
  versionActivitySchema,
} from "./activities.schemas.js";
import type { ActivitiesService } from "./activities.service.js";
import type { ActivityActorContext } from "./activities.types.js";

const messages = {
  catalog: "Tipos de actividad consultados",
  list: "Actividades consultadas",
  detail: "Actividad consultada",
  create: "Actividad creada",
  manual: "Actividad manual registrada",
  update: "Actividad actualizada",
  team: "Equipo de actividad actualizado",
  start: "Actividad iniciada",
  pause: "Actividad pausada",
  resume: "Actividad reanudada",
  complete: "Actividad completada",
  cancel: "Actividad cancelada",
  adjust: "Actividad ajustada",
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

function actor(request: Request): ActivityActorContext {
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
) {
  response.status(status).json({
    success: true,
    message,
    data,
    errors: [],
    meta: { requestId: request.requestId },
  });
}

export function createActivitiesController(service: ActivitiesService) {
  type WithoutUndefined<T> = {
    [Key in keyof T]: Exclude<T[Key], undefined>;
  };
  const parse = <T extends Record<string, unknown>>(
    result: { success: true; data: T } | { success: false; error: ZodError },
  ): WithoutUndefined<T> => {
    if (!result.success) throw validationError(result.error);
    return Object.fromEntries(
      Object.entries(result.data).filter(([, value]) => value !== undefined),
    ) as WithoutUndefined<T>;
  };

  return {
    listTypes: async (req: Request, res: Response, next: NextFunction) => {
      try {
        success(req, res, 200, messages.catalog, await service.listActivityTypes(actor(req)));
      } catch (error) { next(error); }
    },
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parse(activityListQuerySchema.safeParse(req.query));
        success(req, res, 200, messages.list, await service.listActivities(query, actor(req)));
      } catch (error) { next(error); }
    },
    detail: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        success(req, res, 200, messages.detail, await service.getActivity(activityId, actor(req)));
      } catch (error) { next(error); }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parse(createActivitySchema.safeParse(req.body));
        const data = await service.createActivity(body, actor(req));
        res.location(`/api/v1/activities/${data.id}`);
        success(req, res, 201, messages.create, data);
      } catch (error) { next(error); }
    },
    manual: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parse(manualActivitySchema(() => new Date()).safeParse(req.body));
        const data = await service.createManualActivity(body, actor(req));
        res.location(`/api/v1/activities/${data.id}`);
        success(req, res, 201, messages.manual, data);
      } catch (error) { next(error); }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(updateActivitySchema.safeParse(req.body));
        success(req, res, 200, messages.update, await service.updateActivity(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
    team: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(replaceActivityTeamSchema.safeParse(req.body));
        success(req, res, 200, messages.team, await service.replaceActivityTeam(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
    start: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(versionActivitySchema.safeParse(req.body));
        success(req, res, 200, messages.start, await service.startActivity(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
    pause: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(pauseActivitySchema.safeParse(req.body));
        success(req, res, 200, messages.pause, await service.pauseActivity(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
    resume: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(versionActivitySchema.safeParse(req.body));
        success(req, res, 200, messages.resume, await service.resumeActivity(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
    complete: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(completeActivitySchema.safeParse(req.body));
        success(req, res, 200, messages.complete, await service.completeActivity(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
    cancel: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(cancelActivitySchema.safeParse(req.body));
        success(req, res, 200, messages.cancel, await service.cancelActivity(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
    adjust: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { activityId } = parse(activityIdSchema.safeParse(req.params));
        const body = parse(adjustActivitySchema.safeParse(req.body));
        success(req, res, 200, messages.adjust, await service.adjustCompletedActivity(activityId, body, actor(req)));
      } catch (error) { next(error); }
    },
  };
}
