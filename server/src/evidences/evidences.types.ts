import type { NivelAccesoEvidencia } from "../../generated/prisma/client.js";
import type { EvidenceFormat } from "./evidences.file-validation.js";
import type { TemporaryEvidence } from "./evidences.storage.js";

type EvidenceAccessLevel = Exclude<NivelAccesoEvidencia, "CLIENT">;

export type EvidenceOperationalEvent =
  | "EVIDENCE_DOWNLOAD_AUDIT_FAILED"
  | "EVIDENCE_STORAGE_CLEANUP_FAILED"
  | "EVIDENCE_STORAGE_UNAVAILABLE";

export type EvidenceOperationalLogger = (
  event: EvidenceOperationalEvent,
  requestId: string,
) => void;

export type EvidenceResource =
  | { type: "ORDER"; id: string }
  | { type: "ACTIVITY"; id: string }
  | { type: "RECURRENCE"; id: string };

export interface EvidenceActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
}

export interface EvidencePublic {
  id: string;
  originalName: string;
  mimeType: EvidenceFormat["mimeType"];
  fileExtension: EvidenceFormat["extension"];
  sizeBytes: number;
  description: string | null;
  accessLevel: EvidenceAccessLevel;
  uploadedBy: { id: string; displayName: string };
  resourceType: "ORDER" | "ACTIVITY" | "RECURRENCE";
  resourceId: string;
  checksumSha256: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEvidencePersistenceInput {
  resource: EvidenceResource;
  originalName: string;
  storedName: string;
  mimeType: EvidencePublic["mimeType"];
  fileExtension: EvidencePublic["fileExtension"];
  sizeBytes: number;
  storageKey: string;
  checksumSha256: string;
  description: string | null;
  accessLevel: EvidenceAccessLevel;
}

export interface UpdateEvidenceInput {
  description?: string | null;
  accessLevel?: EvidenceAccessLevel;
  version: number;
}

export interface ArchiveEvidenceInput {
  reason: string;
  version: number;
}

export interface EvidenceListFilters {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface IncomingEvidenceUpload {
  file: TemporaryEvidence & {
    originalName: string;
    declaredMimeType: string;
  };
  description?: string;
  accessLevel?: EvidenceAccessLevel;
}
