import type { LookupPagination } from "./order-lookup";

export type EvidenceAccessLevel = "TECHNICIAN" | "INTERNAL";

export type EvidenceMimeType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type EvidenceFileExtension = "jpg" | "png" | "webp" | "pdf";

export interface Evidence {
  id: string;
  originalName: string;
  mimeType: EvidenceMimeType;
  fileExtension: EvidenceFileExtension;
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

export interface EvidencePage {
  items: Evidence[];
  pagination: LookupPagination;
}

export interface EvidenceUploadInput {
  file: File;
  accessLevel: EvidenceAccessLevel;
  description?: string;
}
