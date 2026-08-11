import type { Prisma } from "../../generated/prisma/client.js";
import type { ActivityFailureKind } from "./activities.repository.types.js";
import type { ActivityDetailRecord } from "./activities.repository.types.js";
import { calculateActivityMinutes } from "./activities.time.js";
import type {
  ActivityActorContext,
  ActivityTeamMemberInput,
  CreateActivityInput,
  ManualActivityInput,
  AdjustActivityInput,
} from "./activities.types.js";

export interface ValidatedActivityContext {
  branchId: string;
  orderId: string | null;
  team: ActivityTeamMemberInput[];
}

function invalid(): { kind: ActivityFailureKind } {
  return { kind: "INVALID_PARTICIPATION_TOTAL" };
}

function percentageInHundredths(value: string): number | null {
  if (!/^(?:0\.(?:0[1-9]|[1-9]\d)|[1-9]\d?\.\d{2}|100\.00)$/.test(value)) {
    return null;
  }
  return Number(value.replace(".", ""));
}

export function validateActivityTeam(
  team: ActivityTeamMemberInput[],
): ActivityTeamMemberInput[] | null {
  const sorted = [...team].sort((left, right) => left.technicianId.localeCompare(right.technicianId));
  if (sorted.length === 0 || new Set(sorted.map(({ technicianId }) => technicianId)).size !== sorted.length) return null;
  if (sorted.filter(({ role }) => role === "RESPONSIBLE").length !== 1) return null;
  const total = sorted.reduce<number | null>((sum, member) => {
    const percentage = percentageInHundredths(member.participationPercentage);
    return sum === null || percentage === null ? null : sum + percentage;
  }, 0);
  return total === 10_000 ? sorted : null;
}

export async function grantActivityVisibility(
  transaction: Prisma.TransactionClient,
  activityId: string,
  technicianIds: readonly string[],
): Promise<void> {
  await transaction.actividadVisibilidadTecnico.createMany({
    data: [...new Set(technicianIds)].map((technicianId) => ({
      actividadId: activityId,
      tecnicoId: technicianId,
    })),
    skipDuplicates: true,
  });
}

