import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface ActivitiesReadFixture {
  suffix: string;
  primaryClientId: string;
  primaryBranchId: string;
  secondaryClientId: string;
  secondaryBranchId: string;
  serviceTypeId: string;
  catalogTieFirstTypeId: string;
  catalogTieSecondTypeId: string;
  primaryTypeId: string;
  secondaryTypeId: string;
  inactiveTypeId: string;
  deletedTypeId: string;
  deletedClientId: string;
  deletedClientBranchId: string;
  deletedBranchId: string;
  deletedOrderId: string;
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
  deletedClientActivityId: string;
  deletedBranchActivityId: string;
  deletedTypeActivityId: string;
  deletedOrderActivityId: string;
}

export async function createActivitiesReadFixture(
  database: PrismaClient,
): Promise<ActivitiesReadFixture> {
  const suffix = randomUUID().slice(0, 8);
  const createdAtTiePrefix = randomUUID().slice(0, -1);
  const catalogTiePrefix = randomUUID().slice(0, -1);
  const fixture: ActivitiesReadFixture = {
    suffix,
    primaryClientId: randomUUID(),
    primaryBranchId: randomUUID(),
    secondaryClientId: randomUUID(),
    secondaryBranchId: randomUUID(),
    serviceTypeId: randomUUID(),
    catalogTieFirstTypeId: `${catalogTiePrefix}0`,
    catalogTieSecondTypeId: `${catalogTiePrefix}f`,
    primaryTypeId: randomUUID(),
    secondaryTypeId: randomUUID(),
    inactiveTypeId: randomUUID(),
    deletedTypeId: randomUUID(),
    deletedClientId: randomUUID(),
    deletedClientBranchId: randomUUID(),
    deletedBranchId: randomUUID(),
    deletedOrderId: randomUUID(),
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
    deletedClientActivityId: randomUUID(),
    deletedBranchActivityId: randomUUID(),
    deletedTypeActivityId: randomUUID(),
    deletedOrderActivityId: randomUUID(),
  };

  await database.cliente.createMany({
    data: [
      { id: fixture.primaryClientId, code: `ACT-${suffix}-A`, tradeName: `Cliente primario ${suffix}` },
      { id: fixture.secondaryClientId, code: `ACT-${suffix}-B`, tradeName: `Cliente secundario ${suffix}` },
      { id: fixture.deletedClientId, code: `ACT-${suffix}-X`, tradeName: `Cliente eliminado ${suffix}`, deletedAt: new Date("2026-08-01T08:00:00.000Z") },
    ],
  });
  await database.sucursalCliente.createMany({
    data: [
      { id: fixture.primaryBranchId, clienteId: fixture.primaryClientId, code: "MAIN", name: `Sucursal primaria ${suffix}`, address: "Centro" },
      { id: fixture.secondaryBranchId, clienteId: fixture.secondaryClientId, code: "NORTH", name: `Sucursal secundaria ${suffix}`, address: "Norte" },
      { id: fixture.deletedClientBranchId, clienteId: fixture.deletedClientId, code: "DELETED-CLIENT", name: `Sucursal cliente eliminado ${suffix}`, address: "Centro" },
      { id: fixture.deletedBranchId, clienteId: fixture.primaryClientId, code: "DELETED-BRANCH", name: `Sucursal eliminada ${suffix}`, address: "Centro", deletedAt: new Date("2026-08-01T08:00:00.000Z") },
    ],
  });
  await database.tipoServicio.create({
    data: { id: fixture.serviceTypeId, code: `ACT-${suffix}`, name: `Servicio ${suffix}` },
  });
  await database.tipoActividad.createMany({
    data: [
      { id: fixture.secondaryTypeId, code: `ACT-${suffix}-B`, name: `Actividad Beta ${suffix}`, displayOrder: 2 },
      { id: fixture.catalogTieSecondTypeId, code: `ACT-${suffix}-T2`, name: `Actividad empate ${suffix}`, displayOrder: 1 },
      { id: fixture.primaryTypeId, code: `ACT-${suffix}-A`, name: `Actividad Alfa ${suffix}`, displayOrder: 2 },
      { id: fixture.inactiveTypeId, code: `ACT-${suffix}-I`, name: `Actividad inactiva ${suffix}`, displayOrder: 0, isActive: false },
      { id: fixture.catalogTieFirstTypeId, code: `ACT-${suffix}-T1`, name: `Actividad empate ${suffix}`, displayOrder: 1 },
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
      { id: fixture.deletedOrderId, orderNumber: `ACT-${suffix}-003`, sucursalId: fixture.primaryBranchId, tipoServicioId: fixture.serviceTypeId, reportedProblem: "Lecturas", deletedAt: new Date("2026-08-01T08:00:00.000Z") },
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
      { id: fixture.deletedClientActivityId, sucursalId: fixture.deletedClientBranchId, tipoActividadId: fixture.primaryTypeId, status: "PENDING", description: `Cliente padre eliminado ${suffix}`, createdAt: new Date("2026-08-01T07:00:00.000Z") },
      { id: fixture.deletedBranchActivityId, sucursalId: fixture.deletedBranchId, tipoActividadId: fixture.primaryTypeId, status: "PENDING", description: `Sucursal padre eliminada ${suffix}`, createdAt: new Date("2026-08-01T07:00:00.000Z") },
      { id: fixture.deletedTypeActivityId, sucursalId: fixture.primaryBranchId, tipoActividadId: fixture.deletedTypeId, status: "PENDING", description: `Tipo padre eliminado ${suffix}`, createdAt: new Date("2026-08-01T07:00:00.000Z") },
      { id: fixture.deletedOrderActivityId, sucursalId: fixture.primaryBranchId, ordenId: fixture.deletedOrderId, tipoActividadId: fixture.primaryTypeId, status: "PENDING", description: `Orden padre eliminada ${suffix}`, createdAt: new Date("2026-08-01T07:00:00.000Z") },
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
    fixture.deletedClientActivityId,
    fixture.deletedBranchActivityId,
    fixture.deletedTypeActivityId,
    fixture.deletedOrderActivityId,
  ];
  await database.pausaActividad.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividadTecnico.deleteMany({ where: { actividadId: { in: activityIds } } });
  await database.actividad.deleteMany({ where: { id: { in: activityIds } } });
  await database.ordenTrabajo.deleteMany({
    where: { id: { in: [fixture.primaryOrderId, fixture.secondaryOrderId, fixture.deletedOrderId] } },
  });
  await database.tecnico.deleteMany({
    where: { id: { in: [fixture.technicianId, fixture.historicalTechnicianId, fixture.foreignTechnicianId, fixture.searchTechnicianId] } },
  });
  await database.tipoActividad.deleteMany({
    where: { id: { in: [fixture.catalogTieFirstTypeId, fixture.catalogTieSecondTypeId, fixture.primaryTypeId, fixture.secondaryTypeId, fixture.inactiveTypeId, fixture.deletedTypeId] } },
  });
  await database.tipoServicio.deleteMany({ where: { id: fixture.serviceTypeId } });
  await database.sucursalCliente.deleteMany({
    where: { id: { in: [fixture.primaryBranchId, fixture.secondaryBranchId, fixture.deletedClientBranchId, fixture.deletedBranchId] } },
  });
  await database.cliente.deleteMany({
    where: { id: { in: [fixture.primaryClientId, fixture.secondaryClientId, fixture.deletedClientId] } },
  });
}
