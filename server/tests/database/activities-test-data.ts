import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface ActivitiesReadFixture {
  suffix: string;
  primaryClientId: string;
  primaryBranchId: string;
  secondaryClientId: string;
  secondaryBranchId: string;
  serviceTypeId: string;
  primaryTypeId: string;
  secondaryTypeId: string;
  deletedTypeId: string;
  technicianId: string;
  historicalTechnicianId: string;
  foreignTechnicianId: string;
  searchTechnicianId: string;
  primaryOrderId: string;
  secondaryOrderId: string;
  pendingActivityId: string;
  runningActivityId: string;
  completedActivityId: string;
  createdAtTieFirstId: string;
  createdAtTieSecondId: string;
  createdAtTieThirdId: string;
  deletedActivityId: string;
}

export async function createActivitiesReadFixture(
  database: PrismaClient,
): Promise<ActivitiesReadFixture> {
  const suffix = randomUUID().slice(0, 8);
  const createdAtTiePrefix = randomUUID().slice(0, -1);
  const fixture: ActivitiesReadFixture = {
    suffix,
    primaryClientId: randomUUID(),
    primaryBranchId: randomUUID(),
    secondaryClientId: randomUUID(),
    secondaryBranchId: randomUUID(),
    serviceTypeId: randomUUID(),
    primaryTypeId: randomUUID(),
    secondaryTypeId: randomUUID(),
    deletedTypeId: randomUUID(),
    technicianId: randomUUID(),
    historicalTechnicianId: randomUUID(),
    foreignTechnicianId: randomUUID(),
    searchTechnicianId: randomUUID(),
    primaryOrderId: randomUUID(),
    secondaryOrderId: randomUUID(),
    pendingActivityId: randomUUID(),
    runningActivityId: randomUUID(),
    completedActivityId: randomUUID(),
    createdAtTieFirstId: `${createdAtTiePrefix}0`,
    createdAtTieSecondId: `${createdAtTiePrefix}8`,
    createdAtTieThirdId: `${createdAtTiePrefix}f`,
    deletedActivityId: randomUUID(),
  };

  await database.cliente.createMany({
    data: [
      { id: fixture.primaryClientId, code: `ACT-${suffix}-A`, tradeName: `Cliente primario ${suffix}` },
      { id: fixture.secondaryClientId, code: `ACT-${suffix}-B`, tradeName: `Cliente secundario ${suffix}` },
    ],
  });
  await database.sucursalCliente.createMany({
    data: [
      { id: fixture.primaryBranchId, clienteId: fixture.primaryClientId, code: "MAIN", name: `Sucursal primaria ${suffix}`, address: "Centro" },
      { id: fixture.secondaryBranchId, clienteId: fixture.secondaryClientId, code: "NORTH", name: `Sucursal secundaria ${suffix}`, address: "Norte" },
    ],
  });
  await database.tipoServicio.create({
    data: { id: fixture.serviceTypeId, code: `ACT-${suffix}`, name: `Servicio ${suffix}` },
  });
  await database.tipoActividad.createMany({
    data: [
      { id: fixture.primaryTypeId, code: `ACT-${suffix}-A`, name: `Actividad Alfa ${suffix}`, displayOrder: 2 },
      { id: fixture.secondaryTypeId, code: `ACT-${suffix}-B`, name: `Actividad Beta ${suffix}`, displayOrder: 2 },
      { id: fixture.deletedTypeId, code: `ACT-${suffix}-X`, name: `Actividad eliminada ${suffix}`, displayOrder: 1, deletedAt: new Date("2026-08-01T08:00:00.000Z") },
    ],
  });
  await database.tecnico.createMany({
    data: [
      { id: fixture.technicianId, code: `AT-${suffix}-A`, fullName: `Técnico actual ${suffix}` },
      { id: fixture.historicalTechnicianId, code: `AT-${suffix}-B`, fullName: `Técnico histórico ${suffix}` },
      { id: fixture.foreignTechnicianId, code: `AT-${suffix}-C`, fullName: `Técnico ajeno ${suffix}` },
      { id: fixture.searchTechnicianId, code: `AT-${suffix}-D`, fullName: `Técnico buscable ${suffix}` },
    ],
  });
  await database.ordenTrabajo.createMany({
    data: [
      { id: fixture.primaryOrderId, orderNumber: `ACT-${suffix}-001`, sucursalId: fixture.primaryBranchId, tipoServicioId: fixture.serviceTypeId, reportedProblem: "Lecturas" },
      { id: fixture.secondaryOrderId, orderNumber: `ACT-${suffix}-002`, sucursalId: fixture.secondaryBranchId, tipoServicioId: fixture.serviceTypeId, reportedProblem: "Lecturas" },
    ],
  });

  await database.actividad.createMany({
    data: [
      { id: fixture.pendingActivityId, sucursalId: fixture.primaryBranchId, ordenId: fixture.primaryOrderId, tipoActividadId: fixture.primaryTypeId, status: "PENDING", description: `Descripción pendiente ${suffix}`, createdAt: new Date("2026-08-01T12:00:00.000Z") },
      { id: fixture.runningActivityId, sucursalId: fixture.secondaryBranchId, ordenId: fixture.secondaryOrderId, tipoActividadId: fixture.secondaryTypeId, status: "IN_PROGRESS", description: `Preparación ${suffix}`, result: `Resultado histórico ${suffix}`, startedAt: new Date("2026-08-01T09:00:00.000Z"), createdAt: new Date("2026-08-01T11:00:00.000Z") },
      { id: fixture.completedActivityId, sucursalId: fixture.primaryBranchId, tipoActividadId: fixture.primaryTypeId, status: "COMPLETED", description: `Cierre ${suffix}`, startedAt: new Date("2026-08-01T08:00:00.000Z"), endedAt: new Date("2026-08-01T08:30:00.000Z"), productiveMinutes: 30, createdAt: new Date("2026-08-01T10:00:00.000Z") },
      { id: fixture.createdAtTieFirstId, sucursalId: fixture.primaryBranchId, tipoActividadId: fixture.primaryTypeId, status: "PENDING", description: `Empate uno ${suffix}`, createdAt: new Date("2026-08-01T09:00:00.000Z") },
      { id: fixture.createdAtTieSecondId, sucursalId: fixture.primaryBranchId, tipoActividadId: fixture.primaryTypeId, status: "PENDING", description: `Empate dos ${suffix}`, createdAt: new Date("2026-08-01T09:00:00.000Z") },
      { id: fixture.createdAtTieThirdId, sucursalId: fixture.primaryBranchId, tipoActividadId: fixture.primaryTypeId, status: "PENDING", description: `Empate tres ${suffix}`, createdAt: new Date("2026-08-01T09:00:00.000Z") },
      { id: fixture.deletedActivityId, sucursalId: fixture.primaryBranchId, tipoActividadId: fixture.primaryTypeId, status: "CANCELLED", description: `Eliminada ${suffix}`, deletedAt: new Date("2026-08-01T08:00:00.000Z"), createdAt: new Date("2026-08-01T08:00:00.000Z") },
    ],
  });
  await database.actividadTecnico.createMany({
    data: [
      { actividadId: fixture.pendingActivityId, tecnicoId: fixture.technicianId, role: "RESPONSIBLE" },
      { actividadId: fixture.runningActivityId, tecnicoId: fixture.historicalTechnicianId, role: "RESPONSIBLE" },
      { actividadId: fixture.runningActivityId, tecnicoId: fixture.technicianId, role: "PARTICIPANT", endedAt: new Date("2026-08-01T10:00:00.000Z") },
      { actividadId: fixture.completedActivityId, tecnicoId: fixture.foreignTechnicianId, role: "RESPONSIBLE" },
      { actividadId: fixture.createdAtTieFirstId, tecnicoId: fixture.searchTechnicianId, role: "RESPONSIBLE" },
      { actividadId: fixture.createdAtTieSecondId, tecnicoId: fixture.searchTechnicianId, role: "RESPONSIBLE" },
      { actividadId: fixture.createdAtTieThirdId, tecnicoId: fixture.searchTechnicianId, role: "RESPONSIBLE" },
      { actividadId: fixture.deletedActivityId, tecnicoId: fixture.foreignTechnicianId, role: "RESPONSIBLE" },
    ],
  });
  return fixture;
}

