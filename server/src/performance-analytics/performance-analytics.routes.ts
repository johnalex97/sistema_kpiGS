import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAnyPermission, requirePasswordChanged } from "../middlewares/permission.middleware.js";
import { createPerformanceAnalyticsController } from "./performance-analytics.controller.js";
import { createPerformanceAnalyticsRepository } from "./performance-analytics.repository.js";
import { createPerformanceAnalyticsService } from "./performance-analytics.service.js";

export function createPerformanceAnalyticsRouter(env: Environment, database: PrismaClient, authService: AuthService) {
  const router = Router();
  const controller = createPerformanceAnalyticsController(createPerformanceAnalyticsService(createPerformanceAnalyticsRepository(database), env.KPI_TIME_ZONE));
  const read = [createAuthenticationMiddleware(authService), requirePasswordChanged, requireAnyPermission("KPI_VIEW_ALL", "KPI_VIEW_OWN")] as const;
  router.get("/summary", ...read, controller.summary);
  router.get("/export.csv", ...read, controller.exportCsv);
  return router;
}
