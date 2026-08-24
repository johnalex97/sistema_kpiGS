import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import {
  requireAnyPermission,
  requirePasswordChanged,
} from "../middlewares/permission.middleware.js";
import { createRecurrencesController } from "./recurrences.controller.js";
import { createRecurrencesReadRepository } from "./recurrences.read.repository.js";
import { createRecurrencesReportRepository } from "./recurrences.report.repository.js";
import { createRecurrenceService } from "./recurrences.service.js";
import { createRecurrencesWorkflowRepository } from "./recurrences.workflow.repository.js";

export function createRecurrencesRouter(
  env: Environment,
  database: PrismaClient,
  authService: AuthService,
  processRevisionRequests: (limit: number, now: Date) => Promise<unknown> = async () => undefined,
) {
  const router = Router();
  const authentication = createAuthenticationMiddleware(authService);
  const controller = createRecurrencesController(
    createRecurrenceService(
      {
        ...createRecurrencesReadRepository(database),
        ...createRecurrencesReportRepository(database),
        ...createRecurrencesWorkflowRepository(database),
      },
      () => new Date(),
      env.RECURRENCE_WARNING_DAYS,
      processRevisionRequests,
    ),
  );
  const readSecurity = [
    authentication,
    requirePasswordChanged,
    requireAnyPermission(
      "RECURRENCES_VIEW_ALL",
      "RECURRENCES_VIEW_OWN",
      "RECURRENCES_REVIEW",
    ),
  ] as const;
  const writeSecurity = (...permissions: readonly string[]) => [
    requireAllowedOrigin(env.CORS_ORIGINS),
    authentication,
    requirePasswordChanged,
    requireAnyPermission(...permissions),
  ] as const;
  const reportSecurity = writeSecurity(
    "RECURRENCES_REPORT_OWN",
    "RECURRENCES_REVIEW",
  );
  const reviewSecurity = writeSecurity("RECURRENCES_REVIEW");
  const noteSecurity = writeSecurity(
    "RECURRENCES_VIEW_OWN",
    "RECURRENCES_REVIEW",
  );

  router.get("/catalog", ...readSecurity, controller.catalog);
  router.get("/", ...readSecurity, controller.list);
  router.post("/", ...reportSecurity, controller.report);
  router.get("/:recurrenceId", ...readSecurity, controller.detail);
  router.post("/:recurrenceId/analysis", ...reviewSecurity, controller.analyze);
  router.post("/:recurrenceId/correction", ...reviewSecurity, controller.correct);
  router.post("/:recurrenceId/visits", ...reviewSecurity, controller.addVisit);
  router.post("/:recurrenceId/notes", ...noteSecurity, controller.addNote);
  router.post("/:recurrenceId/dismiss", ...reviewSecurity, controller.dismiss);
  router.post("/:recurrenceId/close", ...reviewSecurity, controller.close);
  router.post("/:recurrenceId/adjust", ...reviewSecurity, controller.adjust);
  return router;
}