export async function removeActivitiesReadFixture(
  database: PrismaClient,
  fixture: ActivitiesReadFixture,
): Promise<void> {
  const activityIds = [
    fixture.pendingActivityId,
    fixture.runningActivityId,
    fixture.completedActivityId,
    fixture.createdAtTieFirstId,
    fixture.createdAtTieSecondId,
    fixture.createdAtTieThirdId,
    fixture.deletedActivityId,
  ];
  await database.pausaActividad.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  await database.ordenTrabajo.deleteMany({
    where: { id: { in: [fixture.primaryOrderId, fixture.secondaryOrderId] } },
  });
  await database.tecnico.deleteMany({
    where: { id: { in: [fixture.technicianId, fixture.historicalTechnicianId, fixture.foreignTechnicianId, fixture.searchTechnicianId] } },
  });
  await database.tipoActividad.deleteMany({
    where: { id: { in: [fixture.primaryTypeId, fixture.secondaryTypeId, fixture.deletedTypeId] } },
  });
  await database.tipoServicio.deleteMany({ where: { id: fixture.serviceTypeId } });
  await database.sucursalCliente.deleteMany({
    where: { id: { in: [fixture.primaryBranchId, fixture.secondaryBranchId] } },
  });
  await database.cliente.deleteMany({
    where: { id: { in: [fixture.primaryClientId, fixture.secondaryClientId] } },
  });
}
