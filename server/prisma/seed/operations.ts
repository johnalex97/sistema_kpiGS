import {
  EstadoActividad,
  EstadoOrden,
  PrioridadOrden,
  RolActividadTecnico,
  RolOrdenTecnico,
  TipoRelacionOrden,
} from "../../generated/prisma/client.js";
import type { SeedCatalogs } from "./catalogs.js";
import { seedIds, type SeedClient } from "./constants.js";
import type { SeedIdentity } from "./identity.js";
import type { SeedOrganization } from "./organization.js";

export interface SeedOperations {
  orderIds: Record<string, string>;
  activityIds: Record<string, string>;
}

function requireId(
  values: Record<string, string>,
  key: string,
  label: string,
): string {
  const value = values[key];
  if (!value) throw new Error(`${label} seed no encontrado: ${key}`);
  return value;
}

export async function seedOperations(
  database: SeedClient,
  catalogs: SeedCatalogs,
  identity: SeedIdentity,
  organization: SeedOrganization,
): Promise<SeedOperations> {
  const firstBranchId = requireId(
    organization.branchIds,
    "CLI-001:MAIN",
    "Sucursal",
  );
  const secondBranchId = requireId(
    organization.branchIds,
    "CLI-002:MAIN",
    "Sucursal",
  );
  const supportServiceId = requireId(
    catalogs.serviceTypes,
    "SUPPORT",
    "Tipo de servicio",
  );
  const installationServiceId = requireId(
    catalogs.serviceTypes,
    "INSTALLATION",
    "Tipo de servicio",
  );

  const orderData = [
    {
      orderNumber: "GS-2026-0001",
      sucursalId: firstBranchId,
      tipoServicioId: supportServiceId,
      priority: PrioridadOrden.HIGH,
      status: EstadoOrden.COMPLETED,
      reportedProblem: "Intermitencia de red en ambiente ficticio",
      description: "Diagnóstico y ajuste de red de demostración",
      scheduledFor: new Date("2026-07-27T14:00:00.000Z"),
      startedAt: new Date("2026-07-27T14:05:00.000Z"),
      endedAt: new Date("2026-07-27T15:35:00.000Z"),
      diagnosis: "Conector deteriorado en escenario ficticio",
      result: "Conectividad restablecida para demostración",
      totalMinutes: 90,
    },
    {
      orderNumber: "GS-2026-0002",
      sucursalId: firstBranchId,
      tipoServicioId: supportServiceId,
      priority: PrioridadOrden.MEDIUM,
      status: EstadoOrden.IN_PROGRESS,
      reportedProblem: "Seguimiento de conectividad de demostración",
      description: "Verificación posterior ficticia",
      scheduledFor: new Date("2026-07-28T15:00:00.000Z"),
      startedAt: new Date("2026-07-28T15:10:00.000Z"),
      endedAt: null,
      diagnosis: null,
      result: null,
      totalMinutes: null,
    },
    {
      orderNumber: "GS-2026-0003",
      sucursalId: secondBranchId,
      tipoServicioId: installationServiceId,
      priority: PrioridadOrden.CRITICAL,
      status: EstadoOrden.ASSIGNED,
      reportedProblem: "Instalación de equipo de laboratorio ficticio",
      description: "Preparación de instalación de demostración",
      scheduledFor: new Date("2026-07-29T14:00:00.000Z"),
      startedAt: null,
      endedAt: null,
      diagnosis: null,
      result: null,
      totalMinutes: null,
    },
  ] as const;

  const orderIds: Record<string, string> = {};
  for (const item of orderData) {
    const order = await database.ordenTrabajo.upsert({
      where: { orderNumber: item.orderNumber },
      update: {
        ...item,
        deletedAt: null,
      },
      create: {
        ...item,
        estimatedMinutes: 120,
      },
    });
    orderIds[item.orderNumber] = order.id;
  }

  const firstOrderId = requireId(orderIds, "GS-2026-0001", "Orden");
  const secondOrderId = requireId(orderIds, "GS-2026-0002", "Orden");
  const thirdOrderId = requireId(orderIds, "GS-2026-0003", "Orden");
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

  const assignmentData = [
    [firstOrderId, firstTechnicianId, RolOrdenTecnico.PRIMARY],
    [firstOrderId, secondTechnicianId, RolOrdenTecnico.SUPPORT],
    [secondOrderId, firstTechnicianId, RolOrdenTecnico.PRIMARY],
    [thirdOrderId, thirdTechnicianId, RolOrdenTecnico.PRIMARY],
  ] as const;

  for (const [ordenId, tecnicoId, role] of assignmentData) {
    const currentAssignment = await database.ordenTecnico.findFirst({
      where: { ordenId, tecnicoId, unassignedAt: null },
      select: { id: true },
    });
    if (currentAssignment === null) {
      await database.ordenTecnico.create({
        data: {
          ordenId,
          tecnicoId,
          role,
          assignedById: identity.supervisorUserId,
        },
      });
    } else {
      await database.ordenTecnico.update({
        where: { id: currentAssignment.id },
        data: {
          role,
          assignedById: identity.supervisorUserId,
        },
      });
    }
  }

  await database.historialOrden.upsert({
    where: { id: seedIds.orderHistory.first },
    update: {
      ordenId: firstOrderId,
      previousStatus: EstadoOrden.IN_PROGRESS,
      newStatus: EstadoOrden.COMPLETED,
    },
    create: {
      id: seedIds.orderHistory.first,
      ordenId: firstOrderId,
      previousStatus: EstadoOrden.IN_PROGRESS,
      newStatus: EstadoOrden.COMPLETED,
      action: "ORDER_COMPLETED",
      comment: "Orden ficticia finalizada",
      userId: identity.supervisorUserId,
      occurredAt: new Date("2026-07-27T15:35:00.000Z"),
    },
  });

  await database.historialOrden.upsert({
    where: { id: seedIds.orderHistory.second },
    update: {
      ordenId: secondOrderId,
      previousStatus: EstadoOrden.ASSIGNED,
      newStatus: EstadoOrden.IN_PROGRESS,
    },
    create: {
      id: seedIds.orderHistory.second,
      ordenId: secondOrderId,
      previousStatus: EstadoOrden.ASSIGNED,
      newStatus: EstadoOrden.IN_PROGRESS,
      action: "ORDER_STARTED",
      comment: "Orden ficticia iniciada",
      userId: identity.technicianUserId,
      occurredAt: new Date("2026-07-28T15:10:00.000Z"),
    },
  });

  await database.ordenRelacionada.upsert({
    where: {
      ordenOriginalId_ordenRelacionadaId_type: {
        ordenOriginalId: firstOrderId,
        ordenRelacionadaId: secondOrderId,
        type: TipoRelacionOrden.RECURRENCE,
      },
    },
    update: { reason: "Seguimiento ficticio del mismo incidente" },
    create: {
      ordenOriginalId: firstOrderId,
      ordenRelacionadaId: secondOrderId,
      type: TipoRelacionOrden.RECURRENCE,
      reason: "Seguimiento ficticio del mismo incidente",
      createdById: identity.supervisorUserId,
    },
  });

  const supportActivityTypeId = requireId(
    catalogs.activityTypes,
    "SUPPORT",
    "Tipo de actividad",
  );
  const deliveryActivityTypeId = requireId(
    catalogs.activityTypes,
    "DELIVERY",
    "Tipo de actividad",
  );

  await database.actividad.upsert({
    where: { id: seedIds.activities.planned },
    update: {
      sucursalId: firstBranchId,
      ordenId: firstOrderId,
      tipoActividadId: supportActivityTypeId,
      status: EstadoActividad.COMPLETED,
      deletedAt: null,
    },
    create: {
      id: seedIds.activities.planned,
      sucursalId: firstBranchId,
      ordenId: firstOrderId,
      tipoActividadId: supportActivityTypeId,
      status: EstadoActividad.COMPLETED,
      description: "Soporte planificado ficticio",
      observations: "Actividad de demostración",
      result: "Servicio completado",
      startedAt: new Date("2026-07-27T14:05:00.000Z"),
      endedAt: new Date("2026-07-27T15:35:00.000Z"),
      pausedMinutes: 10,
      productiveMinutes: 80,
    },
  });

  await database.actividad.upsert({
    where: { id: seedIds.activities.unplanned },
    update: {
      sucursalId: secondBranchId,
      ordenId: null,
      tipoActividadId: deliveryActivityTypeId,
      status: EstadoActividad.COMPLETED,
      deletedAt: null,
    },
    create: {
      id: seedIds.activities.unplanned,
      sucursalId: secondBranchId,
      ordenId: null,
      tipoActividadId: deliveryActivityTypeId,
      status: EstadoActividad.COMPLETED,
      description: "Entrega rápida no programada ficticia",
      result: "Entrega confirmada",
      startedAt: new Date("2026-07-28T13:00:00.000Z"),
      endedAt: new Date("2026-07-28T13:40:00.000Z"),
      productiveMinutes: 40,
    },
  });

  const activityIds = {
    planned: seedIds.activities.planned,
    unplanned: seedIds.activities.unplanned,
  };

  const activityAssignmentData = [
    [
      seedIds.activities.planned,
      firstTechnicianId,
      RolActividadTecnico.RESPONSIBLE,
      "70.00",
    ],
    [
      seedIds.activities.planned,
      secondTechnicianId,
      RolActividadTecnico.PARTICIPANT,
      "30.00",
    ],
    [
      seedIds.activities.unplanned,
      thirdTechnicianId,
      RolActividadTecnico.RESPONSIBLE,
      "100.00",
    ],
  ] as const;

  for (const [actividadId, tecnicoId, role, participationPercentage] of activityAssignmentData) {
    await database.actividadTecnico.upsert({
      where: { actividadId_tecnicoId: { actividadId, tecnicoId } },
      update: { role, participationPercentage },
      create: { actividadId, tecnicoId, role, participationPercentage },
    });
    await database.actividadVisibilidadTecnico.upsert({
      where: { actividadId_tecnicoId: { actividadId, tecnicoId } },
      update: {},
      create: { actividadId, tecnicoId },
    });
  }

  await database.pausaActividad.upsert({
    where: { id: seedIds.pauses.completed },
    update: {
      actividadId: seedIds.activities.planned,
      startedAt: new Date("2026-07-27T14:45:00.000Z"),
      endedAt: new Date("2026-07-27T14:55:00.000Z"),
    },
    create: {
      id: seedIds.pauses.completed,
      actividadId: seedIds.activities.planned,
      startedAt: new Date("2026-07-27T14:45:00.000Z"),
      endedAt: new Date("2026-07-27T14:55:00.000Z"),
      reason: "Espera ficticia de acceso",
      userId: identity.technicianUserId,
    },
  });

  const cableId = requireId(catalogs.materials, "MAT-CABLE-001", "Material");
  const adapterId = requireId(
    catalogs.materials,
    "MAT-ADAPTER-001",
    "Material",
  );

  await database.materialUtilizado.upsert({
    where: { id: seedIds.materialUsage.order },
    update: {
      materialId: cableId,
      ordenId: firstOrderId,
      actividadId: null,
      quantity: "8.000",
      historicalUnitCost: "18.50",
    },
    create: {
      id: seedIds.materialUsage.order,
      materialId: cableId,
      ordenId: firstOrderId,
      quantity: "8.000",
      historicalUnitCost: "18.50",
      observation: "Uso ficticio en orden",
    },
  });

  await database.materialUtilizado.upsert({
    where: { id: seedIds.materialUsage.activity },
    update: {
      materialId: adapterId,
      ordenId: null,
      actividadId: seedIds.activities.unplanned,
      quantity: "1.000",
      historicalUnitCost: "185.00",
    },
    create: {
      id: seedIds.materialUsage.activity,
      materialId: adapterId,
      actividadId: seedIds.activities.unplanned,
      quantity: "1.000",
      historicalUnitCost: "185.00",
      observation: "Uso ficticio en actividad",
    },
  });

  return { orderIds, activityIds };
}
