import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthRouter } from "../auth/auth.routes.js";
import { createAuthRepository } from "../auth/auth.repository.js";
import { createAuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createClientsRouter } from "../clients/clients.routes.js";
import { createTechniciansRouter } from "../technicians/technicians.routes.js";
import { createHealthRouter } from "./health.routes.js";

export function createApiRouter(
  env: Environment,
  database: PrismaClient,
) {
  const router = Router();
  const authService = createAuthService({
    repository: createAuthRepository(database),
    now: () => new Date(),
    config: {
      sessionTtlMinutes: env.AUTH_SESSION_TTL_MINUTES,
      sessionIdleMinutes: env.AUTH_SESSION_IDLE_MINUTES,
      maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
      lockMinutes: env.AUTH_LOCK_MINUTES,
    },
  });
  router.use("/health", createHealthRouter(env));
  router.use("/auth", createAuthRouter(env, authService));
  router.use("/clients", createClientsRouter(env, database, authService));
  router.use(
    "/technicians",
    createTechniciansRouter(env, database, authService),
  );
  return router;
}
