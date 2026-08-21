import { describe, expect, it } from "vitest";
import {
  adjustRecurrenceSchema,
  analyzeRecurrenceSchema,
  recurrenceListQuerySchema,
  reportRecurrenceSchema,
} from "../../src/recurrences/recurrences.schemas.js";

const originalOrderId = "10000000-0000-4000-8000-000000000001";
const correctionOrderId = "10000000-0000-4000-8000-000000000002";
const causeId = "10000000-0000-4000-8000-000000000003";
const technicianId = "10000000-0000-4000-8000-000000000004";

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
});
