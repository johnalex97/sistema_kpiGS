import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import { requireAnyPermission, requirePasswordChanged, requirePermission } from "../middlewares/permission.middleware.js";
import { createKpiController } from "./kpis.controller.js";
import type { KpiCloseRepository } from "./kpis.repository.types.js";
import { createKpiReadRepository } from "./kpis.read.repository.js";
import { createKpiManagementRepository } from "./kpis.management.repository.js";
import { createKpiService } from "./kpis.service.js";

export function createKpiRouter(env: Environment, database: PrismaClient, authService: AuthService, closeRepository: KpiCloseRepository) {
  const router = Router();
  const authentication = createAuthenticationMiddleware(authService);
  const service = createKpiService({ ...createKpiReadRepository(database), ...createKpiManagementRepository(database), ...closeRepository }, env.KPI_TIME_ZONE);
  const controller = createKpiController(service);
  const read = [authentication, requirePasswordChanged, requireAnyPermission("KPI_VIEW_ALL", "KPI_VIEW_OWN")] as const;
  const mutation = (permission: string) => [requireAllowedOrigin(env.CORS_ORIGINS), authentication, requirePasswordChanged, requirePermission(permission)] as const;
  router.get("/weekly", ...read, controller.weekly);
  router.get("/ranking", ...read, controller.ranking);
  router.get("/technicians/:technicianId/history", ...read, controller.history);
  router.get("/technicians/:technicianId/details", ...read, controller.details);
  router.get("/weeks/:periodStart/validation", ...read, controller.validation);
  router.post("/weeks/:periodStart/close", ...mutation("KPI_CLOSE_WEEK"), controller.close);
  router.post("/weeks/:periodStart/recalculate", ...mutation("KPI_RECALCULATE"), controller.recalculate);
  router.get("/weeks/:periodStart/versions", authentication, requirePasswordChanged, requirePermission("KPI_VIEW_AUDIT"), controller.versions);
  router.get("/targets", authentication, requirePasswordChanged, requirePermission("KPI_MANAGE_TARGETS"), controller.targets);
  router.post("/targets", ...mutation("KPI_MANAGE_TARGETS"), controller.createTarget);
  router.patch("/targets/:id", ...mutation("KPI_MANAGE_TARGETS"), controller.updateTarget);
  router.get("/configurations", authentication, requirePasswordChanged, requirePermission("KPI_MANAGE_CONFIGURATION"), controller.configurations);
  router.post("/configurations", ...mutation("KPI_MANAGE_CONFIGURATION"), controller.createConfiguration);
  return router;
}
