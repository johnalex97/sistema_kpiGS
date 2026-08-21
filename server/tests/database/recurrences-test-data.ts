import type { PrismaClient } from "../../generated/prisma/client.js";

const ids = {
  adminUser: "83000000-0000-4000-8000-000000000001",
  supervisorUser: "83000000-0000-4000-8000-000000000002",
  reporterUser: "83000000-0000-4000-8000-000000000003",
  foreignUser: "83000000-0000-4000-8000-000000000004",
  technician: "83000000-0000-4000-8000-000000000011",
  foreignTechnician: "83000000-0000-4000-8000-000000000012",
  client: "83000000-0000-4000-8000-000000000021",
  branch: "83000000-0000-4000-8000-000000000022",
  serviceType: "83000000-0000-4000-8000-000000000023",
  originalOrder: "83000000-0000-4000-8000-000000000031",
  correctionOrder: "83000000-0000-4000-8000-000000000032",
  activeCause: "83000000-0000-4000-8000-000000000041",
  secondaryCause: "83000000-0000-4000-8000-000000000042",
  inactiveCause: "83000000-0000-4000-8000-000000000043",
  deletedCause: "83000000-0000-4000-8000-000000000044",
  reporterRecurrence: "83000000-0000-4000-8000-000000000051",
  originalParticipantRecurrence: "83000000-0000-4000-8000-000000000052",
  correctionParticipantRecurrence: "83000000-0000-4000-8000-000000000053",
  foreignRecurrence: "83000000-0000-4000-8000-000000000054",
  inactiveCauseRecurrence: "83000000-0000-4000-8000-000000000055",
  deletedCauseRecurrence: "83000000-0000-4000-8000-000000000056",
  originalParticipant: "83000000-0000-4000-8000-000000000061",
  correctionParticipant: "83000000-0000-4000-8000-000000000062",
  correctionVisit: "83000000-0000-4000-8000-000000000071",
  note: "83000000-0000-4000-8000-000000000081",
  evidence: "83000000-0000-4000-8000-000000000091",
} as const;

export interface RecurrencesReadFixture {
  adminUserId: string;
  supervisorUserId: string;
  technicianId: string;
  foreignTechnicianId: string;
  originalOrderId: string;
  correctionOrderId: string;
  activeCauseId: string;
  secondaryCauseId: string;
  inactiveCauseId: string;
  deletedCauseId: string;
  reporterRecurrenceId: string;
  originalParticipantRecurrenceId: string;
  correctionParticipantRecurrenceId: string;
  foreignRecurrenceId: string;
  inactiveCauseRecurrenceId: string;
  deletedCauseRecurrenceId: string;
}

const fixture: RecurrencesReadFixture = {
  adminUserId: ids.adminUser,
  supervisorUserId: ids.supervisorUser,
  technicianId: ids.technician,
  foreignTechnicianId: ids.foreignTechnician,
  originalOrderId: ids.originalOrder,
  correctionOrderId: ids.correctionOrder,
  activeCauseId: ids.activeCause,
  secondaryCauseId: ids.secondaryCause,
  inactiveCauseId: ids.inactiveCause,
  deletedCauseId: ids.deletedCause,
  reporterRecurrenceId: ids.reporterRecurrence,
  originalParticipantRecurrenceId: ids.originalParticipantRecurrence,
  correctionParticipantRecurrenceId: ids.correctionParticipantRecurrence,
  foreignRecurrenceId: ids.foreignRecurrence,
  inactiveCauseRecurrenceId: ids.inactiveCauseRecurrence,
  deletedCauseRecurrenceId: ids.deletedCauseRecurrence,
};

const recurrenceIds = [
  ids.reporterRecurrence,
  ids.originalParticipantRecurrence,
  ids.correctionParticipantRecurrence,
  ids.foreignRecurrence,
  ids.inactiveCauseRecurrence,
  ids.deletedCauseRecurrence,
];

