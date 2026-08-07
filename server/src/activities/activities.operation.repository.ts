import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  ActivitiesOperationRepository,
  ActivityDetailRecord,
  ActivityMutationResult,
} from "./activities.repository.types.js";
import {
  loadActivity,
  lockTechnicians,
  runSerializableTransaction,
  writeActivityAudit,
} from "./activities.mutation.repository.js";
import {
  validateActivityTeam,
  validateCompletedAdjustmentContext,
} from "./activities.repository.helpers.js";
import { transitionActivity } from "./activities.state-machine.js";
import { calculateActivityMinutes, overlapsAny } from "./activities.time.js";
import type {
  ActivityActorContext,
  ActivityCommand,
  ActivityVersionInput,
  CompleteActivityInput,
  CancelActivityInput,
  PauseActivityInput,
  AdjustActivityInput,
} from "./activities.types.js";

interface OperationalActivity {
  activity: ActivityDetailRecord;
  technicianIds: string[];
}

async function lockActivity(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<boolean> {
  const locked = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM actividad WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE
  `;
  return locked.length === 1;
}

function hasValidTeam(activity: ActivityDetailRecord): boolean {
  return validateActivityTeam(activity.tecnicos.map(({ tecnico, role, participationPercentage }) => ({
    technicianId: tecnico.id,
    role,
    participationPercentage: participationPercentage.toFixed(2),
  }))) !== null;
}

function actorCanOperate(activity: ActivityDetailRecord, actor: ActivityActorContext): boolean {
  return actor.permissions.includes("ACTIVITIES_MANAGE")
    || (actor.technicianId !== null && activity.tecnicos.some(({ role, tecnico }) => (
      role === "RESPONSIBLE" && tecnico.id === actor.technicianId
    )));
}

async function loadOperationalActivity(
  transaction: Prisma.TransactionClient,
  id: string,
  actor: ActivityActorContext,
): Promise<OperationalActivity | { kind: "ACTIVITY_NOT_FOUND" | "INVALID_PARTICIPATION_TOTAL" | "FORBIDDEN" }> {
  if (!(await lockActivity(transaction, id))) return { kind: "ACTIVITY_NOT_FOUND" };
  const initial = await loadActivity(transaction, id);
  if (!initial) return { kind: "ACTIVITY_NOT_FOUND" };
  const initialTechnicianIds = initial.tecnicos.map(({ tecnico }) => tecnico.id);
  if (!hasValidTeam(initial)) return { kind: "INVALID_PARTICIPATION_TOTAL" };
  await lockTechnicians(transaction, initialTechnicianIds);
  const activity = await loadActivity(transaction, id);
  if (!activity) return { kind: "ACTIVITY_NOT_FOUND" };
  if (!hasValidTeam(activity)) return { kind: "INVALID_PARTICIPATION_TOTAL" };
  if (!actorCanOperate(activity, actor)) return { kind: "FORBIDDEN" };
  return { activity, technicianIds: activity.tecnicos.map(({ tecnico }) => tecnico.id) };
}

async function hasOtherActiveTimer(
  transaction: Prisma.TransactionClient,
  activityId: string,
  technicianIds: readonly string[],
): Promise<boolean> {
  return (await transaction.actividadTecnico.findFirst({
    where: {
      tecnicoId: { in: [...technicianIds] },
      actividadId: { not: activityId },
      actividad: { deletedAt: null, status: "IN_PROGRESS" },
    },
    select: { id: true },
  })) !== null;
}

async function transitionTimer(
  transaction: Prisma.TransactionClient,
  id: string,
  input: ActivityVersionInput,
  actor: ActivityActorContext,
  now: Date,
  command: Extract<ActivityCommand, "START" | "RESUME">,
): Promise<ActivityMutationResult> {
  const loaded = await loadOperationalActivity(transaction, id, actor);
  if ("kind" in loaded) return loaded;
  const { activity, technicianIds } = loaded;
  const nextStatus = transitionActivity(activity.status, command);
  if (!nextStatus) return { kind: "INVALID_ACTIVITY_STATE" };
  if (activity.version !== input.version) return { kind: "VERSION_CONFLICT" };
  if (await hasOtherActiveTimer(transaction, id, technicianIds)) return { kind: "ACTIVE_TIMER_EXISTS" };
  if (command === "RESUME") {
    const pauses = await transaction.pausaActividad.findMany({
      where: { actividadId: id, endedAt: null }, select: { id: true }, orderBy: { startedAt: "asc" },
    });
    if (pauses.length !== 1) return { kind: "INVALID_ACTIVITY_STATE" };
    await transaction.pausaActividad.update({ where: { id: pauses[0]!.id }, data: { endedAt: now } });
  }

  const changed = await transaction.actividad.updateMany({
    where: { id, deletedAt: null, status: activity.status, version: input.version },
    data: {
      status: nextStatus,
      ...(command === "START" && { startedAt: now }),
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  if (command === "START") {
    await transaction.actividadTecnico.updateMany({
      where: { actividadId: id }, data: { startedAt: now, endedAt: null },
    });
  }
  const detail = await loadActivity(transaction, id);
  if (!detail) throw new Error("Operated activity could not be hydrated");
  await writeActivityAudit(
    transaction,
    command === "START" ? "ACTIVITY_STARTED" : "ACTIVITY_RESUMED",
    detail,
    actor,
    now,
    activity,
  );
  return { kind: "UPDATED", activity: detail };
}

async function pauseTimer(
  transaction: Prisma.TransactionClient,
  id: string,
  input: PauseActivityInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  const loaded = await loadOperationalActivity(transaction, id, actor);
  if ("kind" in loaded) return loaded;
  const { activity } = loaded;
  const nextStatus = transitionActivity(activity.status, "PAUSE");
  if (!nextStatus) return { kind: "INVALID_ACTIVITY_STATE" };
  if (activity.version !== input.version) return { kind: "VERSION_CONFLICT" };
  const changed = await transaction.actividad.updateMany({
    where: { id, deletedAt: null, status: activity.status, version: input.version },
    data: { status: nextStatus, updatedAt: now, version: { increment: 1 } },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  await transaction.pausaActividad.create({
    data: { actividadId: id, startedAt: now, reason: input.reason, userId: actor.userId, createdAt: now },
  });
  const detail = await loadActivity(transaction, id);
  if (!detail) throw new Error("Paused activity could not be hydrated");
  await writeActivityAudit(transaction, "ACTIVITY_PAUSED", detail, actor, now, activity, input.reason);
  return { kind: "UPDATED", activity: detail };
}

async function completeActivity(
  transaction: Prisma.TransactionClient,
  id: string,
  input: CompleteActivityInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  const loaded = await loadOperationalActivity(transaction, id, actor);
  if ("kind" in loaded) return loaded;
  const { activity } = loaded;
  const nextStatus = transitionActivity(activity.status, "COMPLETE");
  if (!nextStatus) return { kind: "INVALID_ACTIVITY_STATE" };
  if (activity.version !== input.version) return { kind: "VERSION_CONFLICT" };

  const pauses = await transaction.pausaActividad.findMany({
    where: { actividadId: id },
    select: { startedAt: true, endedAt: true },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
  });
  if (pauses.some((pause) => pause.endedAt === null)) return { kind: "INVALID_ACTIVITY_STATE" };
  if (activity.startedAt === null) return { kind: "INVALID_ACTIVITY_STATE" };
  const minutes = calculateActivityMinutes(
    activity.startedAt,
    now,
    pauses.map((pause) => ({ startedAt: pause.startedAt, endedAt: pause.endedAt! })),
  );

  const changed = await transaction.actividad.updateMany({
    where: { id, deletedAt: null, status: activity.status, version: input.version },
    data: {
      status: nextStatus,
      result: input.result,
      ...(input.observations !== undefined && { observations: input.observations }),
      endedAt: now,
      pausedMinutes: minutes.pausedMinutes,
      productiveMinutes: minutes.productiveMinutes,
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  await transaction.actividadTecnico.updateMany({ where: { actividadId: id }, data: { endedAt: now } });
  const detail = await loadActivity(transaction, id);
  if (!detail) throw new Error("Completed activity could not be hydrated");
  await writeActivityAudit(transaction, "ACTIVITY_COMPLETED", detail, actor, now, activity);
  return { kind: "UPDATED", activity: detail };
}

function actorCanCancel(activity: ActivityDetailRecord, actor: ActivityActorContext): boolean {
  if (actor.permissions.includes("ACTIVITIES_MANAGE")) return true;
  return activity.status === "PENDING"
    && actor.technicianId !== null
    && activity.tecnicos.some(({ role, tecnico }) => role === "RESPONSIBLE" && tecnico.id === actor.technicianId);
}

async function cancelActivity(
  transaction: Prisma.TransactionClient,
  id: string,
  input: CancelActivityInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  const loaded = await loadOperationalActivity(transaction, id, actor);
  if ("kind" in loaded) return loaded;
  const { activity } = loaded;
  const nextStatus = transitionActivity(activity.status, "CANCEL");
  if (!nextStatus) return { kind: "INVALID_ACTIVITY_STATE" };
  if (!actorCanCancel(activity, actor)) return { kind: "FORBIDDEN" };
  if (activity.version !== input.version) return { kind: "VERSION_CONFLICT" };

  const changed = await transaction.actividad.updateMany({
    where: { id, deletedAt: null, status: activity.status, version: input.version },
    data: { status: nextStatus, productiveMinutes: null, updatedAt: now, version: { increment: 1 } },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  await transaction.pausaActividad.updateMany({ where: { actividadId: id, endedAt: null }, data: { endedAt: now } });
  const detail = await loadActivity(transaction, id);
  if (!detail) throw new Error("Cancelled activity could not be hydrated");
  await writeActivityAudit(transaction, "ACTIVITY_CANCELLED", detail, actor, now, activity, input.reason);
  return { kind: "UPDATED", activity: detail };
}

interface ActivityAdjustmentSnapshot {
  activityTypeId: string;
  description: string;
  observations: string | null;
  result: string | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  team: Array<{
    technicianId: string;
    role: "RESPONSIBLE" | "PARTICIPANT";
    participationPercentage: string;
  }>;
}

function adjustmentSnapshot(activity: ActivityDetailRecord): ActivityAdjustmentSnapshot {
  return {
    activityTypeId: activity.tipoActividad.id,
    description: activity.description,
    observations: activity.observations,
    result: activity.result,
    startedAt: activity.startedAt?.toISOString() ?? null,
    endedAt: activity.endedAt?.toISOString() ?? null,
    pausedMinutes: activity.pausedMinutes,
    productiveMinutes: activity.productiveMinutes,
    team: activity.tecnicos.map(({ tecnico, role, participationPercentage }) => ({
      technicianId: tecnico.id,
      role,
      participationPercentage: participationPercentage.toFixed(2),
    })),
  };
}

const adjustmentFields = [
  "activityTypeId",
  "description",
  "observations",
  "result",
  "startedAt",
  "endedAt",
  "team",
] as const;

function changedAdjustmentFields(
  before: ActivityAdjustmentSnapshot,
  after: ActivityAdjustmentSnapshot,
): string[] {
  return adjustmentFields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function isValidCompletedRange(startedAt: Date, endedAt: Date, now: Date): boolean {
  return Number.isFinite(startedAt.getTime())
    && Number.isFinite(endedAt.getTime())
    && startedAt.getTime() < endedAt.getTime()
    && startedAt.getTime() <= now.getTime()
    && endedAt.getTime() <= now.getTime();
}

async function adjustmentOverlaps(
  transaction: Prisma.TransactionClient,
  activityId: string,
  technicianIds: readonly string[],
  productiveSegments: ReturnType<typeof calculateActivityMinutes>["productiveSegments"],
): Promise<boolean> {
  for (const technicianId of technicianIds) {
    for (const segment of productiveSegments) {
      if (overlapsAny(segment, await findOtherProductiveSegments(transaction, technicianId, segment, activityId))) {
        return true;
      }
    }
  }
  return false;
}

async function findOtherProductiveSegments(
  transaction: Prisma.TransactionClient,
  technicianId: string,
  range: { startedAt: Date; endedAt: Date },
  activityId: string,
): Promise<Array<{ startedAt: Date; endedAt: Date }>> {
  const memberships = await transaction.actividadTecnico.findMany({
    where: {
      tecnicoId: technicianId,
      actividad: {
        id: { not: activityId },
        deletedAt: null,
        status: { not: "CANCELLED" },
        startedAt: { lt: range.endedAt },
        endedAt: { gt: range.startedAt },
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

async function writeAdjustmentAudit(
  transaction: Prisma.TransactionClient,
  activity: ActivityDetailRecord,
  actor: ActivityActorContext,
  now: Date,
  reason: string,
  changedFields: string[],
  previousVersion: number,
  version: number,
  before: ActivityAdjustmentSnapshot,
  after: ActivityAdjustmentSnapshot,
): Promise<void> {
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action: "ACTIVITY_ADJUSTED",
      entity: "Actividad",
      entityId: activity.id,
      beforeData: Prisma.DbNull,
      afterData: JSON.parse(JSON.stringify({
        reason, changedFields, previousVersion, version, before, after,
      })) as Prisma.InputJsonValue,
      reason,
      occurredAt: now,
      requestId: actor.requestId,
    },
  });
}

async function adjustCompletedActivity(
  transaction: Prisma.TransactionClient,
  id: string,
  input: AdjustActivityInput,
  actor: ActivityActorContext,
  now: Date,
): Promise<ActivityMutationResult> {
  if (!(await lockActivity(transaction, id))) return { kind: "ACTIVITY_NOT_FOUND" };
  const initial = await loadActivity(transaction, id);
  if (!initial) return { kind: "ACTIVITY_NOT_FOUND" };
  if (initial.status !== "COMPLETED") return { kind: "INVALID_ACTIVITY_STATE" };
  if (initial.version !== input.version) return { kind: "VERSION_CONFLICT" };
  if (!actor.permissions.includes("ACTIVITIES_MANAGE")) return { kind: "FORBIDDEN" };
  if (initial.startedAt === null || initial.endedAt === null) return { kind: "INVALID_TEMPORAL_RANGE" };

  const requestedTeam = input.team === undefined
    ? initial.tecnicos.map(({ tecnico, role, participationPercentage }) => ({
      technicianId: tecnico.id, role, participationPercentage: participationPercentage.toFixed(2),
    }))
    : validateActivityTeam(input.team);
  if (!requestedTeam) return { kind: "INVALID_PARTICIPATION_TOTAL" };
  await lockTechnicians(transaction, [
    ...initial.tecnicos.map(({ tecnico }) => tecnico.id),
    ...requestedTeam.map(({ technicianId }) => technicianId),
  ]);

  const beforeActivity = await loadActivity(transaction, id);
  if (!beforeActivity) return { kind: "ACTIVITY_NOT_FOUND" };
  if (beforeActivity.status !== "COMPLETED") return { kind: "INVALID_ACTIVITY_STATE" };
  if (beforeActivity.version !== input.version) return { kind: "VERSION_CONFLICT" };
  const startedAt = input.startedAt ?? beforeActivity.startedAt;
  const endedAt = input.endedAt ?? beforeActivity.endedAt;
  if (startedAt === null || endedAt === null || !isValidCompletedRange(startedAt, endedAt, now)) {
    return { kind: "INVALID_TEMPORAL_RANGE" };
  }
  const context = await validateCompletedAdjustmentContext(
    transaction, beforeActivity, input, actor, startedAt, endedAt,
  );
  if ("kind" in context) return context;
  const pauses = await transaction.pausaActividad.findMany({
    where: { actividadId: id },
    select: { startedAt: true, endedAt: true },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
  });
  if (pauses.some(({ startedAt: pauseStartedAt, endedAt: pauseEndedAt }) => (
    pauseEndedAt === null
    || pauseStartedAt.getTime() < startedAt.getTime()
    || pauseEndedAt.getTime() > endedAt.getTime()
  ))) return { kind: "INVALID_TEMPORAL_RANGE" };
  let minutes: ReturnType<typeof calculateActivityMinutes>;
  try {
    minutes = calculateActivityMinutes(
      startedAt,
      endedAt,
      pauses.map(({ startedAt: pauseStartedAt, endedAt: pauseEndedAt }) => ({ startedAt: pauseStartedAt, endedAt: pauseEndedAt! })),
    );
  } catch {
    return { kind: "INVALID_TEMPORAL_RANGE" };
  }
  if (await adjustmentOverlaps(
    transaction,
    id,
    context.team.map(({ technicianId }) => technicianId),
    minutes.productiveSegments,
  )) return { kind: "TIME_OVERLAP" };

  const changed = await transaction.actividad.updateMany({
    where: { id, deletedAt: null, status: "COMPLETED", version: input.version },
    data: {
      tipoActividadId: input.activityTypeId ?? beforeActivity.tipoActividad.id,
      description: input.description ?? beforeActivity.description,
      observations: input.observations !== undefined
        ? input.observations
        : beforeActivity.observations,
      result: input.result ?? beforeActivity.result,
      startedAt,
      endedAt,
      pausedMinutes: minutes.pausedMinutes,
      productiveMinutes: minutes.productiveMinutes,
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  if (input.team !== undefined) {
    await transaction.actividadTecnico.deleteMany({ where: { actividadId: id } });
    await transaction.actividadTecnico.createMany({
      data: context.team.map(({ technicianId, role, participationPercentage }) => ({
        actividadId: id,
        tecnicoId: technicianId,
        role,
        participationPercentage,
        startedAt,
        endedAt,
      })),
    });
  } else {
    await transaction.actividadTecnico.updateMany({ where: { actividadId: id }, data: { startedAt, endedAt } });
  }
  const activity = await loadActivity(transaction, id);
  if (!activity) throw new Error("Adjusted activity could not be hydrated");
  const before = adjustmentSnapshot(beforeActivity);
  const after = adjustmentSnapshot(activity);
  await writeAdjustmentAudit(
    transaction,
    activity,
    actor,
    now,
    input.reason,
    changedAdjustmentFields(before, after),
    beforeActivity.version,
    activity.version,
    before,
    after,
  );
  return { kind: "UPDATED", activity };
}

export function createActivitiesOperationRepository(
  database: PrismaClient,
): ActivitiesOperationRepository {
  return {
    startActivity: (id, input, actor, now) => runSerializableTransaction(
      database, (transaction) => transitionTimer(transaction, id, input, actor, now, "START"),
    ),
    pauseActivity: (id, input, actor, now) => runSerializableTransaction(
      database, (transaction) => pauseTimer(transaction, id, input, actor, now),
    ),
    resumeActivity: (id, input, actor, now) => runSerializableTransaction(
      database, (transaction) => transitionTimer(transaction, id, input, actor, now, "RESUME"),
    ),
    completeActivity: (id, input, actor, now) => runSerializableTransaction(
      database, (transaction) => completeActivity(transaction, id, input, actor, now),
    ),
    cancelActivity: (id, input, actor, now) => runSerializableTransaction(
      database, (transaction) => cancelActivity(transaction, id, input, actor, now),
    ),
    adjustCompletedActivity: (id, input, actor, now) => runSerializableTransaction(
      database, (transaction) => adjustCompletedActivity(transaction, id, input, actor, now),
    ),
  };
}
