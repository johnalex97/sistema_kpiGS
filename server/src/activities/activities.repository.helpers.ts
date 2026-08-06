import type { Prisma } from "../../generated/prisma/client.js";
import type { ActivityFailureKind } from "./activities.repository.types.js";
import type {
  ActivityActorContext,
  ActivityTeamMemberInput,
  CreateActivityInput,
  ManualActivityInput,
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

function validTeam(team: ActivityTeamMemberInput[]): ActivityTeamMemberInput[] | null {
  const sorted = [...team].sort((left, right) => left.technicianId.localeCompare(right.technicianId));
  if (sorted.length === 0 || new Set(sorted.map(({ technicianId }) => technicianId)).size !== sorted.length) return null;
  if (sorted.filter(({ role }) => role === "RESPONSIBLE").length !== 1) return null;
  const total = sorted.reduce<number | null>((sum, member) => {
    const percentage = percentageInHundredths(member.participationPercentage);
    return sum === null || percentage === null ? null : sum + percentage;
  }, 0);
  return total === 10_000 ? sorted : null;
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
  let orderAssignments: Array<{ tecnicoId: string; role: "PRIMARY" | "SUPPORT" }> = [];
  if (input.orderId !== undefined) {
    const order = await transaction.ordenTrabajo.findFirst({
      where: {
        id: input.orderId, deletedAt: null, status: { not: "CANCELLED" },
        sucursal: { isActive: true, deletedAt: null, cliente: { isActive: true, deletedAt: null } },
      },
      select: { sucursalId: true, tecnicos: { where: { unassignedAt: null }, select: { tecnicoId: true, role: true } } },
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

  const requestedTeam = actor.technicianId === null
    ? input.team ?? (orderAssignments.find(({ role }) => role === "PRIMARY")
      ? [{ technicianId: orderAssignments.find(({ role }) => role === "PRIMARY")!.tecnicoId, role: "RESPONSIBLE" as const, participationPercentage: "100.00" }]
      : [])
    : [{ technicianId: actor.technicianId, role: "RESPONSIBLE" as const, participationPercentage: "100.00" }];
  const team = validTeam(requestedTeam);
  if (!team) return invalid();
  const technicianIds = team.map(({ technicianId }) => technicianId);
  if (!(await activeTechnicians(transaction, technicianIds))) return { kind: "RESOURCE_INACTIVE" };
  if (orderId !== null && technicianIds.some((technicianId) => !orderAssignments.some((assignment) => assignment.tecnicoId === technicianId))) {
    return { kind: "TECHNICIAN_NOT_ASSIGNED_TO_ORDER" };
  }
  return { branchId, orderId, team };
}