export async function createRecurrencesReadFixture(
  database: PrismaClient,
): Promise<RecurrencesReadFixture> {
  await removeRecurrencesReadFixture(database);

  await database.usuario.createMany({
    data: [
      { id: ids.adminUser, email: "recurrences-read-admin@example.test", displayName: "Read Admin", status: "ACTIVE" },
      { id: ids.supervisorUser, email: "recurrences-read-supervisor@example.test", displayName: "Read Supervisor", status: "ACTIVE" },
      { id: ids.reporterUser, email: "recurrences-read-reporter@example.test", displayName: "Read Reporter", status: "ACTIVE" },
      { id: ids.foreignUser, email: "recurrences-read-foreign@example.test", displayName: "Read Foreign", status: "ACTIVE" },
    ],
  });
  await database.tecnico.createMany({
    data: [
      { id: ids.technician, userId: ids.reporterUser, code: "RR-TECH", fullName: "Read linked technician" },
      { id: ids.foreignTechnician, code: "RR-FOREIGN", fullName: "Read foreign technician" },
    ],
  });
  await database.cliente.create({
    data: { id: ids.client, code: "RR-CLIENT", tradeName: "Read Client" },
  });
  await database.sucursalCliente.create({
    data: { id: ids.branch, clienteId: ids.client, code: "RR-BRANCH", name: "Read Branch", address: "Fixture address" },
  });
  await database.tipoServicio.create({
    data: { id: ids.serviceType, code: "RR-SERVICE", name: "Read service" },
  });
  await database.ordenTrabajo.createMany({
    data: [
      { id: ids.originalOrder, orderNumber: "OT-READ-ORIGINAL", sucursalId: ids.branch, tipoServicioId: ids.serviceType, reportedProblem: "Original recurrence order" },
      { id: ids.correctionOrder, orderNumber: "OT-READ-CORRECTION", sucursalId: ids.branch, tipoServicioId: ids.serviceType, reportedProblem: "Correction recurrence order" },
    ],
  });
  await database.ordenTecnico.createMany({
    data: [
      { ordenId: ids.originalOrder, tecnicoId: ids.technician, role: "PRIMARY", assignedAt: new Date("2026-08-01T08:00:00.000Z"), unassignedAt: new Date("2026-08-01T09:00:00.000Z") },
      { ordenId: ids.correctionOrder, tecnicoId: ids.technician, role: "SUPPORT", assignedAt: new Date("2026-08-01T10:00:00.000Z"), unassignedAt: new Date("2026-08-01T11:00:00.000Z") },
    ],
  });
  await database.causaReincidencia.createMany({
    data: [
      { id: ids.activeCause, code: "RR-A", name: "Read active cause", displayOrder: 1 },
      { id: ids.secondaryCause, code: "RR-B", name: "Read secondary cause", displayOrder: 1 },
      { id: ids.inactiveCause, code: "RR-I", name: "Read inactive cause", displayOrder: 0, isActive: false },
      { id: ids.deletedCause, code: "RR-X", name: "Read deleted cause", displayOrder: 0, deletedAt: new Date("2026-08-01T01:00:00.000Z") },
    ],
  });
  await database.reincidencia.createMany({
    data: [
      { id: ids.reporterRecurrence, recurrenceNumber: "RI-2037-9101", originalOrderId: ids.originalOrder, causeId: ids.activeCause, reportedById: ids.reporterUser, status: "OPEN", impact: "HIGH", responsibility: "TECHNICAL_WORK", detectedProblem: "Reporter-owned sensor regression", detectedAt: new Date("2026-08-06T12:00:00.000Z") },
      { id: ids.originalParticipantRecurrence, recurrenceNumber: "RI-2037-9102", originalOrderId: ids.originalOrder, causeId: ids.secondaryCause, reportedById: ids.foreignUser, status: "ANALYSIS", impact: "MEDIUM", responsibility: "EQUIPMENT", detectedProblem: "Original participant regression", detectedAt: new Date("2026-08-05T12:00:00.000Z") },
      { id: ids.correctionParticipantRecurrence, recurrenceNumber: "RI-2037-9103", originalOrderId: ids.originalOrder, causeId: ids.activeCause, reportedById: ids.foreignUser, status: "CORRECTION", impact: "LOW", responsibility: "CLIENT", detectedProblem: "Correction participant regression", detectedAt: new Date("2026-08-05T12:00:00.000Z") },
      { id: ids.foreignRecurrence, recurrenceNumber: "RI-2037-9104", originalOrderId: ids.originalOrder, causeId: ids.activeCause, reportedById: ids.foreignUser, status: "CLOSED", impact: "HIGH", responsibility: "THIRD_PARTY", detectedProblem: "Foreign recurrence", detectedAt: new Date("2026-08-04T12:00:00.000Z"), closedAt: new Date("2026-08-04T13:00:00.000Z"), closedById: ids.supervisorUser },
      { id: ids.inactiveCauseRecurrence, recurrenceNumber: "RI-2037-9105", originalOrderId: ids.originalOrder, causeId: ids.inactiveCause, reportedById: ids.foreignUser, status: "DISMISSED", impact: "MEDIUM", responsibility: "UNDETERMINED", detectedProblem: "Inactive historical cause", detectedAt: new Date("2026-08-03T12:00:00.000Z"), dismissedAt: new Date("2026-08-03T13:00:00.000Z"), dismissedById: ids.supervisorUser, dismissalReason: "Fixture dismissal" },
      { id: ids.deletedCauseRecurrence, recurrenceNumber: "RI-2037-9106", originalOrderId: ids.originalOrder, causeId: ids.deletedCause, reportedById: ids.foreignUser, status: "DISMISSED", impact: "LOW", responsibility: "UNDETERMINED", detectedProblem: "Deleted historical cause", detectedAt: new Date("2026-08-02T12:00:00.000Z"), dismissedAt: new Date("2026-08-02T13:00:00.000Z"), dismissedById: ids.supervisorUser, dismissalReason: "Fixture dismissal" },
    ],
  });
  await database.reincidenciaTecnico.createMany({
    data: [
      { id: ids.originalParticipant, reincidenciaId: ids.originalParticipantRecurrence, tecnicoId: ids.technician, participation: "ORIGINAL_PARTICIPANT" },
      { id: ids.correctionParticipant, reincidenciaId: ids.correctionParticipantRecurrence, tecnicoId: ids.technician, participation: "CORRECTION_PARTICIPANT" },
      { reincidenciaId: ids.foreignRecurrence, tecnicoId: ids.foreignTechnician, participation: "ORIGINAL_RESPONSIBLE" },
    ],
  });
  await database.reincidenciaOrden.create({
    data: { id: ids.correctionVisit, reincidenciaId: ids.correctionParticipantRecurrence, ordenId: ids.correctionOrder, visitNumber: 1, observation: "Closed correction assignment" },
  });
  await database.reincidenciaNota.create({
    data: { id: ids.note, reincidenciaId: ids.reporterRecurrence, authorId: ids.supervisorUser, content: "Read fixture note" },
  });
  await database.evidencia.create({
    data: {
      id: ids.evidence,
      originalName: "read-fixture.pdf",
      storedName: "read-fixture.pdf",
      mimeType: "application/pdf",
      fileExtension: "pdf",
      sizeBytes: 1n,
      storageKey: "evidences/recurrences-read-fixture.pdf",
      checksumSha256: "a".repeat(64),
      uploadedById: ids.supervisorUser,
      reincidenciaId: ids.reporterRecurrence,
    },
  });
  await database.auditoria.create({
    data: { userId: ids.supervisorUser, action: "READ_FIXTURE", entity: "RECURRENCE", entityId: ids.reporterRecurrence },
  });
  return fixture;
}

export async function removeRecurrencesReadFixture(
  database: PrismaClient,
): Promise<void> {
  await database.evidencia.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.auditoria.deleteMany({ where: { entityId: { in: recurrenceIds } } });
  await database.reincidenciaNota.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidenciaTecnico.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidenciaOrden.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidencia.deleteMany({ where: { id: { in: recurrenceIds } } });
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: [ids.originalOrder, ids.correctionOrder] } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: [ids.originalOrder, ids.correctionOrder] } } });
  await database.causaReincidencia.deleteMany({ where: { id: { in: [ids.activeCause, ids.secondaryCause, ids.inactiveCause, ids.deletedCause] } } });
  await database.tecnico.deleteMany({ where: { id: { in: [ids.technician, ids.foreignTechnician] } } });
  await database.tipoServicio.deleteMany({ where: { id: ids.serviceType } });
  await database.sucursalCliente.deleteMany({ where: { id: ids.branch } });
  await database.cliente.deleteMany({ where: { id: ids.client } });
  await database.usuario.deleteMany({ where: { id: { in: [ids.adminUser, ids.supervisorUser, ids.reporterUser, ids.foreignUser] } } });
}
