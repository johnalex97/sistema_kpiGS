import type {
  PublicActivityDetail,
  PublicActivitySummary,
  PublicActivityType,
} from "./activities.types.js";
import type {
  ActivityDetailRecord,
  ActivitySummaryRecord,
  ActivityTypeRecord,
} from "./activities.repository.types.js";

function mapTechnician(technician: {
  id: string;
  code: string;
  fullName: string;
}) {
  return {
    id: technician.id,
    code: technician.code,
    fullName: technician.fullName,
  };
}

export function mapPublicActivityType(
  record: ActivityTypeRecord,
): PublicActivityType {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    displayOrder: record.displayOrder,
  };
}

export function mapPublicActivitySummary(
  record: ActivitySummaryRecord,
): PublicActivitySummary {
  return {
    id: record.id,
    branch: {
      id: record.sucursal.id,
      code: record.sucursal.code,
      name: record.sucursal.name,
      client: {
        id: record.sucursal.cliente.id,
        code: record.sucursal.cliente.code,
        tradeName: record.sucursal.cliente.tradeName,
      },
    },
    order: record.orden === null
      ? null
      : { id: record.orden.id, orderNumber: record.orden.orderNumber },
    activityType: mapPublicActivityType(record.tipoActividad),
    status: record.status,
    description: record.description,
    result: record.result,
    responsible: record.tecnicos[0] === undefined
      ? null
      : mapTechnician(record.tecnicos[0].tecnico),
    startedAt: record.startedAt?.toISOString() ?? null,
    endedAt: record.endedAt?.toISOString() ?? null,
    pausedMinutes: record.pausedMinutes,
    productiveMinutes: record.productiveMinutes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

export function mapPublicActivityDetail(
  record: ActivityDetailRecord,
): PublicActivityDetail {
  const summary = mapPublicActivitySummary(record);
  return {
    ...summary,
    observations: record.observations,
    team: record.tecnicos.map((member) => ({
      technician: mapTechnician(member.tecnico),
      role: member.role,
      participationPercentage: member.participationPercentage.toFixed(2),
      startedAt: member.startedAt?.toISOString() ?? null,
      endedAt: member.endedAt?.toISOString() ?? null,
    })),
    pauses: record.pausas.map((pause) => ({
      id: pause.id,
      startedAt: pause.startedAt.toISOString(),
      endedAt: pause.endedAt?.toISOString() ?? null,
      reason: pause.reason,
    })),
  };
}
