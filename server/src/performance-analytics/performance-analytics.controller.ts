import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { serializePerformanceCsv } from "./performance-analytics.csv.js";
import { performanceAnalyticsQuerySchema } from "./performance-analytics.schemas.js";
import type { createPerformanceAnalyticsService } from "./performance-analytics.service.js";

type Service = ReturnType<typeof createPerformanceAnalyticsService>;
const parse = <T,>(result: { success: true; data: T } | { success: false; error: ZodError }): T => {
  if (result.success) return result.data;
  throw new ApiError(400, "Los filtros de análisis no son válidos", "VALIDATION_ERROR", result.error.issues);
};
const actor = (request: Request) => ({ userId: request.auth!.userId, technicianId: request.auth!.technicianId, permissions: request.auth!.permissions, requestId: request.requestId });

export function createPerformanceAnalyticsController(service: Service) {
  const summary = async (request: Request, response: Response, next: NextFunction) => { try {
    const data = await service.getSummary(parse(performanceAnalyticsQuerySchema.safeParse(request.query)), actor(request));
    response.status(200).json({ success: true, message: "Análisis de rendimiento consultado", data, errors: [], meta: { requestId: request.requestId } });
  } catch (error) { next(error); } };
  return {
    summary,
    exportCsv: async (request: Request, response: Response, next: NextFunction) => { try {
      const data = await service.getSummary(parse(performanceAnalyticsQuerySchema.safeParse(request.query)), actor(request));
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="analisis-rendimiento-${data.period.periodStart}.csv"`);
      response.send(serializePerformanceCsv(data));
    } catch (error) { next(error); } },
  };
}
