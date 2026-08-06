import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { validateActivityContext } from "./activities.repository.helpers.js";
import { activityDetailSelect } from "./activities.repository.types.js";
import type {
  ActivitiesPendingMutationRepository,
  ActivityDetailRecord,
  ActivityMutationResult,
} from "./activities.repository.types.js";
import type {
  ActivityActorContext,
  CreateActivityInput,
  ReplaceActivityTeamInput,
  UpdateActivityInput,
} from "./activities.types.js";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
const serializableAttempts = 3;

async function runSerializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= serializableAttempts; attempt += 1) {
    try {
      return await database.$transaction(operation, transactionOptions);
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!retryable || attempt === serializableAttempts) throw error;
    }
  }
  throw new Error("Unreachable serializable transaction state");
}

async function loadActivity(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<ActivityDetailRecord | null> {
  const record = await transaction.actividad.findFirst({
    where: { id, deletedAt: null }, select: activityDetailSelect,
  });
  return record as ActivityDetailRecord | null;
}

function auditSnapshot(activity: ActivityDetailRecord) {
  return {
    branchId: activity.sucursal.id,
    orderId: activity.orden?.id ?? null,
    activityTypeId: activity.tipoActividad.id,
    status: activity.status,
    description: activity.description,
    observations: activity.observations,
    version: activity.version,
    team: activity.tecnicos.map((member) => ({
      technicianId: member.tecnico.id,
      role: member.role,
      participationPercentage: member.participationPercentage.toFixed(2),
    })),
  };
}

async function writeAudit(
  transaction: Prisma.TransactionClient,
  action: "ACTIVITY_CREATED" | "ACTIVITY_UPDATED" | "ACTIVITY_TEAM_UPDATED",
  activity: ActivityDetailRecord,
  actor: ActivityActorContext,
  now: Date,
  before?: ActivityDetailRecord,
): Promise<void> {
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action,
      entity: "Actividad",
      entityId: activity.id,
      ...(before !== undefined && { beforeData: auditSnapshot(before) }),
      afterData: auditSnapshot(activity),
      occurredAt: now,
      requestId: actor.requestId,
    },
  });
}

async function createActivity(
  transaction: Prisma.TransactionClient,
  input: CreateActivityInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  const context = await validateActivityContext(transaction, input, actor);
  if ("kind" in context) return context;
  const activity = await transaction.actividad.create({
    data: {
      sucursalId: context.branchId,
      ordenId: context.orderId,
      tipoActividadId: input.activityTypeId,
      status: "PENDING",
      description: input.description,
      ...(input.observations !== undefined && { observations: input.observations }),
      createdAt: now,
      updatedAt: now,
      version: 1,
      tecnicos: { create: context.team.map((member) => ({
        tecnicoId: member.technicianId, role: member.role,
        participationPercentage: member.participationPercentage,
      })) },
    },
    select: { id: true },
  });
  const detail = await loadActivity(transaction, activity.id);
  if (!detail) throw new Error("Created activity could not be hydrated");
  await writeAudit(transaction, "ACTIVITY_CREATED", detail, actor, now);
  return { kind: "CREATED", activity: detail };
}

async function updateActivity(
  transaction: Prisma.TransactionClient,
  id: string,
  input: UpdateActivityInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  const before = await loadActivity(transaction, id);
  if (!before) return { kind: "ACTIVITY_NOT_FOUND" };
  if (before.status !== "PENDING") return { kind: "INVALID_ACTIVITY_STATE" };
  if (before.version !== input.version) return { kind: "VERSION_CONFLICT" };
  if (input.activityTypeId !== undefined && !(await transaction.tipoActividad.findFirst({ where: { id: input.activityTypeId, isActive: true, deletedAt: null }, select: { id: true } }))) {
    return { kind: "ACTIVITY_TYPE_NOT_FOUND" };
  }
  const changed = await transaction.actividad.updateMany({
    where: { id, version: input.version, status: "PENDING", deletedAt: null },
    data: {
      ...(input.activityTypeId !== undefined && { tipoActividadId: input.activityTypeId }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.observations !== undefined && { observations: input.observations }),
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  const detail = await loadActivity(transaction, id);
  if (!detail) throw new Error("Updated activity could not be hydrated");
  await writeAudit(transaction, "ACTIVITY_UPDATED", detail, actor, now, before);
  return { kind: "UPDATED", activity: detail };
}

async function replaceActivityTeam(
  transaction: Prisma.TransactionClient,
  id: string,
  input: ReplaceActivityTeamInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  const before = await loadActivity(transaction, id);
  if (!before) return { kind: "ACTIVITY_NOT_FOUND" };
  if (before.status !== "PENDING") return { kind: "INVALID_ACTIVITY_STATE" };
  if (before.version !== input.version) return { kind: "VERSION_CONFLICT" };
  const context = await validateActivityContext(transaction, {
    branchId: before.sucursal.id,
    ...(before.orden !== null && { orderId: before.orden.id }),
    activityTypeId: before.tipoActividad.id,
    description: before.description,
    team: input.team,
  }, actor);
  if ("kind" in context) return context;
  const changed = await transaction.actividad.updateMany({
    where: { id, version: input.version, status: "PENDING", deletedAt: null },
    data: { updatedAt: now, version: { increment: 1 } },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  await transaction.actividadTecnico.deleteMany({ where: { actividadId: id } });
  await transaction.actividadTecnico.createMany({
    data: context.team.map((member) => ({
      actividadId: id, tecnicoId: member.technicianId, role: member.role,
      participationPercentage: member.participationPercentage,
    })),
  });
  const detail = await loadActivity(transaction, id);
  if (!detail) throw new Error("Updated activity team could not be hydrated");
  await writeAudit(transaction, "ACTIVITY_TEAM_UPDATED", detail, actor, now, before);
  return { kind: "UPDATED", activity: detail };
}

export function createActivitiesMutationRepository(
  database: PrismaClient,
): ActivitiesPendingMutationRepository {
  return {
    createActivity: (input, actor, now) => runSerializableTransaction(
      database,
      (transaction) => createActivity(transaction, input, actor, now),
    ),
    updateActivity: (id, input, actor, now) => runSerializableTransaction(
      database,
      (transaction) => updateActivity(transaction, id, input, actor, now),
    ),
    replaceActivityTeam: (id, input, actor, now) => runSerializableTransaction(
      database,
      (transaction) => replaceActivityTeam(transaction, id, input, actor, now),
    ),
  };
}
