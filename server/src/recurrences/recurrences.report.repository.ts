import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  lockOrdersInOrder,
  runRecurrenceSerializableTransaction,
} from "./recurrences.repository.helpers.js";
import {
  recurrenceDetailSelect,
  type RecurrenceDetailRecord,
  type RecurrenceFailureKind,
  type RecurrenceMutationResult,
  type RecurrencesRepository,
} from "./recurrences.repository.types.js";
import type {
  RecurrenceActorContext,
  ReportRecurrenceInput,
} from "./recurrences.types.js";

type RecurrencesReportRepository = Pick<RecurrencesRepository, "reportRecurrence">;

const pairLockNamespace = 1_382_541_665;
const blockingStatuses = ["OPEN", "ANALYSIS", "CORRECTION"] as const;

class RejectedRecurrenceReport extends Error {
  constructor(readonly kind: RecurrenceFailureKind) {
    super(kind);
  }
}

function reject(kind: RecurrenceFailureKind): never {
  throw new RejectedRecurrenceReport(kind);
}

async function allocateAnnualNumber(
  transaction: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const rows = await transaction.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "secuencia_reincidencia" ("year", "last_number")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE
      SET "last_number" = "secuencia_reincidencia"."last_number" + 1
    RETURNING "last_number" AS "lastNumber"
  `;
  const lastNumber = rows[0]?.lastNumber;
  if (lastNumber === undefined) throw new Error("Annual recurrence number was not allocated");
  return `RI-${year}-${String(lastNumber).padStart(4, "0")}`;
}

async function lockOrderPair(
  transaction: Prisma.TransactionClient,
  originalOrderId: string,
  correctionOrderId: string,
): Promise<void> {
  const pairKey = [originalOrderId, correctionOrderId]
    .sort((left, right) => left.localeCompare(right))
    .join(":");
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(${pairLockNamespace}, hashtext(${pairKey}))
  `;
}

async function pairHasBlockingRecurrence(
  transaction: Prisma.TransactionClient,
  input: ReportRecurrenceInput,
): Promise<boolean> {
  const duplicate = await transaction.reincidencia.findFirst({
    where: {
      originalOrderId: input.originalOrderId,
      status: { in: [...blockingStatuses] },
      ordenes: { some: { ordenId: input.correctionOrderId } },
    },
    select: { id: true },
  });
  return duplicate !== null;
}

interface SnapshotMember {
  technicianId: string;
  participation:
    | "ORIGINAL_RESPONSIBLE"
    | "ORIGINAL_PARTICIPANT"
    | "CORRECTION_PARTICIPANT";
}

async function buildTeamSnapshot(
  transaction: Prisma.TransactionClient,
  originalOrderId: string,
  correctionOrderId: string,
  originalEndedAt: Date,
  detectedAt: Date,
): Promise<SnapshotMember[] | null> {
  const originalAssignments = await transaction.ordenTecnico.findMany({
    where: { ordenId: originalOrderId, assignedAt: { lte: originalEndedAt } },
    select: {
      id: true,
      tecnicoId: true,
      role: true,
      assignedAt: true,
      unassignedAt: true,
    },
    orderBy: [{ assignedAt: "desc" }, { id: "asc" }],
  });
  const principal = originalAssignments.find(({ role, assignedAt, unassignedAt }) =>
    role === "PRIMARY"
    && assignedAt.getTime() <= originalEndedAt.getTime()
    && (unassignedAt === null || unassignedAt.getTime() >= originalEndedAt.getTime()));
  if (principal === undefined) return null;

  const originalTechnicianIds = new Set(
    originalAssignments.map(({ tecnicoId }) => tecnicoId),
  );
  originalTechnicianIds.delete(principal.tecnicoId);
  const correctionAssignments = await transaction.ordenTecnico.findMany({
    where: { ordenId: correctionOrderId, assignedAt: { lte: detectedAt } },
    select: { tecnicoId: true },
    orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
  });
  const correctionTechnicianIds = new Set(
    correctionAssignments.map(({ tecnicoId }) => tecnicoId),
  );

  return [
    { technicianId: principal.tecnicoId, participation: "ORIGINAL_RESPONSIBLE" as const },
    ...[...originalTechnicianIds].map((technicianId) => ({
      technicianId,
      participation: "ORIGINAL_PARTICIPANT" as const,
    })),
    ...[...correctionTechnicianIds].map((technicianId) => ({
      technicianId,
      participation: "CORRECTION_PARTICIPANT" as const,
    })),
  ].sort((left, right) =>
    left.technicianId.localeCompare(right.technicianId)
    || left.participation.localeCompare(right.participation));
}

