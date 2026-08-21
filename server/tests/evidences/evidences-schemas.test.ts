import { describe, expect, it } from "vitest";
import {
  archiveEvidenceSchema,
  createEvidenceMetadataSchema,
  evidenceIdSchema,
  evidenceListQuerySchema,
  evidenceResourceParamsSchema,
  updateEvidenceSchema,
} from "../../src/evidences/evidences.schemas.js";

const evidenceId = "10000000-0000-4000-8000-000000000001";
const resourceId = "10000000-0000-4000-8000-000000000002";

describe("evidence request schemas", () => {
  it("parses strict UUID route parameters", () => {
    expect(evidenceIdSchema.parse({ evidenceId })).toEqual({ evidenceId });
    expect(
      evidenceResourceParamsSchema.parse({ resourceType: "ORDER", resourceId }),
    ).toEqual({ resourceType: "ORDER", resourceId });
    expect(
      evidenceResourceParamsSchema.parse({ resourceType: "RECURRENCE", resourceId }),
    ).toEqual({ resourceType: "RECURRENCE", resourceId });
    expect(() => evidenceIdSchema.parse({ evidenceId: "not-a-uuid" })).toThrow();
    expect(() => evidenceResourceParamsSchema.parse({ resourceType: "ORDER", resourceId, extra: true })).toThrow();
  });

  it("defaults and bounds evidence pagination", () => {
    expect(evidenceListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(evidenceListQuerySchema.parse({ page: "2", pageSize: "100" })).toEqual({ page: 2, pageSize: 100 });
    expect(() => evidenceListQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => evidenceListQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it("trims optional metadata descriptions and rejects unsupported access", () => {
    expect(
      createEvidenceMetadataSchema.parse({ description: "  Evidencia de visita  " }),
    ).toMatchObject({ description: "Evidencia de visita" });
    expect(createEvidenceMetadataSchema.parse({ description: "   " })).toMatchObject({ description: null });
    expect(createEvidenceMetadataSchema.safeParse({ accessLevel: "CLIENT" }).success).toBe(false);
    expect(createEvidenceMetadataSchema.safeParse({ unknown: true }).success).toBe(false);
  });

  it("requires a version and one mutable field for evidence updates", () => {
    expect(updateEvidenceSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateEvidenceSchema.safeParse({ version: 1, description: undefined }).success).toBe(false);
    expect(updateEvidenceSchema.safeParse({ version: 1, accessLevel: undefined }).success).toBe(false);
    expect(updateEvidenceSchema.safeParse({ description: "Cambio" }).success).toBe(false);
    expect(updateEvidenceSchema.parse({ version: 2, description: "  Cambio  " })).toMatchObject({
      version: 2,
      description: "Cambio",
    });
    expect(updateEvidenceSchema.safeParse({ version: 2, accessLevel: "CLIENT" }).success).toBe(false);
  });

  it("requires a version and a documented archive reason", () => {
    expect(archiveEvidenceSchema.safeParse({ reason: "corto", version: 1 }).success).toBe(false);
    expect(archiveEvidenceSchema.safeParse({ reason: "Razón suficientemente detallada", version: 0 }).success).toBe(false);
    expect(archiveEvidenceSchema.parse({ reason: "  Razón suficientemente detallada  ", version: 3 })).toEqual({
      reason: "Razón suficientemente detallada",
      version: 3,
    });
  });
});
