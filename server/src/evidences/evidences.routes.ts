import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Logger } from "pino";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import { requirePasswordChanged, requirePermission } from "../middlewares/permission.middleware.js";
import { createEvidencesController } from "./evidences.controller.js";
import { createEvidenceMultipartParser } from "./evidences.multipart.js";
import { createEvidencesMutationRepository } from "./evidences.mutation.repository.js";
import { createEvidencesReadRepository } from "./evidences.read.repository.js";
import { createEvidencesService } from "./evidences.service.js";
import type { EvidenceStorage } from "./evidences.storage.js";
import type { EvidenceOperationalLogger } from "./evidences.types.js";

export function createEvidencesRouter(
  env: Environment,
  database: PrismaClient,
  authService: AuthService,
  storage: EvidenceStorage,
  logger: Logger,
) {
  const router = Router();
  const authentication = createAuthenticationMiddleware(authService);
  const logOperationalError: EvidenceOperationalLogger = (event, requestId) => {
    try {
      logger.error({ event, code: event, requestId }, "Evidence operational failure");
    } catch {
      // Logging is observational and must never alter evidence handling.
    }
  };
  const service = createEvidencesService({
    readRepository: createEvidencesReadRepository(database),
    mutationRepository: createEvidencesMutationRepository(database),
    storage,
    logOperationalError,
  });
  const multipart = createEvidenceMultipartParser({
    storage,
    maxBytes: env.EVIDENCE_MAX_BYTES,
    logOperationalError,
  });
  const controller = createEvidencesController(service, multipart, logOperationalError);
  const read = [authentication, requirePasswordChanged, requirePermission("EVIDENCES_VIEW")] as const;
  const upload = [authentication, requirePasswordChanged, requireAllowedOrigin(env.CORS_ORIGINS), requirePermission("EVIDENCES_UPLOAD")] as const;
  const manage = [authentication, requirePasswordChanged, requireAllowedOrigin(env.CORS_ORIGINS), requirePermission("EVIDENCES_MANAGE")] as const;
  router.post("/orders/:orderId/evidences", ...upload, controller.uploadOrder);
  router.get("/orders/:orderId/evidences", ...read, controller.listOrder);
  router.post("/activities/:activityId/evidences", ...upload, controller.uploadActivity);
  router.get("/activities/:activityId/evidences", ...read, controller.listActivity);
  router.post("/recurrences/:recurrenceId/evidences", ...upload, controller.uploadRecurrence);
  router.get("/recurrences/:recurrenceId/evidences", ...read, controller.listRecurrence);
  router.get("/evidences/:evidenceId/download", ...read, controller.download);
  router.patch("/evidences/:evidenceId", ...manage, controller.update);
  router.post("/evidences/:evidenceId/archive", ...manage, controller.archive);
  return router;
}
