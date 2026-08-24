import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  lockOrdersInOrder,
  runRecurrenceSerializableTransaction,
} from "./recurrences.repository.helpers.js";
import {
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

interface RecurrenceReportRepositoryOptions {
  hooks?: {
    afterSequenceAllocated?: (context: RecurrenceReportHookContext) => Promise<void>;
    beforePairLock?: (context: RecurrenceReportHookContext) => Promise<void>;
    afterPairLock?: (context: RecurrenceReportHookContext) => Promise<void>;
    beforeDuplicateLookup?: (context: RecurrenceReportHookContext) => Promise<void>;
    afterDuplicateLookup?: (
      context: RecurrenceReportHookContext & { duplicate: boolean },
    ) => Promise<void>;
    beforeHydration?: (context: { recurrenceId: string }) => Promise<void>;
  };
}

interface RecurrenceReportHookContext {
  year: number;
  recurrenceNumber: string;
  originalOrderId: string;
  correctionOrderId: string;
}

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

function canonicalizeReportInput(input: ReportRecurrenceInput): ReportRecurrenceInput {
  return {
    ...input,
    originalOrderId: input.originalOrderId.toLowerCase(),
    correctionOrderId: input.correctionOrderId.toLowerCase(),
  };
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
  if (lastNumber > 9_999) reject("RECURRENCE_NUMBER_EXHAUSTED");
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

async function technicianCanSeeOrderPair(
  transaction: Prisma.TransactionClient,
  technicianId: string,
  originalOrderId: string,
  correctionOrderId: string,
  detectedAt: Date,
): Promise<boolean> {
  const assignments = await transaction.ordenTecnico.findMany({
    where: {
      tecnicoId: technicianId,
      ordenId: { in: [originalOrderId, correctionOrderId] },
      assignedAt: { lte: detectedAt },
    },
    select: { ordenId: true },
    distinct: ["ordenId"],
  });
  return new Set(assignments.map(({ ordenId }) => ordenId)).size === 2;
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

async function reportRecurrenceInTransaction(
  transaction: Prisma.TransactionClient,
  input: ReportRecurrenceInput,
  actor: RecurrenceActorContext,
  now: Date,
  options: RecurrenceReportRepositoryOptions,
): Promise<RecurrenceDetailRecord> {
  const year = now.getUTCFullYear();
  const recurrenceNumber = await allocateAnnualNumber(transaction, year);
  const canonicalInput = canonicalizeReportInput(input);
  const hookContext: RecurrenceReportHookContext = {
    year,
    recurrenceNumber,
    originalOrderId: canonicalInput.originalOrderId,
    correctionOrderId: canonicalInput.correctionOrderId,
  };
  await options.hooks?.afterSequenceAllocated?.(hookContext);
  await options.hooks?.beforePairLock?.(hookContext);
  await lockOrderPair(transaction, canonicalInput.originalOrderId, canonicalInput.correctionOrderId);
  await options.hooks?.afterPairLock?.(hookContext);

  const lockedOrders = await lockOrdersInOrder(transaction, [
    canonicalInput.originalOrderId,
    canonicalInput.correctionOrderId,
  ]);
  if (lockedOrders.length !== new Set([canonicalInput.originalOrderId, canonicalInput.correctionOrderId]).size) {
    reject("RECURRENCE_ORDER_NOT_FOUND");
  }
  const original = lockedOrders.find(({ id }) => id === canonicalInput.originalOrderId);
  const correction = lockedOrders.find(({ id }) => id === canonicalInput.correctionOrderId);
  if (original === undefined || correction === undefined) {
    reject("RECURRENCE_ORDER_NOT_FOUND");
  }
  if (original.deletedAt !== null || correction.deletedAt !== null) {
    reject("RECURRENCE_ORDER_NOT_FOUND");
  }
  if (canonicalInput.originalOrderId === canonicalInput.correctionOrderId) {
    reject("RECURRENCE_ORDER_MISMATCH");
  }
  const actorCanReview = actor.permissions.includes("RECURRENCES_REVIEW");
  const actorCanSeeOrders = actorCanReview || (
    actor.technicianId !== null
    && await technicianCanSeeOrderPair(
      transaction,
      actor.technicianId,
      original.id,
      correction.id,
      now,
    )
  );
  if (!actorCanSeeOrders) reject("RECURRENCE_ORDER_NOT_FOUND");

  await options.hooks?.beforeDuplicateLookup?.(hookContext);
  const duplicate = await pairHasBlockingRecurrence(transaction, canonicalInput);
  await options.hooks?.afterDuplicateLookup?.({ ...hookContext, duplicate });
  if (duplicate) reject("RECURRENCE_DUPLICATE");

  if (
    original.status !== "COMPLETED"
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
  const actorParticipates = actor.technicianId !== null
    && team.some(({ technicianId, participation }) =>
      technicianId === actor.technicianId && participation === "CORRECTION_PARTICIPANT");
  if (!actorCanReview && !actorParticipates) reject("RECURRENCE_ORDER_NOT_FOUND");

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
    select: {
      id: true,
      recurrenceNumber: true,
      status: true,
      impact: true,
      responsibility: true,
      detectedProblem: true,
      detectedAt: true,
      additionalMinutes: true,
      estimatedCost: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      analysis: true,
      correctiveAction: true,
      preventiveAction: true,
      observations: true,
      ageOverrideReason: true,
      dismissalReason: true,
      dismissedAt: true,
      closedAt: true,
    },
  });
  const visit = await transaction.reincidenciaOrden.create({
    data: {
      reincidenciaId: recurrence.id,
      ordenId: correction.id,
      visitNumber: 1,
    },
    select: {
      id: true,
      visitNumber: true,
      additionalMinutes: true,
      observation: true,
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
  await options.hooks?.beforeHydration?.({ recurrenceId: recurrence.id });
  const technicians = await transaction.tecnico.findMany({
    where: { id: { in: team.map(({ technicianId }) => technicianId) } },
    select: { id: true, code: true, fullName: true },
  });
  const techniciansById = new Map(technicians.map((technician) => [technician.id, technician]));
  if (techniciansById.size !== new Set(team.map(({ technicianId }) => technicianId)).size) {
    throw new Error("Reported recurrence technicians could not be hydrated");
  }
  return {
    ...recurrence,
    ordenOriginal: { id: original.id, orderNumber: original.orderNumber },
    causa: null,
    _count: { ordenes: 1, notas: 0 },
    ordenes: [{
      ...visit,
      orden: { id: correction.id, orderNumber: correction.orderNumber },
    }],
    tecnicos: team.map(({ technicianId, participation }) => ({
      participation,
      affectsQuality: false,
      justification: null,
      tecnico: techniciansById.get(technicianId)!,
    })),
    notas: [],
    evidencias: [],
  };
}

export function createRecurrencesReportRepository(
  database: PrismaClient,
  options: RecurrenceReportRepositoryOptions = {},
): RecurrencesReportRepository {
  return {
    async reportRecurrence(input, actor, now) {
      try {
        const recurrence = await runRecurrenceSerializableTransaction(
          database,
          (transaction) => reportRecurrenceInTransaction(transaction, input, actor, now, options),
        );
        return {
          kind: "CREATED",
          recurrence,
        } satisfies RecurrenceMutationResult;
      } catch (error) {
        if (error instanceof RejectedRecurrenceReport) return { kind: error.kind };
        throw error;
      }
    },
  };
}
