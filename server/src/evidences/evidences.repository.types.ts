import type {
  EstadoActividad,
  EstadoOrden,
  EstadoReincidencia,
  Prisma,
} from "../../generated/prisma/client.js";
import type {
  ArchiveEvidenceInput,
  CreateEvidencePersistenceInput,
  EvidenceActorContext,
  EvidenceListFilters,
  EvidenceResource,
  UpdateEvidenceInput,
} from "./evidences.types.js";

export const evidenceRecordSelect = {
  id: true,
  originalName: true,
  storedName: true,
  mimeType: true,
  fileExtension: true,
  sizeBytes: true,
  storageKey: true,
  checksumSha256: true,
  description: true,
  accessLevel: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedById: true,
  deletionReason: true,
  version: true,
  uploadedBy: { select: { id: true, displayName: true } },
  orden: { select: { id: true } },
  actividad: { select: { id: true } },
  reincidencia: { select: { id: true } },
} as const satisfies Prisma.EvidenciaSelect;

export type EvidenceRecord = Prisma.EvidenciaGetPayload<{
  select: typeof evidenceRecordSelect;
}>;

export interface PageRecord<T> {
  items: T[];
  totalItems: number;
}

export type EvidenceFailureKind =
  | "EVIDENCE_NOT_FOUND"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_CANCELLED"
  | "VERSION_CONFLICT"
  | "RESOURCE_INACTIVE";

export type EvidenceMutationResult =
  | { kind: "CREATED" | "UPDATED"; evidence: EvidenceRecord }
  | { kind: EvidenceFailureKind };

export interface EvidenceReadRepository {
  findUploadTarget(
    resource: EvidenceResource,
    actor: EvidenceActorContext,
  ): Promise<{ status: EstadoOrden | EstadoActividad | EstadoReincidencia } | null>;
  listEvidence(
    resource: EvidenceResource,
    filters: EvidenceListFilters,
    actor: EvidenceActorContext,
  ): Promise<PageRecord<EvidenceRecord> | null>;
  findDownloadableEvidence(
    id: string,
    actor: EvidenceActorContext,
  ): Promise<EvidenceRecord | null>;
  listMetadataStorageKeys(): Promise<string[]>;
}

export interface EvidenceMutationRepository {
  createEvidence(
    input: CreateEvidencePersistenceInput,
    actor: EvidenceActorContext,
    now: Date,
    promote: () => Promise<void>,
  ): Promise<EvidenceMutationResult>;
  updateEvidence(
    id: string,
    input: UpdateEvidenceInput,
    actor: EvidenceActorContext,
    now: Date,
  ): Promise<EvidenceMutationResult>;
  archiveEvidence(
    id: string,
    input: ArchiveEvidenceInput,
    actor: EvidenceActorContext,
    now: Date,
  ): Promise<EvidenceMutationResult>;
  recordAdministrativeDownload(
    id: string,
    actor: EvidenceActorContext,
    now: Date,
  ): Promise<void>;
}
