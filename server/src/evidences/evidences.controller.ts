import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { normalizeDownloadName } from "./evidences.file-validation.js";
import { archiveEvidenceSchema, evidenceIdSchema, evidenceListQuerySchema, evidenceResourceParamsSchema, updateEvidenceSchema } from "./evidences.schemas.js";
import type { EvidenceService } from "./evidences.service.js";
import type { EvidenceMultipartParser } from "./evidences.multipart.js";
import type { EvidenceActorContext, EvidenceResource } from "./evidences.types.js";

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

function resource(request: Request, type: "ORDER" | "ACTIVITY"): EvidenceResource {
  const { resourceId } = parse(evidenceResourceParamsSchema.safeParse({ resourceType: type, resourceId: type === "ORDER" ? request.params.orderId : request.params.activityId }));
  return { type, id: resourceId };
}

function success(request: Request, response: Response, status: number, message: string, data: unknown): void {
  response.status(status).json({ success: true, message, data, errors: [], meta: { requestId: request.requestId } });
}

function attachmentHeader(originalName: string, extension: "jpg" | "png" | "webp" | "pdf"): string {
  const name = normalizeDownloadName(originalName, extension);
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function createEvidencesController(service: EvidenceService, multipart: EvidenceMultipartParser) {
  const upload = (type: "ORDER" | "ACTIVITY") => async (req: Request, res: Response, next: NextFunction) => {
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
  const list = (type: "ORDER" | "ACTIVITY") => async (req: Request, res: Response, next: NextFunction) => {
    try {
      success(req, res, 200, "Evidencias consultadas", await service.listEvidence(resource(req, type), parse(evidenceListQuerySchema.safeParse(req.query)), actor(req)));
    } catch (error) { next(error); }
  };
  return {
    uploadOrder: upload("ORDER"), uploadActivity: upload("ACTIVITY"),
    listOrder: list("ORDER"), listActivity: list("ACTIVITY"),
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
          if (res.headersSent) res.destroy(error);
          else next(error);
        });
        stream.pipe(res);
        if (context.permissions.includes("EVIDENCES_MANAGE")) {
          void service.recordDownload(evidenceId, context).catch(() => {
            try { req.log?.error({ requestId: req.requestId }, "Evidence download audit failed"); } catch { /* operational logging cannot corrupt a transfer */ }
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