function normalizeCreatedRecurrence(
  recurrence: RecurrenceDetailRecord,
): RecurrenceDetailRecord {
  const detail = recurrence;
  detail.ordenes.sort((left, right) => left.visitNumber - right.visitNumber || left.id.localeCompare(right.id));
  detail.tecnicos.sort((left, right) =>
    left.tecnico.id.localeCompare(right.tecnico.id)
    || left.participation.localeCompare(right.participation));
  return detail;
}

async function reportRecurrenceInTransaction(
  transaction: Prisma.TransactionClient,
  input: ReportRecurrenceInput,
  actor: RecurrenceActorContext,
  now: Date,
): Promise<string> {
  const recurrenceNumber = await allocateAnnualNumber(transaction, now.getUTCFullYear());
  await lockOrderPair(transaction, input.originalOrderId, input.correctionOrderId);
  if (await pairHasBlockingRecurrence(transaction, input)) reject("RECURRENCE_DUPLICATE");

  const lockedOrders = await lockOrdersInOrder(transaction, [
    input.originalOrderId,
    input.correctionOrderId,
  ]);
  if (lockedOrders.length !== new Set([input.originalOrderId, input.correctionOrderId]).size) {
    reject("RECURRENCE_ORDER_NOT_FOUND");
  }
  const original = lockedOrders.find(({ id }) => id === input.originalOrderId);
  const correction = lockedOrders.find(({ id }) => id === input.correctionOrderId);
  if (
    input.originalOrderId === input.correctionOrderId
    || original === undefined
    || correction === undefined
    || original.deletedAt !== null
    || correction.deletedAt !== null
    || original.status !== "COMPLETED"
    || original.endedAt === null
    || correction.status === "CANCELLED"
    || original.branchId !== correction.branchId
  ) {
    reject("RECURRENCE_ORDER_MISMATCH");
  }

  const team = await buildTeamSnapshot(
    transaction,
    original.id,
    correction.id,
    original.endedAt,
    now,
  );
  if (team === null) reject("RECURRENCE_ORDER_MISMATCH");
  const actorCanReview = actor.permissions.includes("RECURRENCES_REVIEW");
  const actorParticipates = actor.technicianId !== null
    && team.some(({ technicianId, participation }) =>
      technicianId === actor.technicianId && participation === "CORRECTION_PARTICIPANT");
  if (!actorCanReview && !actorParticipates) reject("RECURRENCE_ORDER_MISMATCH");

  const recurrence = await transaction.reincidencia.create({
    data: {
      recurrenceNumber,
      originalOrderId: original.id,
      reportedById: actor.userId,
      status: "OPEN",
      detectedProblem: input.detectedProblem,
      detectedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  await transaction.reincidenciaOrden.create({
    data: {
      reincidenciaId: recurrence.id,
      ordenId: correction.id,
      visitNumber: 1,
    },
  });
  for (const { technicianId, participation } of team) {
    await transaction.reincidenciaTecnico.create({
      data: {
        reincidenciaId: recurrence.id,
        tecnicoId: technicianId,
        participation,
      },
    });
  }
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action: "RECURRENCE_REPORTED",
      entity: "Reincidencia",
      entityId: recurrence.id,
      beforeData: Prisma.DbNull,
      afterData: JSON.parse(JSON.stringify({
        recurrenceNumber,
        status: "OPEN",
        originalOrderId: original.id,
        correctionOrderId: correction.id,
        detectedProblem: input.detectedProblem,
        detectedAt: now.toISOString(),
        visitNumber: 1,
        team,
      })) as Prisma.InputJsonValue,
      occurredAt: now,
      requestId: actor.requestId,
    },
  });
  return recurrence.id;
}

export function createRecurrencesReportRepository(
  database: PrismaClient,
): RecurrencesReportRepository {
  return {
    async reportRecurrence(input, actor, now) {
      try {
        const recurrenceId = await runRecurrenceSerializableTransaction(
          database,
          (transaction) => reportRecurrenceInTransaction(transaction, input, actor, now),
        );
        const recurrence = await database.reincidencia.findUnique({
          where: { id: recurrenceId },
          select: recurrenceDetailSelect,
        });
        if (recurrence === null) throw new Error("Reported recurrence could not be hydrated");
        return {
          kind: "CREATED",
          recurrence: normalizeCreatedRecurrence(recurrence as RecurrenceDetailRecord),
        } satisfies RecurrenceMutationResult;
      } catch (error) {
        if (error instanceof RejectedRecurrenceReport) return { kind: error.kind };
        throw error;
      }
    },
  };
}
