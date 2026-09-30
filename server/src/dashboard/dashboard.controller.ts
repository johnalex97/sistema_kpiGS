import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { operationalDashboardQuerySchema } from "./dashboard.schemas.js";
import type {
  DashboardActorContext,
  OperationalDashboardQuery,
  PublicOperationalDashboard,
} from "./dashboard.types.js";

export interface DashboardService {
  getOperationalDashboard(
    query: OperationalDashboardQuery,
    actor: DashboardActorContext,
  ): Promise<PublicOperationalDashboard>;
}

function parse<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (result.success) return result.data;
  throw new ApiError(400, "Los datos enviados no son válidos", "VALIDATION_ERROR", result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    code: "VALIDATION_ERROR",
    message: issue.message,
  })));
}

function actor(request: Request): DashboardActorContext {
  return {
    userId: request.auth!.userId,
    technicianId: request.auth!.technicianId,
    permissions: request.auth!.permissions,
    requestId: request.requestId,
  };
}

export function createDashboardController(service: DashboardService) {
  return {
    operational: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const data = await service.getOperationalDashboard(
          parse(operationalDashboardQuerySchema.safeParse(request.query)),
          actor(request),
        );
        response.status(200).json({
          success: true,
          message: "Resumen operativo consultado",
          data,
          errors: [],
          meta: { requestId: request.requestId },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
