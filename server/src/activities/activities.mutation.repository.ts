import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { validateActivityContext } from "./activities.repository.helpers.js";
import {
  calculateActivityMinutes,
  overlapsAny,
} from "./activities.time.js";
import { activityDetailSelect } from "./activities.repository.types.js";
import type {
  ActivitiesMutationRepository,
  ActivityDetailRecord,
  ActivityMutationResult,
} from "./activities.repository.types.js";
import type {
  ActivityActorContext,
  CreateActivityInput,
  ManualActivityInput,
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
  action:
    | "ACTIVITY_CREATED"
    | "ACTIVITY_UPDATED"
    | "ACTIVITY_TEAM_UPDATED"
    | "ACTIVITY_MANUAL_RECORDED",
  activity: ActivityDetailRecord,
  actor: ActivityActorContext,
  now: Date,
  before?: ActivityDetailRecord,
  reason?: string,
): Promise<void> {
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action,
      entity: "Actividad",
      entityId: activity.id,
      ...(before !== undefined && { beforeData: auditSnapshot(before) }),
      afterData: auditSnapshot(activity),
      ...(reason !== undefined && { reason }),
      occurredAt: now,
      requestId: actor.requestId,
    },
  });
}

export function planTechnicianLockIds(technicianIds: readonly string[]): string[] {
  return [...new Set(technicianIds)].sort((left, right) => left.localeCompare(right));
}

async function lockTechnicians(
  transaction: Prisma.TransactionClient,
  technicianIds: readonly string[],
): Promise<void> {
  for (const technicianId of planTechnicianLockIds(technicianIds)) {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${technicianId}))`;
  }
}

async function findProductiveSegments(
  transaction: Prisma.TransactionClient,
  technicianId: string,
  range: { startedAt: Date; endedAt: Date },
  excludeActivityId?: string,
): Promise<Array<{ startedAt: Date; endedAt: Date }>> {
  const memberships = await transaction.actividadTecnico.findMany({
    where: {
      tecnicoId: technicianId,
      actividad: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        startedAt: { lt: range.endedAt },
        endedAt: { gt: range.startedAt },
        ...(excludeActivityId !== undefined && { id: { not: excludeActivityId } }),
      },
    },
    select: {
      actividad: {
        select: {
          startedAt: true,
          endedAt: true,
          pausas: {
            where: { endedAt: { not: null } },
            select: { startedAt: true, endedAt: true },
          },
        },
      },
    },
  });
  return memberships.flatMap(({ actividad }) => {
    if (actividad.startedAt === null || actividad.endedAt === null) return [];
    return calculateActivityMinutes(
      actividad.startedAt,
      actividad.endedAt,
      actividad.pausas.flatMap((pause) => pause.endedAt === null ? [] : [{
        startedAt: pause.startedAt,
        endedAt: pause.endedAt,
      }]),
    ).productiveSegments;
  });
}

function validManualRange(input: ManualActivityInput, now: Date): boolean {
  const startedAt = input.startedAt.getTime();
  const endedAt = input.endedAt.getTime();
  const maximumDuration = 24 * 60 * 60 * 1_000;
  return Number.isFinite(startedAt)
    && Number.isFinite(endedAt)
    && startedAt < endedAt
    && endedAt <= now.getTime()
    && startedAt <= now.getTime()
    && endedAt - startedAt >= 60_000
    && endedAt - startedAt <= maximumDuration;
}

async function createManualActivity(
  transaction: Prisma.TransactionClient,
  input: ManualActivityInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  if (!validManualRange(input, now)) return { kind: "INVALID_TEMPORAL_RANGE" };
  const initialContext = await validateActivityContext(transaction, input, actor);
  if ("kind" in initialContext) return initialContext;
  await lockTechnicians(transaction, initialContext.team.map(({ technicianId }) => technicianId));
  const context = await validateActivityContext(transaction, input, actor);
  if ("kind" in context) return context;
  const range = { startedAt: input.startedAt, endedAt: input.endedAt };
  for (const { technicianId } of context.team) {
    const activeTimer = await transaction.actividadTecnico.findFirst({
      where: {
        tecnicoId: technicianId,
        actividad: { deletedAt: null, status: "IN_PROGRESS" },
      },
      select: { id: true },
    });
    if (activeTimer) return { kind: "ACTIVE_TIMER_EXISTS" };
    if (overlapsAny(range, await findProductiveSegments(transaction, technicianId, range))) {
      return { kind: "TIME_OVERLAP" };
    }
  }
  const minutes = calculateActivityMinutes(input.startedAt, input.endedAt, []);
  const activity = await transaction.actividad.create({
    data: {
      sucursalId: context.branchId,
      ordenId: context.orderId,
      tipoActividadId: input.activityTypeId,
      status: "COMPLETED",
      description: input.description,
      ...(input.observations !== undefined && { observations: input.observations }),
      result: input.result,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      pausedMinutes: minutes.pausedMinutes,
      productiveMinutes: minutes.productiveMinutes,
      createdAt: now,
      updatedAt: now,
      version: 1,
      tecnicos: {
        create: context.team.map((member) => ({
          tecnicoId: member.technicianId,
          role: member.role,
          participationPercentage: member.participationPercentage,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
        })),
      },
    },
    select: { id: true },
  });
  const detail = await loadActivity(transaction, activity.id);
  if (!detail) throw new Error("Created manual activity could not be hydrated");
  await writeAudit(
    transaction,
    "ACTIVITY_MANUAL_RECORDED",
    detail,
    actor,
    now,
    undefined,
    input.justification,
  );
  return { kind: "CREATED", activity: detail };
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
): ActivitiesMutationRepository {
  return {
    createActivity: (input, actor, now) => runSerializableTransaction(
      database,
      (transaction) => createActivity(transaction, input, actor, now),
    ),
    createManualActivity: (input, actor, now) => runSerializableTransaction(
      database,
      (transaction) => createManualActivity(transaction, input, actor, now),
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
