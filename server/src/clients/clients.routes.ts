import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import { requirePasswordChanged, requirePermission } from "../middlewares/permission.middleware.js";
import { createClientsController } from "./clients.controller.js";
import { createClientsRepository } from "./clients.repository.js";
import { createClientsService } from "./clients.service.js";

export function createClientsRouter(
  env: Environment,
  database: PrismaClient,
  authService: AuthService,
) {
  const router = Router();
  const authentication = createAuthenticationMiddleware(authService);
  const controller = createClientsController(
    createClientsService(createClientsRepository(database)),
  );
  const readSecurity = [
    authentication,
    requirePasswordChanged,
    requirePermission("CLIENTS_VIEW"),
  ];
  const mutationSecurity = [
    requireAllowedOrigin(env.CORS_ORIGINS),
    authentication,
    requirePasswordChanged,
    requirePermission("CLIENTS_MANAGE"),
  ];

  router.get("/", ...readSecurity, controller.listClients);
  router.get("/:clientId/branches", ...readSecurity, controller.listBranches);
  router.get("/:clientId/contacts", ...readSecurity, controller.listContacts);
  router.get("/:clientId", ...readSecurity, controller.getClient);
  router.post("/", ...mutationSecurity, controller.createClient);
  router.patch("/:clientId", ...mutationSecurity, controller.updateClient);
  router.delete("/:clientId", ...mutationSecurity, controller.deactivateClient);
  router.post("/:clientId/reactivate", ...mutationSecurity, controller.reactivateClient);
  router.post("/:clientId/branches", ...mutationSecurity, controller.createBranch);
  router.patch("/:clientId/branches/:branchId", ...mutationSecurity, controller.updateBranch);
  router.delete("/:clientId/branches/:branchId", ...mutationSecurity, controller.deactivateBranch);
  router.post("/:clientId/branches/:branchId/reactivate", ...mutationSecurity, controller.reactivateBranch);
  router.post("/:clientId/contacts", ...mutationSecurity, controller.createContact);
  router.patch("/:clientId/contacts/:contactId", ...mutationSecurity, controller.updateContact);
  router.delete("/:clientId/contacts/:contactId", ...mutationSecurity, controller.deactivateContact);
  router.post("/:clientId/contacts/:contactId/reactivate", ...mutationSecurity, controller.reactivateContact);
  return router;
}
