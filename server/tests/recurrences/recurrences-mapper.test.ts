import { Prisma } from "../../generated/prisma/client.js";
import { describe, expect, it } from "vitest";
import {
  mapRecurrenceDetail,
  mapRecurrenceSummary,
} from "../../src/recurrences/recurrences.mapper.js";
import type {
  RecurrenceDetailRecord,
  RecurrenceSummaryRecord,
} from "../../src/recurrences/recurrences.repository.types.js";

function summaryRecord(): RecurrenceSummaryRecord {
  return {
    id: "recurrence-1",
    recurrenceNumber: "REC-2026-0001",
    status: "CORRECTION",
    impact: "HIGH",
    responsibility: "TECHNICAL_WORK",
    detectedProblem: "La falla reapareció",
    detectedAt: new Date("2026-08-01T12:00:00.000Z"),
    additionalMinutes: 65,
    estimatedCost: new Prisma.Decimal("123.45"),
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-02T12:00:00.000Z"),
    version: 2,
    ordenOriginal: { id: "order-1", orderNumber: "OT-001" },
    causa: { id: "cause-1", code: "INSTALL", name: "Instalación" },
    _count: { ordenes: 2, notas: 1 },
  } as RecurrenceSummaryRecord;
}

describe("recurrence public mappers", () => {
  it("fails closed to technician evidence visibility when policy is omitted", () => {
    const record = {
      ...summaryRecord(),
      analysis: "Análisis técnico",
      correctiveAction: "Reparar",
      preventiveAction: "Verificar montaje",
      observations: null,
      ageOverrideReason: null,
      dismissalReason: null,
      closedAt: null,
      dismissedAt: null,
      ordenes: [],
      notas: [],
      tecnicos: [{ participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "Trabajo técnico deficiente", tecnico: { id: "tech-1", code: "TEC-001", fullName: "Ana" } }],
      evidencias: [{ id: "evidence-1", originalName: "internal.pdf", mimeType: "application/pdf", sizeBytes: 42n, accessLevel: "INTERNAL", createdAt: new Date("2026-08-02T12:00:00.000Z") }],
    } as RecurrenceDetailRecord;

    expect(mapRecurrenceDetail(record).evidences).toEqual([]);
  });

  it("serializes decimal, BigInt, and dates through explicit public fields", () => {
    const record = {
      ...summaryRecord(),
      analysis: "Análisis técnico",
      correctiveAction: "Reparar",
      preventiveAction: "Verificar montaje",
      observations: null,
      ageOverrideReason: null,
      dismissalReason: null,
      closedAt: null,
      dismissedAt: null,
      ordenes: [{ id: "visit-1", visitNumber: 1, additionalMinutes: 65, observation: "Visita", orden: { id: "order-2", orderNumber: "OT-002" } }],
      tecnicos: [{ participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "Trabajo técnico deficiente", tecnico: { id: "tech-1", code: "TEC-001", fullName: "Ana" } }],
      notas: [{ id: "note-1", content: "Seguimiento", createdAt: new Date("2026-08-02T12:00:00.000Z"), author: { displayName: "Supervisor" } }],
      evidencias: [{ id: "evidence-1", originalName: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 42n, accessLevel: "INTERNAL", createdAt: new Date("2026-08-02T12:00:00.000Z") }],
      reportedById: "private-user-id",
    } as RecurrenceDetailRecord;

    const summary = mapRecurrenceSummary(summaryRecord());
    const detail = mapRecurrenceDetail(record, "ALL");

    expect(summary).toMatchObject({ estimatedCost: "123.45", detectedAt: "2026-08-01T12:00:00.000Z" });
    expect(detail.visits[0]).toMatchObject({ order: { id: "order-2", orderNumber: "OT-002" }, additionalMinutes: 65 });
    expect(detail.evidences[0]).toMatchObject({ sizeBytes: "42", createdAt: "2026-08-02T12:00:00.000Z" });
    expect(JSON.stringify(detail)).not.toContain("private-user-id");
  });

  it("rejects a quality relationship that cannot affect the original work", () => {
    const record = {
      ...summaryRecord(),
      analysis: null, correctiveAction: null, preventiveAction: null, observations: null,
      ageOverrideReason: null, dismissalReason: null, closedAt: null, dismissedAt: null,
      ordenes: [], notas: [], evidencias: [],
      tecnicos: [{ participation: "CORRECTION_PARTICIPANT", affectsQuality: true, justification: "Imposible", tecnico: { id: "tech-2", code: "TEC-002", fullName: "Bruno" } }],
    } as RecurrenceDetailRecord;

    expect(() => mapRecurrenceDetail(record)).toThrow("La calidad solo puede afectar participantes originales");
  });

  it("rejects quality attribution for a non-technical responsibility", () => {
    const record = {
      ...summaryRecord(),
      responsibility: "EQUIPMENT",
      analysis: null, correctiveAction: null, preventiveAction: null, observations: null,
      ageOverrideReason: null, dismissalReason: null, closedAt: null, dismissedAt: null,
      ordenes: [], notas: [], evidencias: [],
      tecnicos: [{ participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "No permitido", tecnico: { id: "tech-1", code: "TEC-001", fullName: "Ana" } }],
    } as RecurrenceDetailRecord;

    expect(() => mapRecurrenceDetail(record)).toThrow("La responsabilidad no técnica no puede afectar calidad");
  });

  // Mutation caught: applying the active technical-work invariant to a dismissed
  // case makes the successful dismissal response and every later detail read fail.
  it("allows dismissed technical work only after every quality flag is cleared", () => {
    const dismissed = {
      ...summaryRecord(),
      status: "DISMISSED",
      analysis: "Technical analysis",
      correctiveAction: null,
      preventiveAction: null,
      observations: null,
      ageOverrideReason: null,
      dismissalReason: "The report was dismissed by supervision.",
      closedAt: null,
      dismissedAt: new Date("2026-08-02T12:00:00.000Z"),
      ordenes: [],
      notas: [],
      evidencias: [],
      tecnicos: [{
        participation: "ORIGINAL_RESPONSIBLE",
        affectsQuality: false,
        justification: null,
        tecnico: { id: "tech-1", code: "TEC-001", fullName: "Ana" },
      }],
    } as RecurrenceDetailRecord;

    expect(mapRecurrenceDetail(dismissed)).toMatchObject({
      status: "DISMISSED",
      technicians: [{ affectsQuality: false, justification: null }],
    });
    expect(() => mapRecurrenceDetail({
      ...dismissed,
      tecnicos: [{
        ...dismissed.tecnicos[0]!,
        affectsQuality: true,
        justification: "Attribution that dismissal must clear.",
      }],
    })).toThrow("Una reincidencia descartada no puede afectar calidad");
  });
});
