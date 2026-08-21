import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  InvalidEvidenceFileError,
  detectEvidenceFormat,
  normalizeDownloadName,
} from "./evidences.file-validation.js";
import { mapEvidence } from "./evidences.mapper.js";
import type {
  EvidenceFailureKind,
  EvidenceMutationRepository,
  EvidenceMutationResult,
  EvidenceReadRepository,
} from "./evidences.repository.types.js";
import {
  EvidenceSizeLimitError,
  type EvidenceStorage,
} from "./evidences.storage.js";
import type {
  ArchiveEvidenceInput,
  EvidenceActorContext,
  EvidenceListFilters,
  EvidenceOperationalEvent,
  EvidenceOperationalLogger,
  EvidencePublic,
  EvidenceResource,
  IncomingEvidenceUpload,
  PaginationMeta,
  UpdateEvidenceInput,
} from "./evidences.types.js";
import { ApiError } from "../utils/api-error.js";

export interface EvidenceService {
  prepareUpload(resource: EvidenceResource, actor: EvidenceActorContext): Promise<void>;
  createEvidence(resource: EvidenceResource, upload: IncomingEvidenceUpload, actor: EvidenceActorContext): Promise<EvidencePublic>;
  listEvidence(resource: EvidenceResource, filters: EvidenceListFilters, actor: EvidenceActorContext): Promise<{ items: EvidencePublic[]; pagination: PaginationMeta }>;
  getDownload(id: string, actor: EvidenceActorContext): Promise<{ evidence: EvidencePublic; stream: Readable }>;
  updateEvidence(id: string, input: UpdateEvidenceInput, actor: EvidenceActorContext): Promise<EvidencePublic>;
  archiveEvidence(id: string, input: ArchiveEvidenceInput, actor: EvidenceActorContext): Promise<EvidencePublic>;
  recordDownload(id: string, actor: EvidenceActorContext): Promise<void>;
}

export interface EvidencesServiceDependencies {
  readRepository: EvidenceReadRepository;
  mutationRepository: EvidenceMutationRepository;
  storage: EvidenceStorage;
  now?: () => Date;
  createId?: () => string;
  logOperationalError?: EvidenceOperationalLogger;
}

const statusByKind: Record<EvidenceFailureKind, number> = {
  EVIDENCE_NOT_FOUND: 404,
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_CANCELLED: 409,
  RESOURCE_INACTIVE: 409,
  VERSION_CONFLICT: 409,
};

function forbidden(): ApiError {
  return new ApiError(403, "No tiene permiso para realizar esta acción", "FORBIDDEN");
}

function notFound(code: "RESOURCE_NOT_FOUND" | "EVIDENCE_NOT_FOUND"): ApiError {
  return new ApiError(404, "El recurso solicitado no existe", code);
}

function storageUnavailable(): ApiError {
  return new ApiError(503, "El almacenamiento de evidencias no está disponible", "EVIDENCE_STORAGE_UNAVAILABLE");
}

function hasPermission(actor: EvidenceActorContext, permission: string): boolean {
  return actor.permissions.includes(permission);
}

function isManagement(actor: EvidenceActorContext): boolean {
  return hasPermission(actor, "EVIDENCES_MANAGE");
}

function requireTechnicianProfileWhenNeeded(actor: EvidenceActorContext): void {
  if (!isManagement(actor) && actor.technicianId === null) throw forbidden();
}

function requireView(actor: EvidenceActorContext): void {
  if (!hasPermission(actor, "EVIDENCES_VIEW")) throw forbidden();
  requireTechnicianProfileWhenNeeded(actor);
}

function requireUpload(actor: EvidenceActorContext): void {
  if (!hasPermission(actor, "EVIDENCES_UPLOAD")) throw forbidden();
  requireTechnicianProfileWhenNeeded(actor);
}

function requireManagement(actor: EvidenceActorContext): void {
  if (!isManagement(actor)) throw forbidden();
}

function accessLevelForUpload(
  upload: IncomingEvidenceUpload,
  actor: EvidenceActorContext,
): "TECHNICIAN" | "INTERNAL" {
  if (!isManagement(actor)) return "TECHNICIAN";
  if (upload.accessLevel === undefined || upload.accessLevel === "TECHNICIAN" || upload.accessLevel === "INTERNAL") {
    return upload.accessLevel ?? "TECHNICIAN";
  }
  throw new ApiError(422, "El nivel de acceso de evidencia no es válido", "INVALID_EVIDENCE_ACCESS_LEVEL");
}

function mutationError(result: Exclude<EvidenceMutationResult, { kind: "CREATED" | "UPDATED" }>): ApiError {
  return new ApiError(
    statusByKind[result.kind],
    result.kind === "VERSION_CONFLICT"
      ? "La evidencia fue modificada por otra operación"
      : result.kind === "RESOURCE_CANCELLED"
        ? "El recurso está cancelado"
        : result.kind === "RESOURCE_INACTIVE"
          ? "El recurso no está activo"
          : "El recurso solicitado no existe",
    result.kind,
  );
}

function mapStorageOrValidationError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof EvidenceSizeLimitError) {
    return new ApiError(413, "El archivo de evidencia excede el tamaño permitido", "EVIDENCE_TOO_LARGE");
  }
  if (error instanceof InvalidEvidenceFileError) {
    return new ApiError(422, "El archivo de evidencia no es válido", "INVALID_EVIDENCE_FILE");
  }
  return storageUnavailable();
}

