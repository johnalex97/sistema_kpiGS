import type { PrismaClient } from "../../generated/prisma/client.js";

const ids = {
  adminUser: "60000000-0000-4000-8000-000000000001",
  supervisorUser: "60000000-0000-4000-8000-000000000002",
  assignedUser: "60000000-0000-4000-8000-000000000003",
  formerUser: "60000000-0000-4000-8000-000000000004",
  historicalActivityUser: "60000000-0000-4000-8000-000000000005",
  foreignUser: "60000000-0000-4000-8000-000000000006",
  assignedTechnician: "61000000-0000-4000-8000-000000000001",
  formerTechnician: "61000000-0000-4000-8000-000000000002",
  historicalActivityTechnician: "61000000-0000-4000-8000-000000000003",
  foreignTechnician: "61000000-0000-4000-8000-000000000004",
  managerTechnician: "61000000-0000-4000-8000-000000000005",
  client: "62000000-0000-4000-8000-000000000001",
  branch: "62000000-0000-4000-8000-000000000002",
  serviceType: "62000000-0000-4000-8000-000000000003",
  activityType: "62000000-0000-4000-8000-000000000004",
  activeOrder: "63000000-0000-4000-8000-000000000001",
  completedOrder: "63000000-0000-4000-8000-000000000002",
  cancelledOrder: "63000000-0000-4000-8000-000000000003",
  currentActivity: "64000000-0000-4000-8000-000000000001",
  historicalActivity: "64000000-0000-4000-8000-000000000002",
  recurrenceCause: "65000000-0000-4000-8000-000000000001",
  recurrence: "65000000-0000-4000-8000-000000000002",
  orderTechnician: "66000000-0000-4000-8000-000000000001",
  orderInternal: "66000000-0000-4000-8000-000000000002",
  orderArchived: "66000000-0000-4000-8000-000000000003",
  orderTechnicianTie: "66000000-0000-4000-8000-000000000004",
  completedTechnician: "66000000-0000-4000-8000-000000000005",
  cancelledForeign: "66000000-0000-4000-8000-000000000006",
  currentActivityTechnician: "66000000-0000-4000-8000-000000000007",
  historicalActivityEvidence: "66000000-0000-4000-8000-000000000008",
  recurrenceLegacy: "66000000-0000-4000-8000-000000000009",
} as const;

export interface EvidencesReadFixture {
  adminUserId: string;
  supervisorUserId: string;
  assignedUserId: string;
  formerUserId: string;
  historicalActivityUserId: string;
  foreignUserId: string;
  assignedTechnicianId: string;
  formerTechnicianId: string;
  historicalActivityTechnicianId: string;
  foreignTechnicianId: string;
  managerTechnicianId: string;
  activeOrderId: string;
  completedOrderId: string;
  cancelledOrderId: string;
  currentActivityId: string;
  historicalActivityId: string;
  orderTechnicianEvidenceId: string;
  orderInternalEvidenceId: string;
  orderArchivedEvidenceId: string;
  orderTechnicianTieEvidenceId: string;
  completedTechnicianEvidenceId: string;
  cancelledForeignEvidenceId: string;
  currentActivityTechnicianEvidenceId: string;
  historicalActivityTechnicianEvidenceId: string;
  recurrenceLegacyEvidenceId: string;
  storageKeys: string[];
}

const fixture: EvidencesReadFixture = {
  adminUserId: ids.adminUser,
  supervisorUserId: ids.supervisorUser,
  assignedUserId: ids.assignedUser,
  formerUserId: ids.formerUser,
  historicalActivityUserId: ids.historicalActivityUser,
  foreignUserId: ids.foreignUser,
  assignedTechnicianId: ids.assignedTechnician,
  formerTechnicianId: ids.formerTechnician,
  historicalActivityTechnicianId: ids.historicalActivityTechnician,
  foreignTechnicianId: ids.foreignTechnician,
  managerTechnicianId: ids.managerTechnician,
  activeOrderId: ids.activeOrder,
  completedOrderId: ids.completedOrder,
  cancelledOrderId: ids.cancelledOrder,
  currentActivityId: ids.currentActivity,
  historicalActivityId: ids.historicalActivity,
  orderTechnicianEvidenceId: ids.orderTechnician,
  orderInternalEvidenceId: ids.orderInternal,
  orderArchivedEvidenceId: ids.orderArchived,
  orderTechnicianTieEvidenceId: ids.orderTechnicianTie,
  completedTechnicianEvidenceId: ids.completedTechnician,
  cancelledForeignEvidenceId: ids.cancelledForeign,
  currentActivityTechnicianEvidenceId: ids.currentActivityTechnician,
  historicalActivityTechnicianEvidenceId: ids.historicalActivityEvidence,
  recurrenceLegacyEvidenceId: ids.recurrenceLegacy,
  storageKeys: Object.values(ids)
    .filter((id) => id.startsWith("66000000"))
    .map((id) => `evidences/fixture/${id}.pdf`),
};

const fixtureEvidenceIds = Object.values(ids).filter((id) => id.startsWith("66000000"));

