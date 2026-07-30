import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRepository } from "./auth.repository.js";
import { createAuthService } from "./auth.service.js";

export function createAuthRouter(
  env: Environment,
  database: PrismaClient,
) {
  const router = Router();
  const service = createAuthService({
    repository: createAuthRepository(database),
    now: () => new Date(),
    config: {
      sessionTtlMinutes: env.AUTH_SESSION_TTL_MINUTES,
      sessionIdleMinutes: env.AUTH_SESSION_IDLE_MINUTES,
      maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
      lockMinutes: env.AUTH_LOCK_MINUTES,
    },
  });
  const controller = createAuthController(env, service);
  const authentication = createAuthenticationMiddleware(service);

  router.post(
    "/login",
    requireAllowedOrigin(env.CORS_ORIGINS),
    controller.login,
  );
  router.get("/me", authentication, controller.me);
  router.post(
    "/change-password",
    requireAllowedOrigin(env.CORS_ORIGINS),
    authentication,
    controller.changePassword,
  );
  router.post(
    "/logout",
    requireAllowedOrigin(env.CORS_ORIGINS),
    controller.logout,
  );

  return router;
}
