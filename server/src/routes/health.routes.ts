import { Router } from "express";
import type { Environment } from "../config/env.js";
import { createHealthController } from "../controllers/health.controller.js";

export function createHealthRouter(env: Environment) {
  const router = Router();
  router.get("/", createHealthController(env));
  return router;
}
