import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { normalizeDownloadName } from "./evidences.file-validation.js";
import { archiveEvidenceSchema, evidenceIdSchema, evidenceListQuerySchema, evidenceResourceParamsSchema, updateEvidenceSchema } from "./evidences.schemas.js";
import type { EvidenceService } from "./evidences.service.js";
import type { EvidenceMultipartParser } from "./evidences.multipart.js";
import type {
  EvidenceActorContext,
  EvidenceOperationalEvent,
  EvidenceOperationalLogger,
  EvidenceResource,
} from "./evidences.types.js";

function validationError(error: ZodError): ApiError {
  return new ApiError(400, "Los datos enviados no son válidos", "VALIDATION_ERROR", error.issues.map((issue) => ({ field: issue.path.join("."), code: "VALIDATION_ERROR", message: issue.message })));
}

function parse<T extends Record<string, unknown>>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function actor(request: Request): EvidenceActorContext {
  return { userId: request.auth!.userId, technicianId: request.auth!.technicianId, permissions: request.auth!.permissions, requestId: request.requestId };
}

function resource(request: Request, type: EvidenceResource["type"]): EvidenceResource {
  const resourceId = type === "ORDER"
    ? request.params.orderId
    : type === "ACTIVITY"
      ? request.params.activityId
      : request.params.recurrenceId;
  const parsed = parse(evidenceResourceParamsSchema.safeParse({ resourceType: type, resourceId }));
  return { type, id: parsed.resourceId };
}

function success(request: Request, response: Response, status: number, message: string, data: unknown): void {
  response.status(status).json({ success: true, message, data, errors: [], meta: { requestId: request.requestId } });
}

const evidenceDownloadHeaders = [
  "Content-Type",
  "Content-Length",
  "Content-Disposition",
  "X-Content-Type-Options",
  "Cache-Control",
] as const;

function downloadStorageUnavailable(): ApiError {
  return new ApiError(
    503,
    "El almacenamiento de evidencias no está disponible",
    "EVIDENCE_STORAGE_UNAVAILABLE",
  );
}

function attachmentHeader(originalName: string, extension: "jpg" | "png" | "webp" | "pdf"): string {
  let name: string;
  try {
    name = normalizeDownloadName(originalName, extension);
  } catch {
    name = `evidence.${extension}`;
  }
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function createEvidencesController(
  service: EvidenceService,
  multipart: EvidenceMultipartParser,
  logOperationalError?: EvidenceOperationalLogger,
) {
  const safelyLogOperationalError = (
    event: EvidenceOperationalEvent,
    requestId: string,
  ): void => {
    try {
      logOperationalError?.(event, requestId);
    } catch {
      // Observational logging must never alter the HTTP response.
    }
  };
  const upload = (type: EvidenceResource["type"]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const target = resource(req, type);
      const context = actor(req);
      await service.prepareUpload(target, context);
      const parsed = await multipart.parse(req);
      const evidence = await service.createEvidence(target, {
        file: parsed.file,
        ...(parsed.description !== undefined && { description: parsed.description }),
        ...(parsed.accessLevel !== undefined && { accessLevel: parsed.accessLevel }),
      }, context);
      res.location(`/api/v1/evidences/${evidence.id}`);
      success(req, res, 201, "Evidencia cargada", evidence);
    } catch (error) { next(error); }
  };
  const list = (type: EvidenceResource["type"]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      success(req, res, 200, "Evidencias consultadas", await service.listEvidence(resource(req, type), parse(evidenceListQuerySchema.safeParse(req.query)), actor(req)));
    } catch (error) { next(error); }
  };
  return {
    uploadOrder: upload("ORDER"), uploadActivity: upload("ACTIVITY"), uploadRecurrence: upload("RECURRENCE"),
    listOrder: list("ORDER"), listActivity: list("ACTIVITY"), listRecurrence: list("RECURRENCE"),
    download: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { evidenceId } = parse(evidenceIdSchema.safeParse(req.params));
        const context = actor(req);
        const { evidence, stream } = await service.getDownload(evidenceId, context);
        res.status(200).set({
          "Content-Type": evidence.mimeType,
          "Content-Length": String(evidence.sizeBytes),
          "Content-Disposition": attachmentHeader(evidence.originalName, evidence.fileExtension),
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        });
        stream.once("error", (error) => {
          safelyLogOperationalError("EVIDENCE_STORAGE_UNAVAILABLE", req.requestId);
          if (res.headersSent) {
            res.destroy(error);
            return;
          }
          for (const header of evidenceDownloadHeaders) {
            res.removeHeader(header);
          }
          next(downloadStorageUnavailable());
        });
        stream.pipe(res);
        if (context.permissions.includes("EVIDENCES_MANAGE")) {
          void service.recordDownload(evidenceId, context).catch(() => {
            safelyLogOperationalError("EVIDENCE_DOWNLOAD_AUDIT_FAILED", req.requestId);
          });
        }
      } catch (error) { next(error); }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { evidenceId } = parse(evidenceIdSchema.safeParse(req.params));
        const input = parse(updateEvidenceSchema.safeParse(req.body));
        success(req, res, 200, "Evidencia actualizada", await service.updateEvidence(evidenceId, {
          version: input.version,
          ...(input.description !== undefined && { description: input.description }),
          ...(input.accessLevel !== undefined && { accessLevel: input.accessLevel }),
        }, actor(req)));
      } catch (error) { next(error); }
    },
    archive: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { evidenceId } = parse(evidenceIdSchema.safeParse(req.params));
        success(req, res, 200, "Evidencia archivada", await service.archiveEvidence(evidenceId, parse(archiveEvidenceSchema.safeParse(req.body)), actor(req)));
      } catch (error) { next(error); }
    },
  };
}
