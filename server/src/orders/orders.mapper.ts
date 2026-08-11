import type {
  PublicOrderDetail,
  PublicOrderHistory,
  PublicOrderSummary,
} from "./orders.types.js";
import { isOrderOverdue } from "./orders.state-machine.js";
import type {
  OrderDetailRecord,
  OrderHistoryRecord,
  OrderSummaryRecord,
} from "./orders.repository.types.js";

export function mapPublicOrderSummary(
  record: OrderSummaryRecord,
  now: Date,
): PublicOrderSummary {
  const primary = record.tecnicos.find(
    (assignment) =>
      assignment.role === "PRIMARY" && assignment.unassignedAt === null,
  )?.tecnico ?? null;
  return {
    id: record.id,
    orderNumber: record.orderNumber,
    client: record.sucursal.cliente,
    branch: {
      id: record.sucursal.id,
      code: record.sucursal.code,
      name: record.sucursal.name,
    },
    serviceType: record.tipoServicio,
    priority: record.priority,
    status: record.status,
    reportedProblem: record.reportedProblem,
    scheduledFor: record.scheduledFor?.toISOString() ?? null,
    primaryTechnician: primary,
    supportCount: record._count.tecnicos,
    overdue: isOrderOverdue(record.status, record.scheduledFor, now),
    startedAt: record.startedAt?.toISOString() ?? null,
    endedAt: record.endedAt?.toISOString() ?? null,
    estimatedMinutes: record.estimatedMinutes,
    totalMinutes: record.totalMinutes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

export function mapPublicOrderDetail(
  record: OrderDetailRecord,
  now: Date,
): PublicOrderDetail {
  const summary = mapPublicOrderSummary(record, now);
  return {
    ...summary,
    description: record.description,
    diagnosis: record.diagnosis,
    result: record.result,
    cancellationReason: record.cancellationReason,
    participants: record.tecnicos.map((assignment) => ({
      id: assignment.tecnico.id,
      code: assignment.tecnico.code,
      fullName: assignment.tecnico.fullName,
      role: assignment.role,
      assignedAt: assignment.assignedAt.toISOString(),
      unassignedAt: assignment.unassignedAt?.toISOString() ?? null,
      active: assignment.unassignedAt === null,
    })),
    materials: record.materiales.map((usage) => ({
      id: usage.id,
      material: usage.material,
      quantity: usage.quantity.toFixed(3),
      historicalUnitCost: usage.historicalUnitCost.toFixed(2),
      observation: usage.observation,
      createdAt: usage.createdAt.toISOString(),
    })),
  };
}

export function mapPublicOrderHistory(
  record: OrderHistoryRecord,
): PublicOrderHistory {
  return {
    id: record.id,
    previousStatus: record.previousStatus,
    newStatus: record.newStatus,
    action: record.action,
    comment: record.comment,
    occurredAt: record.occurredAt.toISOString(),
    user: record.usuario,
    metadata: record.metadata as Record<string, unknown> | null,
  };
}
