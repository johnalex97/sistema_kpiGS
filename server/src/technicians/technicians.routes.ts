import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import {
  requirePasswordChanged,
  requirePermission,
} from "../middlewares/permission.middleware.js";
import { createTechniciansController } from "./technicians.controller.js";
import { createTechniciansRepository } from "./technicians.repository.js";
import { createTechniciansService } from "./technicians.service.js";

export function createTechniciansRouter(
  env: Environment,
  database: PrismaClient,
  authService: AuthService,
) {
  const router = Router();
  const authentication = createAuthenticationMiddleware(authService);
  const controller = createTechniciansController(
    createTechniciansService({
      repository: createTechniciansRepository(database),
      now: () => new Date(),
      today: () => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${now.getFullYear()}-${month}-${day}`;
      },
    }),
  );
  const readSecurity = [
    authentication,
    requirePasswordChanged,
    requirePermission("TECHNICIANS_VIEW"),
  ];
  const mutationSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS),
    authentication,
    requirePasswordChanged,
    requirePermission("TECHNICIANS_MANAGE"),
  ];

  router.get("/", ...readSecurity, controller.list);
  router.get("/:id", ...readSecurity, controller.get);
  router.post("/", ...mutationSecurity, controller.create);
  router.patch("/:id/status", ...mutationSecurity, controller.changeStatus);
  router.patch("/:id", ...mutationSecurity, controller.update);
  router.delete("/:id", ...mutationSecurity, controller.deactivate);
  router.post("/:id/reactivate", ...mutationSecurity, controller.reactivate);
  return router;
}
