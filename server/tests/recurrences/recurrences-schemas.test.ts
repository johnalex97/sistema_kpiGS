import { describe, expect, it } from "vitest";
import {
  addRecurrenceVisitSchema,
  adjustRecurrenceSchema,
  analyzeRecurrenceSchema,
  correctRecurrenceSchema,
  recurrenceListQuerySchema,
  reportRecurrenceSchema,
} from "../../src/recurrences/recurrences.schemas.js";

const originalOrderId = "10000000-0000-4000-8000-000000000001";
const correctionOrderId = "10000000-0000-4000-8000-000000000002";
const causeId = "10000000-0000-4000-8000-000000000003";
const technicianId = "10000000-0000-4000-8000-000000000004";
const clientId = "10000000-0000-4000-8000-000000000005";
const branchId = "10000000-0000-4000-8000-000000000006";

describe("recurrence request schemas", () => {
  it("trims required report text and rejects invalid order identifiers", () => {
    expect(
      reportRecurrenceSchema.parse({
        originalOrderId,
        correctionOrderId,
        detectedProblem: "  La falla reapareció  ",
      }),
    ).toMatchObject({ detectedProblem: "La falla reapareció" });
    expect(() => reportRecurrenceSchema.parse({
      originalOrderId: "not-a-uuid",
      correctionOrderId,
      detectedProblem: "La falla reapareció",
    })).toThrow();
  });

  it("accepts bounded decimal costs only when their reason is paired", () => {
    const analysis = {
      version: 1,
      causeId,
      impact: "HIGH",
      responsibility: "TECHNICAL_WORK",
      analysis: "Análisis suficientemente documentado",
      qualityDecisions: [{ technicianId, affectsQuality: true, justification: "Trabajo técnico deficiente" }],
    };
    expect(analyzeRecurrenceSchema.parse({ ...analysis, estimatedCost: "9999999999.99", costReason: "Costo documentado" }))
      .toMatchObject({ estimatedCost: "9999999999.99" });
    expect(() => analyzeRecurrenceSchema.parse({ ...analysis, estimatedCost: "10.00" })).toThrow();
    expect(() => analyzeRecurrenceSchema.parse({ ...analysis, costReason: "Costo documentado" })).toThrow();
    expect(() => analyzeRecurrenceSchema.parse({ ...analysis, estimatedCost: "10000000000.00", costReason: "Costo documentado" })).toThrow();
  });

  it("requires unique quality technicians and valid quality documentation", () => {
    const input = {
      version: 1,
      causeId,
      impact: "LOW",
      responsibility: "TECHNICAL_WORK",
      analysis: "Análisis suficientemente documentado",
      qualityDecisions: [{ technicianId, affectsQuality: true, justification: "Trabajo técnico deficiente" }],
    };
    expect(() => analyzeRecurrenceSchema.parse({
      ...input,
      qualityDecisions: [...input.qualityDecisions, input.qualityDecisions[0]],
    })).toThrow();
    expect(() => analyzeRecurrenceSchema.parse({
      ...input,
      qualityDecisions: [{ technicianId, affectsQuality: true }],
    })).toThrow();
  });

  it.each([
    ["quality justification", () => analyzeRecurrenceSchema.parse({
      version: 1, causeId, impact: "LOW", responsibility: "TECHNICAL_WORK",
      analysis: "Análisis suficientemente documentado",
      qualityDecisions: [{ technicianId, affectsQuality: false, justification: null }],
    })],
    ["analysis age override reason", () => analyzeRecurrenceSchema.parse({
      version: 1, causeId, impact: "LOW", responsibility: "TECHNICAL_WORK",
      analysis: "Análisis suficientemente documentado",
      qualityDecisions: [{ technicianId, affectsQuality: true, justification: "Trabajo técnico deficiente" }],
      ageOverrideReason: null,
    })],
    ["analysis cost reason", () => analyzeRecurrenceSchema.parse({
      version: 1, causeId, impact: "LOW", responsibility: "TECHNICAL_WORK",
      analysis: "Análisis suficientemente documentado",
      qualityDecisions: [{ technicianId, affectsQuality: true, justification: "Trabajo técnico deficiente" }],
      costReason: null,
    })],
    ["correction cost reason", () => correctRecurrenceSchema.parse({
      version: 1, correctiveAction: "Acción correctiva documentada", costReason: null,
    })],
    ["visit observation", () => addRecurrenceVisitSchema.parse({ version: 1, orderId: correctionOrderId, observation: null })],
    ["unilateral adjustment cost reason", () => adjustRecurrenceSchema.parse({
      version: 1,
      reason: "Razón suficientemente documentada",
      costReason: null,
    })],
  ])("rejects null for string-only %s", (_field, parse) => {
    expect(parse).toThrow();
  });

  it("enforces pagination, chronological filters, and a non-empty adjustment", () => {
    expect(() => recurrenceListQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => recurrenceListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => recurrenceListQuerySchema.parse({
      detectedFrom: "2026-08-02T00:00:00.000Z",
      detectedTo: "2026-08-01T00:00:00.000Z",
    })).toThrow();
    expect(() => adjustRecurrenceSchema.parse({ version: 1, reason: "Razón suficientemente documentada" })).toThrow();
    expect(adjustRecurrenceSchema.parse({
      version: 1,
      reason: "Razón suficientemente documentada",
      observations: " Observación corregida ",
    })).toMatchObject({ observations: "Observación corregida" });
  });

  it("accepts UUID client and branch list filters and rejects malformed identifiers", () => {
    expect(recurrenceListQuerySchema.parse({ clientId, branchId })).toMatchObject({
      clientId,
      branchId,
      page: 1,
      pageSize: 20,
    });
    expect(() => recurrenceListQuerySchema.parse({ clientId: "not-a-uuid" })).toThrow();
    expect(() => recurrenceListQuerySchema.parse({ branchId: "not-a-uuid" })).toThrow();
  });
});
