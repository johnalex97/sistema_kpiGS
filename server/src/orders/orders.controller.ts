import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import {
  addMaterialSchema,
  adjustOrderSchema,
  assignmentParamsSchema,
  assignmentSchema,
  cancelOrderSchema,
  completeOrderSchema,
  createOrderSchema,
  historyQuerySchema,
  materialParamsSchema,
  orderIdSchema,
  orderListQuerySchema,
  pauseOrderSchema,
  removeMaterialSchema,
  unassignmentSchema,
  updateMaterialSchema,
  updateOrderSchema,
  versionCommandSchema,
} from "./orders.schemas.js";
import type { OrdersService } from "./orders.service.js";
import type { OrderActorContext } from "./orders.types.js";

const messages = {
  catalog: "Catálogo de órdenes consultado",
  list: "Órdenes consultadas",
  detail: "Orden consultada",
  history: "Historial consultado",
  create: "Orden creada",
  update: "Orden actualizada",
  assign: "Técnico asignado",
  unassign: "Técnico retirado",
  onRoute: "Traslado iniciado",
  start: "Trabajo iniciado",
  pause: "Orden pausada",
  resume: "Orden reanudada",
  complete: "Orden completada",
  cancel: "Orden cancelada",
  adjust: "Orden ajustada",
  materialAdd: "Material registrado",
  materialUpdate: "Material actualizado",
  materialRemove: "Material retirado",
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

function actor(request: Request): OrderActorContext {
  return {
    userId: request.auth!.userId,
    technicianId: request.auth!.technicianId,
    permissions: request.auth!.permissions,
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

export function createOrdersController(service: OrdersService) {
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
    catalog: async (req: Request, res: Response, next: NextFunction) => {
      try {
        success(
          req,
          res,
          200,
          messages.catalog,
          await service.catalog(actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parse(orderListQuerySchema.safeParse(req.query));
        success(
          req,
          res,
          200,
          messages.list,
          await service.listOrders(query, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    detail: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        success(
          req,
          res,
          200,
          messages.detail,
          await service.getOrder(orderId, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    history: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const query = parse(historyQuerySchema.safeParse(req.query));
        success(
          req,
          res,
          200,
          messages.history,
          await service.listOrderHistory(orderId, query, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parse(createOrderSchema.safeParse(req.body));
        success(
          req,
          res,
          201,
          messages.create,
          await service.createOrder(body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(updateOrderSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.update,
          await service.updateOrder(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    assign: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(assignmentSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.assign,
          await service.assignTechnician(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    unassign: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId, technicianId } = parse(
          assignmentParamsSchema.safeParse(req.params),
        );
        const body = parse(unassignmentSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.unassign,
          await service.unassignTechnician(
            orderId,
            technicianId,
            body,
            actor(req),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    onRoute: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(versionCommandSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.onRoute,
          await service.moveOnRoute(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    start: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(versionCommandSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.start,
          await service.startOrder(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    pause: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(pauseOrderSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.pause,
          await service.pauseOrder(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    resume: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(versionCommandSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.resume,
          await service.resumeOrder(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    complete: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(completeOrderSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.complete,
          await service.completeOrder(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    cancel: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(cancelOrderSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.cancel,
          await service.cancelOrder(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    adjust: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(adjustOrderSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.adjust,
          await service.adjustClosedOrder(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    materialAdd: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { orderId } = parse(orderIdSchema.safeParse(req.params));
        const body = parse(addMaterialSchema.safeParse(req.body));
        success(
          req,
          res,
          201,
          messages.materialAdd,
          await service.addOrderMaterial(orderId, body, actor(req)),
        );
      } catch (error) {
        next(error);
      }
    },
    materialUpdate: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        const { orderId, usageId } = parse(
          materialParamsSchema.safeParse(req.params),
        );
        const body = parse(updateMaterialSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.materialUpdate,
          await service.updateOrderMaterial(
            orderId,
            usageId,
            body,
            actor(req),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    materialRemove: async (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        const { orderId, usageId } = parse(
          materialParamsSchema.safeParse(req.params),
        );
        const body = parse(removeMaterialSchema.safeParse(req.body));
        success(
          req,
          res,
          200,
          messages.materialRemove,
          await service.removeOrderMaterial(
            orderId,
            usageId,
            body,
            actor(req),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  };
}
