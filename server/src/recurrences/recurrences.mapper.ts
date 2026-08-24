import type {
  PublicRecurrenceDetail,
  PublicRecurrenceSummary,
  PublicRecurrenceTechnician,
} from "./recurrences.types.js";
import type {
  RecurrenceDetailRecord,
  RecurrenceSummaryRecord,
} from "./recurrences.repository.types.js";

function mapTechnician(record: RecurrenceDetailRecord["tecnicos"][number]): PublicRecurrenceTechnician {
  if (record.affectsQuality && record.participation === "CORRECTION_PARTICIPANT") {
    throw new Error("La calidad solo puede afectar participantes originales");
  }
  if (record.affectsQuality && !record.justification?.trim()) {
    throw new Error("La afectación de calidad exige justificación");
  }
  return {
    technician: {
      id: record.tecnico.id,
      code: record.tecnico.code,
      fullName: record.tecnico.fullName,
    },
    participation: record.participation,
    affectsQuality: record.affectsQuality,
    justification: record.justification,
  };
}

export function mapRecurrenceSummary(record: RecurrenceSummaryRecord): PublicRecurrenceSummary {
  return {
    id: record.id,
    recurrenceNumber: record.recurrenceNumber,
    status: record.status,
    impact: record.impact,
    responsibility: record.responsibility,
    detectedProblem: record.detectedProblem,
    detectedAt: record.detectedAt.toISOString(),
    originalOrder: {
      id: record.ordenOriginal.id,
      orderNumber: record.ordenOriginal.orderNumber,
    },
    cause: record.causa === null ? null : {
      id: record.causa.id,
      code: record.causa.code,
      name: record.causa.name,
    },
    additionalMinutes: record.additionalMinutes,
    estimatedCost: record.estimatedCost.toFixed(2),
    visitCount: record._count.ordenes,
    noteCount: record._count.notas,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

export function mapRecurrenceDetail(
  record: RecurrenceDetailRecord,
  evidenceVisibility: "ALL" | "TECHNICIAN" = "TECHNICIAN",
): PublicRecurrenceDetail {
  const qualitySnapshots = record.tecnicos.filter((technician) => technician.affectsQuality);
  if (record.status === "DISMISSED" && qualitySnapshots.length > 0) {
    throw new Error("Una reincidencia descartada no puede afectar calidad");
  }
  if (record.status !== "DISMISSED" && record.responsibility !== "TECHNICAL_WORK" && qualitySnapshots.length > 0) {
    throw new Error("La responsabilidad no técnica no puede afectar calidad");
  }
  if (record.status !== "DISMISSED" && record.responsibility === "TECHNICAL_WORK" && qualitySnapshots.length === 0) {
    throw new Error("El trabajo técnico exige una afectación de calidad justificada");
  }
  return {
    ...mapRecurrenceSummary(record),
    analysis: record.analysis,
    correctiveAction: record.correctiveAction,
    preventiveAction: record.preventiveAction,
    observations: record.observations,
    ageOverrideReason: record.ageOverrideReason,
    dismissalReason: record.dismissalReason,
    dismissedAt: record.dismissedAt?.toISOString() ?? null,
    closedAt: record.closedAt?.toISOString() ?? null,
    visits: record.ordenes.map((visit) => ({
      id: visit.id,
      visitNumber: visit.visitNumber,
      additionalMinutes: visit.additionalMinutes,
      observation: visit.observation,
      order: { id: visit.orden.id, orderNumber: visit.orden.orderNumber },
    })),
    technicians: record.tecnicos.map(mapTechnician),
    notes: record.notas.map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      authorDisplayName: note.author.displayName,
    })),
    evidences: record.evidencias
      .filter((evidence) => evidenceVisibility === "ALL" || evidence.accessLevel === "TECHNICIAN")
      .map((evidence) => ({
        id: evidence.id,
        originalName: evidence.originalName,
        mimeType: evidence.mimeType,
        sizeBytes: evidence.sizeBytes.toString(),
        createdAt: evidence.createdAt.toISOString(),
      })),
  };
}
