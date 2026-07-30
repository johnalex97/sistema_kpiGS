import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import {
  changeTechnicianStatusSchema,
  createTechnicianSchema,
  deactivateTechnicianSchema,
  reactivateTechnicianSchema,
  technicianIdSchema,
  technicianListQuerySchema,
  updateTechnicianSchema,
} from "./technicians.schemas.js";
import type { TechniciansService } from "./technicians.service.js";

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

function actor(request: Request) {
  return {
    userId: request.auth!.userId,
    requestId: request.requestId,
    ipAddress: request.ip || null,
    userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
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

export function createTechniciansController(service: TechniciansService) {
  const parse = <T>(
    result: { success: true; data: T } | { success: false; error: ZodError },
  ): T => {
    if (!result.success) throw validationError(result.error);
    return result.data;
  };

  return {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parse(technicianListQuerySchema.safeParse(req.query));
        success(req, res, 200, "Técnicos consultados", await service.list(query));
      } catch (error) { next(error); }
    },
    get: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parse(technicianIdSchema.safeParse(req.params));
        success(req, res, 200, "Técnico consultado", await service.getById(id));
      } catch (error) { next(error); }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parse(createTechnicianSchema.safeParse(req.body));
        success(req, res, 201, "Técnico creado", await service.create(body, actor(req)));
      } catch (error) { next(error); }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parse(technicianIdSchema.safeParse(req.params));
        const body = parse(updateTechnicianSchema.safeParse(req.body));
        success(req, res, 200, "Técnico actualizado", await service.update(id, body, actor(req)));
      } catch (error) { next(error); }
    },
    changeStatus: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parse(technicianIdSchema.safeParse(req.params));
        const body = parse(changeTechnicianStatusSchema.safeParse(req.body));
        success(req, res, 200, "Estado del técnico actualizado", await service.changeStatus(id, body, actor(req)));
      } catch (error) { next(error); }
    },
    deactivate: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parse(technicianIdSchema.safeParse(req.params));
        const body = parse(deactivateTechnicianSchema.safeParse(req.body));
        success(req, res, 200, "Técnico desactivado", await service.deactivate(id, body, actor(req)));
      } catch (error) { next(error); }
    },
    reactivate: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parse(technicianIdSchema.safeParse(req.params));
        const body = parse(reactivateTechnicianSchema.safeParse(req.body));
        success(req, res, 200, "Técnico reactivado", await service.reactivate(id, body, actor(req)));
      } catch (error) { next(error); }
    },
  };
}
