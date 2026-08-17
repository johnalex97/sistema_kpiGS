import type { EvidencePublic } from "./evidences.types.js";
import type { EvidenceRecord } from "./evidences.repository.types.js";

const maximumSafeSizeBytes = BigInt(Number.MAX_SAFE_INTEGER);

function invariant(message: string): never {
  throw new Error(`Evidence mapper invariant violated: ${message}`);
}

function mapResource(record: EvidenceRecord): Pick<EvidencePublic, "resourceType" | "resourceId"> {
  if (record.reincidencia !== null) {
    return invariant("reincidence evidence is not supported in phase 9");
  }

  if (record.orden !== null && record.actividad === null) {
    return { resourceType: "ORDER", resourceId: record.orden.id };
  }
  if (record.orden === null && record.actividad !== null) {
    return { resourceType: "ACTIVITY", resourceId: record.actividad.id };
  }
  return invariant("exactly one API-supported resource relation is required");
}

function mapSizeBytes(sizeBytes: bigint): number {
  if (sizeBytes > maximumSafeSizeBytes) {
    return invariant("sizeBytes exceeds JavaScript's safe integer range");
  }
  return Number(sizeBytes);
}

function mapAccessLevel(accessLevel: EvidenceRecord["accessLevel"]): EvidencePublic["accessLevel"] {
  if (accessLevel === "INTERNAL" || accessLevel === "TECHNICIAN") return accessLevel;
  return invariant("CLIENT access is not public in phase 9");
}

export function mapEvidence(record: EvidenceRecord): EvidencePublic {
  return {
    id: record.id,
    originalName: record.originalName,
    mimeType: record.mimeType as EvidencePublic["mimeType"],
    fileExtension: record.fileExtension as EvidencePublic["fileExtension"],
    sizeBytes: mapSizeBytes(record.sizeBytes),
    description: record.description,
    accessLevel: mapAccessLevel(record.accessLevel),
    uploadedBy: record.uploadedBy,
    ...mapResource(record),
    checksumSha256: record.checksumSha256,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
