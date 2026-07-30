import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthRouter } from "../auth/auth.routes.js";
import type { Environment } from "../config/env.js";
import { createHealthRouter } from "./health.routes.js";

export function createApiRouter(
  env: Environment,
  database: PrismaClient,
) {
  const router = Router();
  router.use("/health", createHealthRouter(env));
  router.use("/auth", createAuthRouter(env, database));
  return router;
}
