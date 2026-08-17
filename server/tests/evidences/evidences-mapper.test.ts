import { describe, expect, it } from "vitest";
import { mapEvidence } from "../../src/evidences/evidences.mapper.js";
import type { EvidenceRecord } from "../../src/evidences/evidences.repository.types.js";

function evidenceRecord(): EvidenceRecord {
  return {
    id: "evidence-1",
    originalName: "visita.jpg",
    storedName: "bf12.jpg",
    mimeType: "image/jpeg",
    fileExtension: "jpg",
    sizeBytes: 4_096n,
    storageKey: "final/evidence-1.jpg",
    checksumSha256: "a".repeat(64),
    description: "Foto de visita",
    accessLevel: "TECHNICIAN",
    createdAt: new Date("2026-08-01T09:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    deletionReason: null,
    version: 2,
    uploadedBy: { id: "user-1", displayName: "Ana Técnica" },
    orden: { id: "order-1" },
    actividad: null,
    reincidencia: null,
  } as EvidenceRecord;
}

describe("mapEvidence", () => {
  it("maps an API-supported relation and omits private persistence fields", () => {
    const record = evidenceRecord();

    expect(mapEvidence(record)).toEqual({
      id: "evidence-1",
      originalName: "visita.jpg",
      mimeType: "image/jpeg",
      fileExtension: "jpg",
      sizeBytes: 4_096,
      description: "Foto de visita",
      accessLevel: "TECHNICIAN",
      uploadedBy: { id: "user-1", displayName: "Ana Técnica" },
      resourceType: "ORDER",
      resourceId: "order-1",
      checksumSha256: "a".repeat(64),
      version: 2,
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
    });
    expect(Object.keys(mapEvidence(record))).not.toEqual(expect.arrayContaining([
      "storedName", "storageKey", "deletedById", "deletionReason", "deletedAt",
    ]));
  });

  it("maps activity evidence and fails closed for impossible or deferred relations", () => {
    const activityRecord = { ...evidenceRecord(), orden: null, actividad: { id: "activity-1" } } as EvidenceRecord;
    expect(mapEvidence(activityRecord)).toMatchObject({ resourceType: "ACTIVITY", resourceId: "activity-1" });

    expect(() => mapEvidence({ ...evidenceRecord(), orden: null } as EvidenceRecord)).toThrow(/invariant/i);
    expect(() => mapEvidence({ ...evidenceRecord(), actividad: { id: "activity-1" } } as EvidenceRecord)).toThrow(/invariant/i);
    expect(() => mapEvidence({ ...evidenceRecord(), orden: null, reincidencia: { id: "recurrence-1" } } as EvidenceRecord)).toThrow(/invariant/i);
  });

  it("refuses to serialize a size that exceeds JavaScript's safe integer range", () => {
    expect(() => mapEvidence({
      ...evidenceRecord(),
      sizeBytes: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
    } as EvidenceRecord)).toThrow(/safe integer/i);
  });
});
