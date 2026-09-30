import { Router } from "express";
import type { AuthService } from "../auth/auth.service.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAnyPermission, requirePasswordChanged } from "../middlewares/permission.middleware.js";
import { createDashboardController, type DashboardService } from "./dashboard.controller.js";

export function createDashboardRouter(authService: AuthService, service: DashboardService) {
  const router = Router();
  const controller = createDashboardController(service);
  router.get(
    "/operational",
    createAuthenticationMiddleware(authService),
    requirePasswordChanged,
    requireAnyPermission("KPI_VIEW_ALL", "KPI_VIEW_OWN"),
    controller.operational,
  );
  return router;
}