function pagination(filters: EvidenceListFilters, totalItems: number): PaginationMeta {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / filters.pageSize),
  };
}

export function createEvidencesService({
  readRepository,
  mutationRepository,
  storage,
  now = () => new Date(),
  createId = randomUUID,
  logOperationalError,
}: EvidencesServiceDependencies): EvidenceService {
  function safelyLogOperationalError(
    event: EvidenceOperationalEvent,
    actor: EvidenceActorContext,
  ): void {
    try {
      logOperationalError?.(event, actor.requestId);
    } catch {
      // Logging is observational: it must never alter evidence cleanup or the public error.
    }
  }

  async function safelyRemove(key: string, actor: EvidenceActorContext): Promise<void> {
    try {
      await storage.remove(key);
    } catch {
      safelyLogOperationalError("EVIDENCE_STORAGE_CLEANUP_FAILED", actor);
    }
  }

  async function prepareUpload(resource: EvidenceResource, actor: EvidenceActorContext): Promise<void> {
    requireUpload(actor);
    const target = await readRepository.findUploadTarget(resource, actor);
    if (target === null) throw notFound("RESOURCE_NOT_FOUND");
    if (target.status === "CANCELLED") {
      throw new ApiError(409, "El recurso está cancelado", "RESOURCE_CANCELLED");
    }
    if (resource.type === "RECURRENCE"
      && target.status !== "OPEN"
      && target.status !== "ANALYSIS"
      && target.status !== "CORRECTION") {
      throw new ApiError(409, "El recurso no está activo", "RESOURCE_INACTIVE");
    }
  }

  return {
    prepareUpload,

    async createEvidence(resource, upload, actor) {
      let finalKey: string | null = null;
      let promoted = false;
      let persisted = false;

      try {
        await prepareUpload(resource, actor);
        const head = await storage.readHead(upload.file.tempKey, 16);
        const format = detectEvidenceFormat({
          originalName: upload.file.originalName,
          declaredMimeType: upload.file.declaredMimeType,
          head,
          sizeBytes: upload.file.sizeBytes,
        });
        const normalizedOriginalName = normalizeDownloadName(
          upload.file.originalName,
          format.extension,
        );
        const timestamp = now();
        const storedName = `${createId()}.${format.extension}`;
        finalKey = `files/${timestamp.getUTCFullYear()}/${String(timestamp.getUTCMonth() + 1).padStart(2, "0")}/${storedName}`;
        const result = await mutationRepository.createEvidence({
          resource,
          originalName: normalizedOriginalName,
          storedName,
          mimeType: format.mimeType,
          fileExtension: format.extension,
          sizeBytes: upload.file.sizeBytes,
          storageKey: finalKey,
          checksumSha256: upload.file.checksumSha256,
          description: upload.description ?? null,
          accessLevel: accessLevelForUpload(upload, actor),
        }, actor, timestamp, async () => {
          await storage.promote(upload.file.tempKey, finalKey!);
          promoted = true;
        });
        if (result.kind !== "CREATED") throw mutationError(result as { kind: EvidenceFailureKind });
        persisted = true;
        return mapEvidence(result.evidence);
      } catch (error) {
        const publicError = mapStorageOrValidationError(error);
        if (publicError.code === "EVIDENCE_STORAGE_UNAVAILABLE") {
          safelyLogOperationalError("EVIDENCE_STORAGE_UNAVAILABLE", actor);
        }
        throw publicError;
      } finally {
        if (promoted && !persisted && finalKey !== null) {
          await safelyRemove(finalKey, actor);
        }
        await safelyRemove(upload.file.tempKey, actor);
      }
    },

    async listEvidence(resource, filters, actor) {
      requireView(actor);
      const result = await readRepository.listEvidence(resource, filters, actor);
      if (result === null) throw notFound("RESOURCE_NOT_FOUND");
      return {
        items: result.items.map(mapEvidence),
        pagination: pagination(filters, result.totalItems),
      };
    },

    async getDownload(id, actor) {
      requireView(actor);
      const record = await readRepository.findDownloadableEvidence(id, actor);
      if (record === null) throw notFound("EVIDENCE_NOT_FOUND");
      try {
        return { evidence: mapEvidence(record), stream: await storage.open(record.storageKey) };
      } catch (error) {
        const publicError = mapStorageOrValidationError(error);
        if (publicError.code === "EVIDENCE_STORAGE_UNAVAILABLE") {
          safelyLogOperationalError("EVIDENCE_STORAGE_UNAVAILABLE", actor);
        }
        throw publicError;
      }
    },

    async updateEvidence(id, input, actor) {
      requireManagement(actor);
      const result = await mutationRepository.updateEvidence(id, input, actor, now());
      if (result.kind !== "UPDATED") throw mutationError(result as { kind: EvidenceFailureKind });
      return mapEvidence(result.evidence);
    },

    async archiveEvidence(id, input, actor) {
      requireManagement(actor);
      const result = await mutationRepository.archiveEvidence(id, input, actor, now());
      if (result.kind !== "UPDATED") throw mutationError(result as { kind: EvidenceFailureKind });
      return mapEvidence(result.evidence);
    },

    async recordDownload(id, actor) {
      requireManagement(actor);
      await mutationRepository.recordAdministrativeDownload(id, actor, now());
    },
  };
}
