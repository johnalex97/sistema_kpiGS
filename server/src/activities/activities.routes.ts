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
import { createActivitiesController } from "./activities.controller.js";
import { createActivitiesMutationRepository } from "./activities.mutation.repository.js";
import { createActivitiesOperationRepository } from "./activities.operation.repository.js";
import { createActivitiesReadRepository } from "./activities.read.repository.js";
import { createActivitiesService } from "./activities.service.js";

export function createActivitiesRouter(
  env: Environment,
  database: PrismaClient,
  authService: AuthService,
) {
  const router = Router();
  const authentication = createAuthenticationMiddleware(authService);
  const controller = createActivitiesController(createActivitiesService({
    ...createActivitiesReadRepository(database),
    ...createActivitiesMutationRepository(database),
    ...createActivitiesOperationRepository(database),
  }));
  const readPermissions = [
    "ACTIVITIES_VIEW_ALL",
    "ACTIVITIES_MANAGE",
    "ACTIVITIES_CREATE_OWN",
    "ACTIVITIES_OPERATE_OWN",
  ] as const;
  const readSecurity = [authentication, requirePasswordChanged, requireAnyPermission(...readPermissions)];
  const createSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS), authentication, requirePasswordChanged,
    requireAnyPermission("ACTIVITIES_MANAGE", "ACTIVITIES_CREATE_OWN"),
  ];
  const manageSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS), authentication, requirePasswordChanged,
    requirePermission("ACTIVITIES_MANAGE"),
  ];
  const operateSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS), authentication, requirePasswordChanged,
    requireAnyPermission("ACTIVITIES_MANAGE", "ACTIVITIES_OPERATE_OWN"),
  ];

  router.get("/activity-types", ...readSecurity, controller.listTypes);
  router.get("/activities", ...readSecurity, controller.list);
  router.post("/activities", ...createSecurity, controller.create);
  router.post("/activities/manual", ...createSecurity, controller.manual);
  router.get("/activities/:activityId", ...readSecurity, controller.detail);
  router.patch("/activities/:activityId", ...createSecurity, controller.update);
  router.put("/activities/:activityId/team", ...manageSecurity, controller.team);
  router.post("/activities/:activityId/start", ...operateSecurity, controller.start);
  router.post("/activities/:activityId/pause", ...operateSecurity, controller.pause);
  router.post("/activities/:activityId/resume", ...operateSecurity, controller.resume);
  router.post("/activities/:activityId/complete", ...operateSecurity, controller.complete);
  router.post("/activities/:activityId/cancel", ...createSecurity, controller.cancel);
  router.post("/activities/:activityId/adjustments", ...manageSecurity, controller.adjust);
  return router;
}
