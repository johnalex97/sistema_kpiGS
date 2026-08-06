import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  ActivitiesTimerRepository,
  ActivityDetailRecord,
  ActivityMutationResult,
} from "./activities.repository.types.js";
import {
  loadActivity,
  lockTechnicians,
  runSerializableTransaction,
  writeActivityAudit,
} from "./activities.mutation.repository.js";
import { transitionActivity } from "./activities.state-machine.js";
import type {
  ActivityActorContext,
  ActivityCommand,
  ActivityVersionInput,
  PauseActivityInput,
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
  return activity.tecnicos.length > 0
    && activity.tecnicos.filter(({ role }) => role === "RESPONSIBLE").length === 1
    && new Set(activity.tecnicos.map(({ tecnico }) => tecnico.id)).size === activity.tecnicos.length;
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

export function createActivitiesOperationRepository(
  database: PrismaClient,
): ActivitiesTimerRepository {
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
  };
}
