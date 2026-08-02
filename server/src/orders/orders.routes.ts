import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import {
  requireAnyPermission,
  requirePasswordChanged,
  requirePermission,
} from "../middlewares/permission.middleware.js";
import { createOrdersController } from "./orders.controller.js";
import { createOrdersMutationRepository } from "./orders.mutation.repository.js";
import { createOrdersOperationRepository } from "./orders.operation.repository.js";
import { createOrdersReadRepository } from "./orders.read.repository.js";
import { createOrdersService } from "./orders.service.js";

export function createOrdersRouter(
  env: Environment,
  database: PrismaClient,
  authService: AuthService,
) {
  const router = Router();
  const authentication = createAuthenticationMiddleware(authService);
  const controller = createOrdersController(
    createOrdersService({
      ...createOrdersReadRepository(database),
      ...createOrdersMutationRepository(database),
      ...createOrdersOperationRepository(database),
    }),
  );
  const readSecurity = [
    authentication,
    requirePasswordChanged,
    requireAnyPermission("ORDERS_VIEW_ALL", "ORDERS_VIEW_OWN"),
  ];
  const manageSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS),
    authentication,
    requirePasswordChanged,
    requirePermission("ORDERS_MANAGE"),
  ];
  const operateSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS),
    authentication,
    requirePasswordChanged,
    requirePermission("ORDERS_OPERATE_OWN"),
  ];
  const materialSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS),
    authentication,
    requirePasswordChanged,
    requireAnyPermission("ORDERS_MANAGE", "ORDERS_OPERATE_OWN"),
  ];

  router.get("/", ...readSecurity, controller.list);
  router.get("/:orderId", ...readSecurity, controller.detail);
  router.get("/:orderId/history", ...readSecurity, controller.history);
  router.post("/", ...manageSecurity, controller.create);
  router.patch("/:orderId", ...manageSecurity, controller.update);
  router.post(
    "/:orderId/assignments",
    ...manageSecurity,
    controller.assign,
  );
  router.delete(
    "/:orderId/assignments/:technicianId",
    ...manageSecurity,
    controller.unassign,
  );
  router.post("/:orderId/on-route", ...operateSecurity, controller.onRoute);
  router.post("/:orderId/start", ...operateSecurity, controller.start);
  router.post("/:orderId/pause", ...operateSecurity, controller.pause);
  router.post("/:orderId/resume", ...operateSecurity, controller.resume);
  router.post("/:orderId/complete", ...operateSecurity, controller.complete);
  router.post("/:orderId/cancel", ...manageSecurity, controller.cancel);
  router.post("/:orderId/adjustments", ...manageSecurity, controller.adjust);
  router.post(
    "/:orderId/materials",
    ...materialSecurity,
    controller.materialAdd,
  );
  router.patch(
    "/:orderId/materials/:usageId",
    ...materialSecurity,
    controller.materialUpdate,
  );
  router.delete(
    "/:orderId/materials/:usageId",
    ...materialSecurity,
    controller.materialRemove,
  );
  return router;
}
