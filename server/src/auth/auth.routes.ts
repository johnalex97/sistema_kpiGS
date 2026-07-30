import { Router } from "express";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import { createAuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

export function createAuthRouter(
  env: Environment,
  service: AuthService,
) {
  const router = Router();
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
