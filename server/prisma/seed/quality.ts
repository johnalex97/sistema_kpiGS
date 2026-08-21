import {
  EstadoReincidencia,
  ImpactoReincidencia,
  ParticipacionReincidencia,
  ResponsabilidadReincidencia,
} from "../../generated/prisma/client.js";
import type { SeedCatalogs } from "./catalogs.js";
import { seedIds, type SeedClient } from "./constants.js";
import type { SeedIdentity } from "./identity.js";
import type { SeedOperations } from "./operations.js";
import type { SeedOrganization } from "./organization.js";

function requireId(
  values: Record<string, string>,
  key: string,
  label: string,
): string {
  const value = values[key];
  if (!value) throw new Error(`${label} seed no encontrado: ${key}`);
  return value;
}

export async function seedQuality(
  database: SeedClient,
  catalogs: SeedCatalogs,
  identity: SeedIdentity,
  organization: SeedOrganization,
  operations: SeedOperations,
): Promise<void> {
  const firstOrderId = requireId(
    operations.orderIds,
    "GS-2026-0001",
    "Orden",
  );
  const secondOrderId = requireId(
    operations.orderIds,
    "GS-2026-0002",
    "Orden",
  );
  const thirdOrderId = requireId(
    operations.orderIds,
    "GS-2026-0003",
    "Orden",
  );
  const diagnosisCauseId = requireId(
    catalogs.recurrenceCauses,
    "INCORRECT_DIAGNOSIS",
    "Causa",
  );
  const equipmentCauseId = requireId(
    catalogs.recurrenceCauses,
    "EQUIPMENT_FAILURE",
    "Causa",
  );
  const firstTechnicianId = requireId(
    organization.technicianIds,
    "TEC-001",
    "Técnico",
  );
  const secondTechnicianId = requireId(
    organization.technicianIds,
    "TEC-002",
    "Técnico",
  );
  const thirdTechnicianId = requireId(
    organization.technicianIds,
    "TEC-003",
    "Técnico",
  );

  await database.reincidencia.upsert({
    where: { id: seedIds.recurrences.technical },
    update: {
      recurrenceNumber: "RI-2026-0001",
      originalOrderId: firstOrderId,
      causeId: diagnosisCauseId,
      responsibility: ResponsabilidadReincidencia.TECHNICAL_WORK,
      reportedById: identity.technicianUserId,
      reviewedById: identity.supervisorUserId,
      reviewedAt: new Date("2026-07-28T16:00:00.000Z"),
    },
    create: {
      id: seedIds.recurrences.technical,
      recurrenceNumber: "RI-2026-0001",
      originalOrderId: firstOrderId,
      causeId: diagnosisCauseId,
      reportedById: identity.technicianUserId,
      reviewedById: identity.supervisorUserId,
      reviewedAt: new Date("2026-07-28T16:00:00.000Z"),
      status: EstadoReincidencia.CORRECTION,
      impact: ImpactoReincidencia.MEDIUM,
      responsibility: ResponsabilidadReincidencia.TECHNICAL_WORK,
      detectedProblem: "Diagnóstico inicial incompleto en escenario ficticio",
      analysis: "Caso creado únicamente para demostración",
      correctiveAction: "Revisión completa ficticia",
      detectedAt: new Date("2026-07-28T15:00:00.000Z"),
      additionalMinutes: 45,
      estimatedCost: "125.00",
    },
  });

  await database.reincidencia.upsert({
    where: { id: seedIds.recurrences.equipment },
    update: {
      recurrenceNumber: "RI-2026-0002",
      originalOrderId: secondOrderId,
      causeId: equipmentCauseId,
      responsibility: ResponsabilidadReincidencia.EQUIPMENT,
      reportedById: identity.technicianUserId,
      reviewedById: identity.supervisorUserId,
      reviewedAt: new Date("2026-07-29T15:00:00.000Z"),
    },
    create: {
      id: seedIds.recurrences.equipment,
      recurrenceNumber: "RI-2026-0002",
      originalOrderId: secondOrderId,
      causeId: equipmentCauseId,
      reportedById: identity.technicianUserId,
      reviewedById: identity.supervisorUserId,
      reviewedAt: new Date("2026-07-29T15:00:00.000Z"),
      status: EstadoReincidencia.ANALYSIS,
      impact: ImpactoReincidencia.HIGH,
      responsibility: ResponsabilidadReincidencia.EQUIPMENT,
      detectedProblem: "Equipo ficticio presenta falla independiente",
      analysis: "No atribuible al trabajo técnico",
      detectedAt: new Date("2026-07-29T14:30:00.000Z"),
      additionalMinutes: 30,
      estimatedCost: "300.00",
    },
  });

  await database.$executeRaw`
    INSERT INTO "secuencia_reincidencia" ("year", "last_number")
    VALUES (2026, 2)
    ON CONFLICT ("year") DO UPDATE
    SET "last_number" = GREATEST(
      "secuencia_reincidencia"."last_number",
      EXCLUDED."last_number"
    )
  `;

  await database.reincidenciaOrden.upsert({
    where: {
      reincidenciaId_ordenId: {
        reincidenciaId: seedIds.recurrences.technical,
        ordenId: secondOrderId,
      },
    },
    update: { visitNumber: 1, additionalMinutes: 45 },
    create: {
      reincidenciaId: seedIds.recurrences.technical,
      ordenId: secondOrderId,
      visitNumber: 1,
      additionalMinutes: 45,
      observation: "Primera visita ficticia",
    },
  });

  await database.reincidenciaOrden.upsert({
    where: {
      reincidenciaId_ordenId: {
        reincidenciaId: seedIds.recurrences.equipment,
        ordenId: thirdOrderId,
      },
    },
    update: { visitNumber: 1, additionalMinutes: 30 },
    create: {
      reincidenciaId: seedIds.recurrences.equipment,
      ordenId: thirdOrderId,
      visitNumber: 1,
      additionalMinutes: 30,
      observation: "Visita ficticia por falla de equipo",
    },
  });

  await database.reincidenciaTecnico.upsert({
    where: {
      reincidenciaId_tecnicoId_participation: {
        reincidenciaId: seedIds.recurrences.technical,
        tecnicoId: firstTechnicianId,
        participation: ParticipacionReincidencia.ORIGINAL_RESPONSIBLE,
      },
    },
    update: {
      affectsQuality: true,
      justification: "Responsabilidad ficticia documentada para la prueba",
    },
    create: {
      reincidenciaId: seedIds.recurrences.technical,
      tecnicoId: firstTechnicianId,
      participation: ParticipacionReincidencia.ORIGINAL_RESPONSIBLE,
      affectsQuality: true,
      justification: "Responsabilidad ficticia documentada para la prueba",
    },
  });

  await database.reincidenciaTecnico.upsert({
    where: {
      reincidenciaId_tecnicoId_participation: {
        reincidenciaId: seedIds.recurrences.technical,
        tecnicoId: secondTechnicianId,
        participation: ParticipacionReincidencia.ORIGINAL_PARTICIPANT,
      },
    },
    update: { affectsQuality: false, justification: null },
    create: {
      reincidenciaId: seedIds.recurrences.technical,
      tecnicoId: secondTechnicianId,
      participation: ParticipacionReincidencia.ORIGINAL_PARTICIPANT,
      affectsQuality: false,
    },
  });

  await database.reincidenciaTecnico.upsert({
    where: {
      reincidenciaId_tecnicoId_participation: {
        reincidenciaId: seedIds.recurrences.equipment,
        tecnicoId: thirdTechnicianId,
        participation: ParticipacionReincidencia.CORRECTION_PARTICIPANT,
      },
    },
    update: { affectsQuality: false, justification: null },
    create: {
      reincidenciaId: seedIds.recurrences.equipment,
      tecnicoId: thirdTechnicianId,
      participation: ParticipacionReincidencia.CORRECTION_PARTICIPANT,
      affectsQuality: false,
    },
  });

  await database.configuracionKPI.upsert({
    where: { version: 1 },
    update: {
      productivityWeight: "0.3000",
      complianceWeight: "0.2500",
      efficiencyWeight: "0.2000",
      qualityWeight: "0.2500",
      isActive: true,
    },
    create: {
      version: 1,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      productivityWeight: "0.3000",
      complianceWeight: "0.2500",
      efficiencyWeight: "0.2000",
      qualityWeight: "0.2500",
      description: "Configuración KPI inicial de demostración",
      createdById: identity.adminUserId,
    },
  });

  for (const tecnicoId of [
    firstTechnicianId,
    secondTechnicianId,
    thirdTechnicianId,
  ]) {
    await database.metaTecnico.upsert({
      where: {
        tecnicoId_periodStart_periodEnd: {
          tecnicoId,
          periodStart: new Date("2026-07-01T00:00:00.000Z"),
          periodEnd: new Date("2026-07-31T00:00:00.000Z"),
        },
      },
      update: {
        targetJobs: 40,
        targetProductiveMinutes: 7200,
      },
      create: {
        tecnicoId,
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-07-31T00:00:00.000Z"),
        targetJobs: 40,
        targetProductiveMinutes: 7200,
        createdById: identity.supervisorUserId,
        observation: "Meta mensual ficticia",
      },
    });
  }
}
