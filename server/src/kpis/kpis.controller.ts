import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import type { KpiActorContext } from "./kpis.types.js";
import {
  createConfigurationSchema, createTargetSchema, kpiPeriodQuerySchema,
  kpiTargetParamsSchema, kpiTechnicianParamsSchema, kpiWeekParamsSchema,
  recalculationReasonSchema, updateTargetSchema,
} from "./kpis.schemas.js";
import type { createKpiService } from "./kpis.service.js";

type KpiService = ReturnType<typeof createKpiService>;

function validationError(error: ZodError) {
  return new ApiError(400, "Los datos enviados no son válidos", "VALIDATION_ERROR", error.issues.map((issue) => ({
    field: issue.path.join("."), code: "VALIDATION_ERROR", message: issue.message,
  })));
}
function parse<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (!result.success) throw validationError(result.error);
  return result.data;
}
function actor(request: Request): KpiActorContext {
  return { userId: request.auth!.userId, technicianId: request.auth!.technicianId,
    permissions: request.auth!.permissions, requestId: request.requestId };
}
function success(request: Request, response: Response, message: string, data: unknown, status = 200) {
  response.status(status).json({ success: true, message, data, errors: [], meta: { requestId: request.requestId } });
}

export function createKpiController(service: KpiService) {
  return {
    weekly: async (req: Request, res: Response, next: NextFunction) => { try {
      success(req, res, "Indicadores KPI consultados", await service.getDashboard(parse(kpiPeriodQuerySchema.safeParse(req.query)), actor(req)));
    } catch (error) { next(error); } },
    ranking: async (req: Request, res: Response, next: NextFunction) => { try {
      success(req, res, "Ranking KPI consultado", await service.getRanking(parse(kpiPeriodQuerySchema.safeParse(req.query)), actor(req)));
    } catch (error) { next(error); } },
    history: async (req: Request, res: Response, next: NextFunction) => { try {
      const { technicianId } = parse(kpiTechnicianParamsSchema.safeParse(req.params));
      success(req, res, "Historial KPI consultado", await service.getTechnicianHistory(technicianId, actor(req)));
    } catch (error) { next(error); } },
    details: async (req: Request, res: Response, next: NextFunction) => { try {
      const { technicianId } = parse(kpiTechnicianParamsSchema.safeParse(req.params));
      const query = parse(kpiPeriodQuerySchema.safeParse(req.query));
      success(req, res, "Detalle KPI consultado", await service.getTechnicianDetails(technicianId, query.periodStart, actor(req)));
    } catch (error) { next(error); } },
    validation: async (req: Request, res: Response, next: NextFunction) => { try {
      const { periodStart } = parse(kpiWeekParamsSchema.safeParse(req.params));
      success(req, res, "Semana KPI validada", await service.previewWeekly(periodStart, actor(req)));
    } catch (error) { next(error); } },
    close: async (req: Request, res: Response, next: NextFunction) => { try {
      const { periodStart } = parse(kpiWeekParamsSchema.safeParse(req.params));
      success(req, res, "Semana KPI cerrada", await service.closeWeek(periodStart, actor(req)));
    } catch (error) { next(error); } },
    recalculate: async (req: Request, res: Response, next: NextFunction) => { try {
      const { periodStart } = parse(kpiWeekParamsSchema.safeParse(req.params));
      const { reason } = parse(recalculationReasonSchema.safeParse(req.body));
      success(req, res, "Semana KPI recalculada", await service.recalculateWeek(periodStart, reason, actor(req)));
    } catch (error) { next(error); } },
    versions: async (req: Request, res: Response, next: NextFunction) => { try {
      const { periodStart } = parse(kpiWeekParamsSchema.safeParse(req.params));
      success(req, res, "Versiones KPI consultadas", await service.getVersions(periodStart, actor(req)));
    } catch (error) { next(error); } },
    targets: async (req: Request, res: Response, next: NextFunction) => { try {
      const query = parse(kpiPeriodQuerySchema.safeParse(req.query));
      success(req, res, "Metas KPI consultadas", await service.listTargets(query.periodStart, actor(req)));
    } catch (error) { next(error); } },
    createTarget: async (req: Request, res: Response, next: NextFunction) => { try {
      success(req, res, "Meta KPI creada", await service.createTarget(parse(createTargetSchema.safeParse(req.body)), actor(req)), 201);
    } catch (error) { next(error); } },
    updateTarget: async (req: Request, res: Response, next: NextFunction) => { try {
      const { id } = parse(kpiTargetParamsSchema.safeParse(req.params));
      success(req, res, "Meta KPI actualizada", await service.updateTarget(id, parse(updateTargetSchema.safeParse(req.body)), actor(req)));
    } catch (error) { next(error); } },
    configurations: async (req: Request, res: Response, next: NextFunction) => { try {
      success(req, res, "Configuraciones KPI consultadas", await service.listConfigurations(actor(req)));
    } catch (error) { next(error); } },
    createConfiguration: async (req: Request, res: Response, next: NextFunction) => { try {
      success(req, res, "Configuración KPI creada", await service.createConfiguration(parse(createConfigurationSchema.safeParse(req.body)), actor(req)), 201);
    } catch (error) { next(error); } },
  };
}