export async function findProductiveSegments(
  transaction: Prisma.TransactionClient,
  technicianId: string,
  range: TimeRange,
  now: Date,
  excludeActivityId?: string,
): Promise<TimeRange[]> {
  const memberships = await transaction.actividadTecnico.findMany({
    where: {
      tecnicoId: technicianId,
      actividad: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        startedAt: { lt: range.endedAt },
        OR: [{ endedAt: { gt: range.startedAt } }, { endedAt: null }],
        ...(excludeActivityId !== undefined && { id: { not: excludeActivityId } }),
      },
    },
    select: {
      actividad: {
        select: {
          status: true,
          startedAt: true,
          endedAt: true,
          pausas: {
            select: { startedAt: true, endedAt: true },
            orderBy: [{ startedAt: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });

  return memberships.flatMap(({ actividad }) => {
    if (actividad.startedAt === null) return [];
    const effectiveEnd = actividad.endedAt
      ?? (actividad.status === "PAUSED"
        ? actividad.pausas.find(({ endedAt }) => endedAt === null)?.startedAt
        : actividad.status === "IN_PROGRESS"
          ? now
          : undefined);
    if (effectiveEnd === undefined || effectiveEnd.getTime() <= actividad.startedAt.getTime()) {
      return [];
    }
    return calculateActivityMinutes(
      actividad.startedAt,
      effectiveEnd,
      actividad.pausas.flatMap((pause) => pause.endedAt === null ? [] : [{
        startedAt: pause.startedAt,
        endedAt: pause.endedAt,
      }]),
    ).productiveSegments;
  });
}

async function activeActivityType(
  transaction: Prisma.TransactionClient,
  activityTypeId: string,
): Promise<boolean> {
  return (await transaction.tipoActividad.findFirst({
    where: { id: activityTypeId, isActive: true, deletedAt: null }, select: { id: true },
  })) !== null;
}

async function activeStandaloneBranch(
  transaction: Prisma.TransactionClient,
  branchId: string,
): Promise<boolean> {
  return (await transaction.sucursalCliente.findFirst({
    where: { id: branchId, isActive: true, deletedAt: null, cliente: { isActive: true, deletedAt: null } },
    select: { id: true },
  })) !== null;
}

async function activeTechnicians(
  transaction: Prisma.TransactionClient,
  technicianIds: readonly string[],
): Promise<boolean> {
  const count = await transaction.tecnico.count({
    where: { id: { in: [...technicianIds] }, status: { not: "INACTIVE" }, deletedAt: null },
  });
  return count === technicianIds.length;
}

export async function validateActivityContext(
  transaction: Prisma.TransactionClient,
  input: CreateActivityInput | ManualActivityInput,
  actor: ActivityActorContext,
): Promise<ValidatedActivityContext | { kind: ActivityFailureKind }> {
  if (!(await activeActivityType(transaction, input.activityTypeId))) {
    return { kind: "ACTIVITY_TYPE_NOT_FOUND" };
  }

  let branchId: string;
  let orderId: string | null = null;
  let orderAssignments: Array<{
    tecnicoId: string;
    role: "PRIMARY" | "SUPPORT";
    assignedAt: Date;
    unassignedAt: Date | null;
  }> = [];
  if (input.orderId !== undefined) {
    const order = await transaction.ordenTrabajo.findFirst({
      where: {
        id: input.orderId, deletedAt: null, status: { not: "CANCELLED" },
        sucursal: { isActive: true, deletedAt: null, cliente: { isActive: true, deletedAt: null } },
      },
      select: { sucursalId: true, tecnicos: { select: { tecnicoId: true, role: true, assignedAt: true, unassignedAt: true } } },
    });
    if (!order) return { kind: "RESOURCE_INACTIVE" };
    branchId = order.sucursalId;
    orderId = input.orderId;
    orderAssignments = order.tecnicos;
  } else if (input.branchId !== undefined && await activeStandaloneBranch(transaction, input.branchId)) {
    branchId = input.branchId;
  } else {
    return { kind: "RESOURCE_INACTIVE" };
  }

  const historicalManualRange = "startedAt" in input
    ? { startedAt: input.startedAt, endedAt: input.endedAt }
    : undefined;
  const validOrderAssignments = historicalManualRange === undefined
    ? orderAssignments.filter(({ unassignedAt }) => unassignedAt === null)
    : orderAssignments.filter(({ assignedAt, unassignedAt }) => (
      assignedAt.getTime() <= historicalManualRange.startedAt.getTime()
      && (unassignedAt === null || unassignedAt.getTime() >= historicalManualRange.endedAt.getTime())
    ));

  const selfOnlyActor =
    actor.technicianId !== null &&
    !actor.permissions.includes("ACTIVITIES_MANAGE");
  const requestedTeam = !selfOnlyActor
    ? input.team ?? (validOrderAssignments.find(({ role }) => role === "PRIMARY")
      ? [{ technicianId: validOrderAssignments.find(({ role }) => role === "PRIMARY")!.tecnicoId, role: "RESPONSIBLE" as const, participationPercentage: "100.00" }]
      : [])
    : [{ technicianId: actor.technicianId!, role: "RESPONSIBLE" as const, participationPercentage: "100.00" }];
  const team = validateActivityTeam(requestedTeam);
  if (!team) return invalid();
  const technicianIds = team.map(({ technicianId }) => technicianId);
  if (!(await activeTechnicians(transaction, technicianIds))) return { kind: "RESOURCE_INACTIVE" };
  if (orderId !== null && technicianIds.some((technicianId) => !validOrderAssignments.some((assignment) => assignment.tecnicoId === technicianId))) {
    return { kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" };
  }
  return { branchId, orderId, team };
}

interface TimeRange {
  startedAt: Date;
  endedAt: Date;
}

export async function validateCompletedAdjustmentContext(
  transaction: Prisma.TransactionClient,
  activity: ActivityDetailRecord,
  input: AdjustActivityInput,
  startedAt: Date,
  endedAt: Date,
): Promise<ValidatedActivityContext | { kind: ActivityFailureKind }> {
  if (input.activityTypeId !== undefined && !(await activeActivityType(transaction, input.activityTypeId))) {
    return { kind: "ACTIVITY_TYPE_NOT_FOUND" };
  }

  const team = validateActivityTeam(input.team ?? activity.tecnicos.map(({ tecnico, role, participationPercentage }) => ({
    technicianId: tecnico.id,
    role,
    participationPercentage: participationPercentage.toFixed(2),
  })));
  if (!team) return invalid();

  const technicianIds = team.map(({ technicianId }) => technicianId);
  if (input.team !== undefined && !(await activeTechnicians(transaction, technicianIds))) {
    return { kind: "RESOURCE_INACTIVE" };
  }

  const historicalCoverageChanged = input.team !== undefined
    || input.startedAt !== undefined
    || input.endedAt !== undefined;
  if (activity.orden !== null && historicalCoverageChanged) {
    const assignments = await transaction.ordenTecnico.findMany({
      where: {
        ordenId: activity.orden.id,
        tecnicoId: { in: technicianIds },
        assignedAt: { lte: startedAt },
        OR: [{ unassignedAt: null }, { unassignedAt: { gte: endedAt } }],
      },
      select: { tecnicoId: true },
    });
    const coveredTechnicianIds = new Set(assignments.map(({ tecnicoId }) => tecnicoId));
    if (technicianIds.some((technicianId) => !coveredTechnicianIds.has(technicianId))) {
      return { kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" };
    }
  }

  return {
    branchId: activity.sucursal.id,
    orderId: activity.orden?.id ?? null,
    team,
  };
}

async function lockCurrentActivityParents(
  transaction: Prisma.TransactionClient,
  activity: ActivityDetailRecord,
): Promise<boolean> {
  if (activity.orden !== null) {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT order_row."id"
      FROM "orden_trabajo" AS order_row
      JOIN "sucursal_cliente" AS branch_row
        ON branch_row."id" = order_row."sucursal_id"
      JOIN "cliente" AS client_row
        ON client_row."id" = branch_row."cliente_id"
      WHERE order_row."id" = ${activity.orden.id}::uuid
        AND order_row."deleted_at" IS NULL
        AND order_row."status" <> 'cancelled'::"estado_orden"
        AND branch_row."is_active" = true
        AND branch_row."deleted_at" IS NULL
        AND client_row."is_active" = true
        AND client_row."deleted_at" IS NULL
      FOR UPDATE OF order_row, branch_row, client_row
    `;
    return rows.length === 1;
  }

  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT branch_row."id"
    FROM "sucursal_cliente" AS branch_row
    JOIN "cliente" AS client_row
      ON client_row."id" = branch_row."cliente_id"
    WHERE branch_row."id" = ${activity.sucursal.id}::uuid
      AND branch_row."is_active" = true
      AND branch_row."deleted_at" IS NULL
      AND client_row."is_active" = true
      AND client_row."deleted_at" IS NULL
    FOR UPDATE OF branch_row, client_row
  `;
  return rows.length === 1;
}

export async function validateOperationalActivityContext(
  transaction: Prisma.TransactionClient,
  activity: ActivityDetailRecord,
): Promise<{ kind: ActivityFailureKind } | null> {
  if (!(await lockCurrentActivityParents(transaction, activity))) {
    return { kind: "RESOURCE_INACTIVE" };
  }

  const activityTypes = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "tipo_actividad"
    WHERE "id" = ${activity.tipoActividad.id}::uuid
      AND "is_active" = true
      AND "deleted_at" IS NULL
    FOR UPDATE
  `;
  if (activityTypes.length !== 1) return { kind: "ACTIVITY_TYPE_NOT_FOUND" };

  const technicianIds = activity.tecnicos
    .map(({ tecnico }) => tecnico.id)
    .sort((left, right) => left.localeCompare(right));
  for (const technicianId of technicianIds) {
    const technicians = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "tecnico"
      WHERE "id" = ${technicianId}::uuid
        AND "status" <> 'inactive'::"estado_tecnico"
        AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    if (technicians.length !== 1) return { kind: "RESOURCE_INACTIVE" };
  }

  if (activity.orden !== null) {
    const assignments = await transaction.ordenTecnico.findMany({
      where: {
        ordenId: activity.orden.id,
        tecnicoId: { in: technicianIds },
        unassignedAt: null,
      },
      select: { tecnicoId: true },
    });
    const assignedTechnicianIds = new Set(assignments.map(({ tecnicoId }) => tecnicoId));
    if (technicianIds.some((technicianId) => !assignedTechnicianIds.has(technicianId))) {
      return { kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" };
    }
  }

  return null;
}