export async function createEvidencesReadFixture(
  database: PrismaClient,
): Promise<EvidencesReadFixture> {
  await removeEvidencesReadFixture(database);

  await database.usuario.createMany({
    data: [
      { id: ids.adminUser, email: "evidence-admin@example.test", displayName: "Evidence admin", status: "ACTIVE" },
      { id: ids.supervisorUser, email: "evidence-supervisor@example.test", displayName: "Evidence supervisor", status: "ACTIVE" },
      { id: ids.assignedUser, email: "evidence-assigned@example.test", displayName: "Evidence assigned", status: "ACTIVE" },
      { id: ids.formerUser, email: "evidence-former@example.test", displayName: "Evidence former", status: "ACTIVE" },
      { id: ids.historicalActivityUser, email: "evidence-history@example.test", displayName: "Evidence history", status: "ACTIVE" },
      { id: ids.foreignUser, email: "evidence-foreign@example.test", displayName: "Evidence foreign", status: "ACTIVE" },
    ],
  });
  await database.tecnico.createMany({
    data: [
      { id: ids.assignedTechnician, userId: ids.assignedUser, code: "EVD-ASSIGNED", fullName: "Evidence assigned" },
      { id: ids.formerTechnician, userId: ids.formerUser, code: "EVD-FORMER", fullName: "Evidence former" },
      { id: ids.historicalActivityTechnician, userId: ids.historicalActivityUser, code: "EVD-HISTORY", fullName: "Evidence history" },
      { id: ids.foreignTechnician, userId: ids.foreignUser, code: "EVD-FOREIGN", fullName: "Evidence foreign" },
      { id: ids.managerTechnician, userId: ids.supervisorUser, code: "EVD-MANAGER", fullName: "Evidence manager" },
    ],
  });
  await database.cliente.create({ data: { id: ids.client, code: "EVD-CLIENT", tradeName: "Evidence client" } });
  await database.sucursalCliente.create({ data: { id: ids.branch, clienteId: ids.client, code: "MAIN", name: "Evidence branch", address: "Fixture street" } });
  await database.tipoServicio.create({ data: { id: ids.serviceType, code: "EVD-SERVICE", name: "Evidence service" } });
  await database.tipoActividad.create({ data: { id: ids.activityType, code: "EVD-ACTIVITY", name: "Evidence activity" } });
  await database.ordenTrabajo.createMany({
    data: [
      { id: ids.activeOrder, orderNumber: "EVD-ORDER-ACTIVE", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "IN_PROGRESS", reportedProblem: "Evidence active order" },
      { id: ids.completedOrder, orderNumber: "EVD-ORDER-COMPLETED", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", reportedProblem: "Evidence completed order" },
      { id: ids.cancelledOrder, orderNumber: "EVD-ORDER-CANCELLED", sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "CANCELLED", reportedProblem: "Evidence cancelled order" },
    ],
  });
  await database.actividad.createMany({
    data: [
      { id: ids.currentActivity, sucursalId: ids.branch, tipoActividadId: ids.activityType, status: "IN_PROGRESS", description: "Evidence current activity" },
      { id: ids.historicalActivity, sucursalId: ids.branch, tipoActividadId: ids.activityType, status: "COMPLETED", description: "Evidence historical activity" },
    ],
  });
  await database.ordenTecnico.createMany({
    data: [
      { ordenId: ids.activeOrder, tecnicoId: ids.assignedTechnician, role: "PRIMARY", assignedAt: new Date("2026-08-01T09:00:00.000Z") },
      { ordenId: ids.completedOrder, tecnicoId: ids.formerTechnician, role: "SUPPORT", assignedAt: new Date("2026-08-01T09:00:00.000Z"), unassignedAt: new Date("2026-08-01T10:00:00.000Z") },
      { ordenId: ids.cancelledOrder, tecnicoId: ids.foreignTechnician, role: "PRIMARY", assignedAt: new Date("2026-08-01T09:00:00.000Z") },
    ],
  });
  await database.actividadTecnico.createMany({
    data: [
      { actividadId: ids.currentActivity, tecnicoId: ids.assignedTechnician, role: "RESPONSIBLE" },
      { actividadId: ids.historicalActivity, tecnicoId: ids.historicalActivityTechnician, role: "PARTICIPANT", endedAt: new Date("2026-08-01T10:00:00.000Z") },
    ],
  });
  await database.actividadVisibilidadTecnico.create({
    data: { actividadId: ids.historicalActivity, tecnicoId: ids.historicalActivityTechnician },
  });
  await database.causaReincidencia.create({ data: { id: ids.recurrenceCause, code: "EVD-CAUSE", name: "Evidence cause" } });
  await database.reincidencia.create({ data: { id: ids.recurrence, recurrenceNumber: "RI-2026-9001", originalOrderId: ids.activeOrder, causeId: ids.recurrenceCause, detectedProblem: "Legacy evidence retention" } });

  const createdAt = new Date("2026-08-17T12:00:00.000Z");
  await database.evidencia.createMany({
    data: [
      { id: ids.orderTechnician, originalName: "technician.pdf", storedName: "technician.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 100n, storageKey: `evidences/fixture/${ids.orderTechnician}.pdf`, checksumSha256: "1".repeat(64), accessLevel: "TECHNICIAN", uploadedById: ids.assignedUser, ordenId: ids.activeOrder, createdAt },
      { id: ids.orderInternal, originalName: "internal.pdf", storedName: "internal.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 101n, storageKey: `evidences/fixture/${ids.orderInternal}.pdf`, checksumSha256: "2".repeat(64), accessLevel: "INTERNAL", uploadedById: ids.adminUser, ordenId: ids.activeOrder, createdAt },
      { id: ids.orderArchived, originalName: "archived.pdf", storedName: "archived.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 102n, storageKey: `evidences/fixture/${ids.orderArchived}.pdf`, checksumSha256: "3".repeat(64), accessLevel: "TECHNICIAN", uploadedById: ids.assignedUser, ordenId: ids.activeOrder, createdAt, deletedAt: new Date("2026-08-17T13:00:00.000Z"), deletedById: ids.adminUser, deletionReason: "Evidence archived for test retention" },
      { id: ids.orderTechnicianTie, originalName: "technician-tie.pdf", storedName: "technician-tie.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 103n, storageKey: `evidences/fixture/${ids.orderTechnicianTie}.pdf`, checksumSha256: "4".repeat(64), accessLevel: "TECHNICIAN", uploadedById: ids.assignedUser, ordenId: ids.activeOrder, createdAt },
      { id: ids.completedTechnician, originalName: "completed.pdf", storedName: "completed.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 104n, storageKey: `evidences/fixture/${ids.completedTechnician}.pdf`, checksumSha256: "5".repeat(64), accessLevel: "TECHNICIAN", uploadedById: ids.formerUser, ordenId: ids.completedOrder, createdAt },
      { id: ids.cancelledForeign, originalName: "foreign.pdf", storedName: "foreign.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 105n, storageKey: `evidences/fixture/${ids.cancelledForeign}.pdf`, checksumSha256: "6".repeat(64), accessLevel: "TECHNICIAN", uploadedById: ids.foreignUser, ordenId: ids.cancelledOrder, createdAt },
      { id: ids.currentActivityTechnician, originalName: "activity-current.pdf", storedName: "activity-current.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 106n, storageKey: `evidences/fixture/${ids.currentActivityTechnician}.pdf`, checksumSha256: "7".repeat(64), accessLevel: "TECHNICIAN", uploadedById: ids.assignedUser, actividadId: ids.currentActivity, createdAt },
      { id: ids.historicalActivityEvidence, originalName: "activity-history.pdf", storedName: "activity-history.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 107n, storageKey: `evidences/fixture/${ids.historicalActivityEvidence}.pdf`, checksumSha256: "8".repeat(64), accessLevel: "TECHNICIAN", uploadedById: ids.historicalActivityUser, actividadId: ids.historicalActivity, createdAt },
      { id: ids.recurrenceLegacy, originalName: "legacy.pdf", storedName: "legacy.pdf", mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 108n, storageKey: `evidences/fixture/${ids.recurrenceLegacy}.pdf`, checksumSha256: "9".repeat(64), accessLevel: "INTERNAL", uploadedById: ids.supervisorUser, reincidenciaId: ids.recurrence, createdAt },
    ],
  });
  return fixture;
}

export async function removeEvidencesReadFixture(database: PrismaClient): Promise<void> {
  await database.auditoria.deleteMany({ where: { entityId: { in: fixtureEvidenceIds } } });
  await database.evidencia.deleteMany({ where: { id: { in: fixtureEvidenceIds } } });
  await database.actividadVisibilidadTecnico.deleteMany({ where: { actividadId: { in: [ids.currentActivity, ids.historicalActivity] } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: [ids.currentActivity, ids.historicalActivity] } } });
  await database.actividad.deleteMany({ where: { id: { in: [ids.currentActivity, ids.historicalActivity] } } });
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: [ids.activeOrder, ids.completedOrder, ids.cancelledOrder] } } });
  await database.reincidencia.deleteMany({ where: { id: ids.recurrence } });
  await database.causaReincidencia.deleteMany({ where: { id: ids.recurrenceCause } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: [ids.activeOrder, ids.completedOrder, ids.cancelledOrder] } } });
  await database.tecnico.deleteMany({ where: { id: { in: [ids.assignedTechnician, ids.formerTechnician, ids.historicalActivityTechnician, ids.foreignTechnician, ids.managerTechnician] } } });
  await database.tipoActividad.deleteMany({ where: { id: ids.activityType } });
  await database.tipoServicio.deleteMany({ where: { id: ids.serviceType } });
  await database.sucursalCliente.deleteMany({ where: { id: ids.branch } });
  await database.cliente.deleteMany({ where: { id: ids.client } });
  await database.usuario.deleteMany({ where: { id: { in: [ids.adminUser, ids.supervisorUser, ids.assignedUser, ids.formerUser, ids.historicalActivityUser, ids.foreignUser] } } });
}
