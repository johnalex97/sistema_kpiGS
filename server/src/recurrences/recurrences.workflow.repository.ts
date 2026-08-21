import { Prisma } from "../../generated/prisma/client.js";
import type {
  EstadoReincidencia,
  ParticipacionReincidencia,
  PrismaClient,
} from "../../generated/prisma/client.js";
import {
  requiresPreventiveAction,
  sumUniqueProductiveMinutes,
  validateQualityDecisions,
} from "./recurrences.calculations.js";
import {
  lockOrdersInOrder,
  lockRecurrence,
  runRecurrenceSerializableTransaction,
} from "./recurrences.repository.helpers.js";
import {
  type RecurrenceDetailRecord,
  type RecurrenceFailureKind,
  type RecurrenceMutationResult,
  type RecurrencesRepository,
} from "./recurrences.repository.types.js";
import type {
  AddRecurrenceNoteInput,
  AddRecurrenceVisitInput,
  AdjustRecurrenceInput,
  AnalyzeRecurrenceInput,
  CloseRecurrenceInput,
  CorrectRecurrenceInput,
  DismissRecurrenceInput,
  QualityDecisionInput,
  RecurrenceActorContext,
} from "./recurrences.types.js";

type RecurrencesWorkflowRepository = Pick<
  RecurrencesRepository,
  | "analyzeRecurrence"
  | "correctRecurrence"
  | "addVisit"
  | "addNote"
  | "dismissRecurrence"
  | "closeRecurrence"
  | "adjustClosedRecurrence"
>;

interface VisitRelationHookContext {
  recurrenceId: string;
  originalOrderId: string | null;
  orderIds: readonly string[];
  proposedOrderId: string;
}

interface TerminalLockHookContext {
  recurrenceId: string;
  orderIds: readonly string[];
  backendPid: number;
}

export interface RecurrencesWorkflowRepositoryOptions {
  hooks?: {
    afterVisitRelationsRead?: (context: VisitRelationHookContext) => Promise<void>;
    afterCloseOrdersLocked?: (context: TerminalLockHookContext) => Promise<void>;
    afterCloseRecurrenceLocked?: (context: TerminalLockHookContext) => Promise<void>;
  };
}

interface LockedCause {
  id: string;
  isActive: boolean;
  deletedAt: Date | null;
}

interface LockedUser {
  id: string;
  status: string;
  deletedAt: Date | null;
}

interface OriginalSnapshot {
  technicianId: string;
  participation: Exclude<ParticipacionReincidencia, "CORRECTION_PARTICIPANT">;
  affectsQuality: boolean;
  justification: string | null;
}

interface PreliminaryVisitRelations {
  originalOrderId: string | null;
  orderIds: string[];
}

interface PreliminaryTerminalRelations {
  orderIds: string[];
}

interface LockedActivity {
  id: string;
  orderId: string;
  productiveMinutes: number;
}

interface VisitMinuteSnapshot {
  visitId: string;
  orderId: string;
  visitNumber: number;
  additionalMinutes: number;
}

interface QualitySnapshot {
  technicianId: string;
  participation: ParticipacionReincidencia;
  affectsQuality: boolean;
  justification: string | null;
}

const mutableStatuses = ["OPEN", "ANALYSIS", "CORRECTION"] as const;
const maximumRelationAttempts = 3;

class RejectedRecurrenceWorkflow extends Error {
  constructor(readonly kind: RecurrenceFailureKind) {
    super(kind);
  }
}

class VisitRelationsChanged extends Error {}
class TerminalRelationsChanged extends Error {}

function reject(kind: RecurrenceFailureKind): never {
  throw new RejectedRecurrenceWorkflow(kind);
}

function canonicalUuid(id: string): string {
  return id.toLowerCase();
}

function canonicalIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map(canonicalUuid))]
    .sort((left, right) => left.localeCompare(right));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const canonicalLeft = canonicalIds(left);
  const canonicalRight = canonicalIds(right);
  return canonicalLeft.length === canonicalRight.length
    && canonicalLeft.every((id, index) => id === canonicalRight[index]);
}

function asJson(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizedOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizedNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validReason(value: string): string | null {
  const reason = value.trim();
  return reason.length >= 10 && reason.length <= 500 ? reason : null;
}

function pairedCostIsInvalid(input: { estimatedCost?: string; costReason?: string }): boolean {
  const hasCost = input.estimatedCost !== undefined;
  const hasReason = normalizedOptional(input.costReason) !== null;
  return hasCost !== hasReason;
}

function isValidCost(value: string): boolean {
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value.trim());
}

function canReview(actor: RecurrenceActorContext): boolean {
  return actor.permissions.includes("RECURRENCES_REVIEW");
}

async function lockCause(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<LockedCause | null> {
  const rows = await transaction.$queryRaw<LockedCause[]>`
    SELECT "id", "is_active" AS "isActive", "deleted_at" AS "deletedAt"
    FROM "causa_reincidencia"
    WHERE "id" = ${canonicalUuid(id)}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockUser(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<LockedUser | null> {
  const rows = await transaction.$queryRaw<LockedUser[]>`
    SELECT "id", "status"::text AS "status", "deleted_at" AS "deletedAt"
    FROM "usuario"
    WHERE "id" = ${canonicalUuid(id)}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

function userIsActive(user: LockedUser | null): user is LockedUser {
  return user !== null && user.deletedAt === null && user.status.toUpperCase() === "ACTIVE";
}

async function loadDetail(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<RecurrenceDetailRecord> {
  const record = await transaction.reincidencia.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      recurrenceNumber: true,
      originalOrderId: true,
      causeId: true,
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
  const originalOrder = await transaction.ordenTrabajo.findUniqueOrThrow({
    where: { id: record.originalOrderId },
    select: { id: true, orderNumber: true },
  });
  const cause = record.causeId === null
    ? null
    : await transaction.causaReincidencia.findUniqueOrThrow({
      where: { id: record.causeId },
      select: { id: true, code: true, name: true },
    });
  const visitRows = await transaction.reincidenciaOrden.findMany({
    where: { reincidenciaId: id },
    select: { id: true, ordenId: true, visitNumber: true, additionalMinutes: true, observation: true },
    orderBy: [{ visitNumber: "asc" }, { id: "asc" }],
  });
  const visitOrders = await transaction.ordenTrabajo.findMany({
    where: { id: { in: visitRows.map(({ ordenId }) => ordenId) } },
    select: { id: true, orderNumber: true },
  });
  const visitOrdersById = new Map(visitOrders.map((order) => [order.id, order]));
  const snapshotRows = await transaction.reincidenciaTecnico.findMany({
    where: { reincidenciaId: id },
    select: { tecnicoId: true, participation: true, affectsQuality: true, justification: true },
    orderBy: [{ tecnicoId: "asc" }, { participation: "asc" }],
  });
  const technicians = await transaction.tecnico.findMany({
    where: { id: { in: canonicalIds(snapshotRows.map(({ tecnicoId }) => tecnicoId)) } },
    select: { id: true, code: true, fullName: true },
  });
  const techniciansById = new Map(technicians.map((technician) => [technician.id, technician]));
  const noteRows = await transaction.reincidenciaNota.findMany({
    where: { reincidenciaId: id },
    select: { id: true, authorId: true, content: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const authors = await transaction.usuario.findMany({
    where: { id: { in: canonicalIds(noteRows.map(({ authorId }) => authorId)) } },
    select: { id: true, displayName: true },
  });
  const authorsById = new Map(authors.map((author) => [author.id, author]));
  const evidences = await transaction.evidencia.findMany({
    where: { reincidenciaId: id, deletedAt: null },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true, accessLevel: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const noteCount = await transaction.reincidenciaNota.count({ where: { reincidenciaId: id } });
  const { originalOrderId, causeId, ...detailRecord } = record;
  void originalOrderId;
  void causeId;
  return {
    ...detailRecord,
    ordenOriginal: originalOrder,
    causa: cause,
    _count: { ordenes: visitRows.length, notas: noteCount },
    ordenes: visitRows.map(({ ordenId, ...visit }) => ({
      ...visit,
      orden: visitOrdersById.get(ordenId)!,
    })),
    tecnicos: snapshotRows.map(({ tecnicoId, ...snapshot }) => ({
      ...snapshot,
      tecnico: techniciansById.get(tecnicoId)!,
    })),
    notas: noteRows.map(({ authorId, ...note }) => ({
      ...note,
      author: authorsById.get(authorId)!,
    })),
    evidencias: evidences,
  };
}

function originalSnapshots(
  rows: readonly {
    tecnicoId: string;
    participation: ParticipacionReincidencia;
    affectsQuality: boolean;
    justification: string | null;
  }[],
): OriginalSnapshot[] {
  return rows
    .filter((row): row is typeof row & { participation: OriginalSnapshot["participation"] } =>
      row.participation !== "CORRECTION_PARTICIPANT")
    .map((row) => ({
      technicianId: row.tecnicoId,
      participation: row.participation,
      affectsQuality: row.affectsQuality,
      justification: row.justification,
    }))
    .sort((left, right) =>
      left.technicianId.localeCompare(right.technicianId)
      || left.participation.localeCompare(right.participation));
}

function qualitySnapshots(rows: readonly QualitySnapshot[]): QualitySnapshot[] {
  return rows.map((row) => ({
    technicianId: row.technicianId,
    participation: row.participation,
    affectsQuality: row.affectsQuality,
    justification: row.justification,
  })).sort((left, right) =>
    left.technicianId.localeCompare(right.technicianId)
    || left.participation.localeCompare(right.participation));
}

async function lockActiveRecurrenceEvidence(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
): Promise<string[]> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "evidencia"
    WHERE "reincidencia_id" = ${recurrenceId}::uuid
      AND "deleted_at" IS NULL
    ORDER BY "id" ASC
    FOR UPDATE
  `;
  return rows.map(({ id }) => id);
}

async function lockCompletedActivities(
  transaction: Prisma.TransactionClient,
  orderIds: readonly string[],
): Promise<LockedActivity[]> {
  const activities: LockedActivity[] = [];
  for (const orderId of canonicalIds(orderIds)) {
    const rows = await transaction.$queryRaw<LockedActivity[]>`
      SELECT
        "id",
        "orden_id" AS "orderId",
        "productive_minutes" AS "productiveMinutes"
      FROM "actividad"
      WHERE "orden_id" = ${orderId}::uuid
        AND UPPER("status"::text) = 'COMPLETED'
        AND "deleted_at" IS NULL
      ORDER BY "id" ASC
      FOR UPDATE
    `;
    activities.push(...rows);
  }
  return activities;
}

async function runTerminalLockHook(
  transaction: Prisma.TransactionClient,
  hook: ((context: TerminalLockHookContext) => Promise<void>) | undefined,
  recurrenceId: string,
  orderIds: readonly string[],
): Promise<void> {
  if (hook === undefined) return;
  const rows = await transaction.$queryRaw<Array<{ backendPid: number }>>`
    SELECT pg_backend_pid()::int AS "backendPid"
  `;
  await hook({ recurrenceId, orderIds, backendPid: rows[0]!.backendPid });
}

function derivedVisitMinutes(
  visits: readonly { id: string; ordenId: string; visitNumber: number }[],
  activities: readonly LockedActivity[],
): VisitMinuteSnapshot[] {
  return [...visits]
    .sort((left, right) => left.visitNumber - right.visitNumber || left.id.localeCompare(right.id))
    .map((visit) => ({
      visitId: visit.id,
      orderId: visit.ordenId,
      visitNumber: visit.visitNumber,
      additionalMinutes: sumUniqueProductiveMinutes(
        activities.filter((activity) => activity.orderId === visit.ordenId),
      ),
    }));
}

function storedVisitMinutes(
  visits: readonly { id: string; ordenId: string; visitNumber: number; additionalMinutes: number }[],
): VisitMinuteSnapshot[] {
  return [...visits]
    .sort((left, right) => left.visitNumber - right.visitNumber || left.id.localeCompare(right.id))
    .map((visit) => ({
      visitId: visit.id,
      orderId: visit.ordenId,
      visitNumber: visit.visitNumber,
      additionalMinutes: visit.additionalMinutes,
    }));
}

async function writeVisitMinutes(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  visitMinutes: readonly VisitMinuteSnapshot[],
): Promise<void> {
  for (const visit of visitMinutes) {
    const updated = await transaction.reincidenciaOrden.updateMany({
      where: { id: visit.visitId, reincidenciaId: recurrenceId, ordenId: visit.orderId },
      data: { additionalMinutes: visit.additionalMinutes },
    });
    if (updated.count !== 1) throw new TerminalRelationsChanged();
  }
}

function canonicalQualityDecisions(
  decisions: readonly QualityDecisionInput[],
): QualityDecisionInput[] {
  return decisions.map((decision) => ({
    technicianId: canonicalUuid(decision.technicianId),
    affectsQuality: decision.affectsQuality,
    ...(normalizedOptional(decision.justification) === null
      ? {}
      : { justification: normalizedOptional(decision.justification)! }),
  }));
}

function qualityDecisionSetIsComplete(
  originals: readonly OriginalSnapshot[],
  decisions: readonly QualityDecisionInput[],
): boolean {
  const decisionIds = decisions.map(({ technicianId }) => technicianId);
  return decisionIds.length === new Set(decisionIds).size
    && sameIds(originals.map(({ technicianId }) => technicianId), decisionIds);
}

function analysisSnapshot(record: {
  status: EstadoReincidencia;
  version: number;
  causeId: string | null;
  impact: string;
  responsibility: string;
  analysis: string | null;
  ageOverrideReason: string | null;
  estimatedCost: { toFixed(fractionDigits: number): string };
  reviewedById: string | null;
  reviewedAt: Date | null;
}, qualityDecisions: readonly OriginalSnapshot[]): object {
  return {
    status: record.status,
    version: record.version,
    causeId: record.causeId,
    impact: record.impact,
    responsibility: record.responsibility,
    analysis: record.analysis,
    ageOverrideReason: record.ageOverrideReason,
    estimatedCost: record.estimatedCost.toFixed(2),
    reviewedById: record.reviewedById,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    qualityDecisions,
  };
}

async function analyzeInTransaction(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  preliminaryOriginalOrderId: string,
  input: AnalyzeRecurrenceInput,
  actor: RecurrenceActorContext,
  now: Date,
  warningDays: number,
): Promise<RecurrenceDetailRecord> {
  const lockedOrders = await lockOrdersInOrder(transaction, [preliminaryOriginalOrderId]);
  const lockedRecurrence = await lockRecurrence(transaction, recurrenceId);
  if (lockedRecurrence === null) reject("RECURRENCE_NOT_FOUND");
  const cause = await lockCause(transaction, input.causeId);
  const actorUser = await lockUser(transaction, actor.userId);
  if (!userIsActive(actorUser)) reject("RECURRENCE_NOT_FOUND");

  const record = await transaction.reincidencia.findUnique({
    where: { id: recurrenceId },
    select: {
      id: true,
      originalOrderId: true,
      status: true,
      version: true,
      causeId: true,
      impact: true,
      responsibility: true,
      analysis: true,
      ageOverrideReason: true,
      estimatedCost: true,
      reviewedById: true,
      reviewedAt: true,
      detectedAt: true,
      tecnicos: {
        select: {
          tecnicoId: true,
          participation: true,
          affectsQuality: true,
          justification: true,
        },
      },
    },
  });
  if (record === null) reject("RECURRENCE_NOT_FOUND");
  if (record.originalOrderId !== preliminaryOriginalOrderId) reject("RECURRENCE_ORDER_MISMATCH");
  if (record.version !== input.version || lockedRecurrence.version !== input.version) reject("VERSION_CONFLICT");
  if (record.status !== "OPEN" && record.status !== "ANALYSIS") reject("INVALID_RECURRENCE_TRANSITION");
  if (cause === null || !cause.isActive || cause.deletedAt !== null) reject("RECURRENCE_CAUSE_NOT_FOUND");
  const originalOrder = lockedOrders.find(({ id }) => id === record.originalOrderId);
  if (originalOrder === undefined || originalOrder.deletedAt !== null || originalOrder.status !== "COMPLETED" || originalOrder.endedAt === null) {
    reject("RECURRENCE_ORDER_MISMATCH");
  }
  if (String(input.responsibility) === "UNDETERMINED") reject("RECURRENCE_QUALITY_INVALID");
  if (!input.analysis.trim()) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  if (pairedCostIsInvalid(input) || (input.estimatedCost !== undefined && !isValidCost(input.estimatedCost))) {
    reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  }

  const originals = originalSnapshots(record.tecnicos);
  const decisions = canonicalQualityDecisions(input.qualityDecisions);
  if (!qualityDecisionSetIsComplete(originals, decisions)) reject("RECURRENCE_QUALITY_INVALID");
  if (!validateQualityDecisions(input.responsibility, originals.map(({ technicianId }) => technicianId), decisions).valid) {
    reject("RECURRENCE_QUALITY_INVALID");
  }
  const exceedsWarning = record.detectedAt.getTime() - originalOrder.endedAt.getTime()
    > warningDays * 24 * 60 * 60 * 1_000;
  const ageOverrideReason = normalizedOptional(input.ageOverrideReason);
  if (exceedsWarning && ageOverrideReason === null) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");

  const beforeData = analysisSnapshot(record, originals);
  const decisionsById = new Map(decisions.map((decision) => [decision.technicianId, decision]));
  for (const original of originals) {
    const decision = decisionsById.get(original.technicianId)!;
    const updated = await transaction.reincidenciaTecnico.updateMany({
      where: {
        reincidenciaId: recurrenceId,
        tecnicoId: original.technicianId,
        participation: original.participation,
      },
      data: {
        affectsQuality: decision.affectsQuality,
        justification: decision.affectsQuality ? normalizedOptional(decision.justification) : null,
      },
    });
    if (updated.count !== 1) reject("RECURRENCE_QUALITY_INVALID");
  }

  const updated = await transaction.reincidencia.updateMany({
    where: {
      id: recurrenceId,
      version: input.version,
      status: { in: ["OPEN", "ANALYSIS"] },
    },
    data: {
      status: "ANALYSIS",
      causeId: cause.id,
      impact: input.impact,
      responsibility: input.responsibility,
      analysis: input.analysis.trim(),
      ageOverrideReason,
      reviewedById: actorUser.id,
      reviewedAt: now,
      ...(input.estimatedCost === undefined ? {} : { estimatedCost: input.estimatedCost.trim() }),
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) reject("VERSION_CONFLICT");

  const afterRecord = {
    ...record,
    status: "ANALYSIS" as const,
    version: input.version + 1,
    causeId: cause.id,
    impact: input.impact,
    responsibility: input.responsibility,
    analysis: input.analysis.trim(),
    ageOverrideReason,
    estimatedCost: input.estimatedCost === undefined
      ? record.estimatedCost
      : new Prisma.Decimal(input.estimatedCost.trim()),
    reviewedById: actorUser.id,
    reviewedAt: now,
  };
  const afterDecisions = originals.map((original) => {
    const decision = decisionsById.get(original.technicianId)!;
    return {
      technicianId: original.technicianId,
      participation: original.participation,
      affectsQuality: decision.affectsQuality,
      justification: decision.affectsQuality ? normalizedOptional(decision.justification) : null,
    };
  });
  await transaction.auditoria.create({ data: {
    userId: actorUser.id,
    action: "RECURRENCE_ANALYZED",
    entity: "Reincidencia",
    entityId: recurrenceId,
    beforeData: asJson(beforeData),
    afterData: asJson(analysisSnapshot(afterRecord, afterDecisions)),
    reason: normalizedOptional(input.costReason),
    occurredAt: now,
    requestId: actor.requestId,
  } });
  return loadDetail(transaction, recurrenceId);
}

function correctionSnapshot(record: {
  status: EstadoReincidencia;
  version: number;
  correctiveAction: string | null;
  preventiveAction: string | null;
  observations: string | null;
  estimatedCost: { toFixed(fractionDigits: number): string };
}): object {
  return {
    status: record.status,
    version: record.version,
    correctiveAction: record.correctiveAction,
    preventiveAction: record.preventiveAction,
    observations: record.observations,
    estimatedCost: record.estimatedCost.toFixed(2),
  };
}

async function correctInTransaction(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  input: CorrectRecurrenceInput,
  actor: RecurrenceActorContext,
  now: Date,
): Promise<RecurrenceDetailRecord> {
  const locked = await lockRecurrence(transaction, recurrenceId);
  if (locked === null) reject("RECURRENCE_NOT_FOUND");
  const actorUser = await lockUser(transaction, actor.userId);
  if (!userIsActive(actorUser)) reject("RECURRENCE_NOT_FOUND");
  const record = await transaction.reincidencia.findUnique({ where: { id: recurrenceId }, select: {
    status: true,
    version: true,
    correctiveAction: true,
    preventiveAction: true,
    observations: true,
    estimatedCost: true,
  } });
  if (record === null) reject("RECURRENCE_NOT_FOUND");
  if (record.version !== input.version || locked.version !== input.version) reject("VERSION_CONFLICT");
  if (record.status !== "ANALYSIS" && record.status !== "CORRECTION") reject("INVALID_RECURRENCE_TRANSITION");
  const correctiveAction = input.correctiveAction.trim();
  if (!correctiveAction) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  if (pairedCostIsInvalid(input) || (input.estimatedCost !== undefined && !isValidCost(input.estimatedCost))) {
    reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  }
  const beforeData = correctionSnapshot(record);
  const targetStatus = "CORRECTION" as const;
  const afterRecord = {
    ...record,
    status: targetStatus,
    version: input.version + 1,
    correctiveAction,
    preventiveAction: input.preventiveAction === undefined ? record.preventiveAction : input.preventiveAction,
    observations: input.observations === undefined ? record.observations : input.observations,
    estimatedCost: input.estimatedCost === undefined
      ? record.estimatedCost
      : new Prisma.Decimal(input.estimatedCost.trim()),
  };
  const updated = await transaction.reincidencia.updateMany({
    where: { id: recurrenceId, version: input.version, status: { in: ["ANALYSIS", "CORRECTION"] } },
    data: {
      status: targetStatus,
      correctiveAction,
      ...(input.preventiveAction === undefined ? {} : { preventiveAction: input.preventiveAction }),
      ...(input.observations === undefined ? {} : { observations: input.observations }),
      ...(input.estimatedCost === undefined ? {} : { estimatedCost: input.estimatedCost.trim() }),
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) reject("VERSION_CONFLICT");
  await transaction.auditoria.create({ data: {
    userId: actorUser.id,
    action: record.status === "ANALYSIS"
      ? "RECURRENCE_CORRECTION_STARTED"
      : "RECURRENCE_CORRECTION_UPDATED",
    entity: "Reincidencia",
    entityId: recurrenceId,
    beforeData: asJson(beforeData),
    afterData: asJson(correctionSnapshot(afterRecord)),
    reason: normalizedOptional(input.costReason),
    occurredAt: now,
    requestId: actor.requestId,
  } });
  return loadDetail(transaction, recurrenceId);
}

async function readVisitRelations(
  database: PrismaClient,
  recurrenceId: string,
): Promise<PreliminaryVisitRelations | null> {
  const record = await database.reincidencia.findUnique({
    where: { id: recurrenceId },
    select: { originalOrderId: true, ordenes: { select: { ordenId: true } } },
  });
  if (record === null) return null;
  return {
    originalOrderId: record.originalOrderId,
    orderIds: canonicalIds([record.originalOrderId, ...record.ordenes.map(({ ordenId }) => ordenId)]),
  };
}

async function addVisitInTransaction(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  preliminary: PreliminaryVisitRelations,
  input: AddRecurrenceVisitInput,
  actor: RecurrenceActorContext,
  now: Date,
): Promise<RecurrenceDetailRecord> {
  const proposedOrderId = canonicalUuid(input.orderId);
  const lockedOrders = await lockOrdersInOrder(transaction, [...preliminary.orderIds, proposedOrderId]);
  const locked = await lockRecurrence(transaction, recurrenceId);
  if (locked === null) reject("RECURRENCE_NOT_FOUND");
  const actorUser = await lockUser(transaction, actor.userId);
  if (!userIsActive(actorUser)) reject("RECURRENCE_NOT_FOUND");
  const record = await transaction.reincidencia.findUnique({ where: { id: recurrenceId }, select: {
    status: true,
    version: true,
    originalOrderId: true,
    ordenes: { select: { ordenId: true, visitNumber: true } },
    tecnicos: { where: { participation: "CORRECTION_PARTICIPANT" }, select: { tecnicoId: true } },
  } });
  if (record === null) reject("RECURRENCE_NOT_FOUND");
  const currentOrderIds = canonicalIds([record.originalOrderId, ...record.ordenes.map(({ ordenId }) => ordenId)]);
  if (record.originalOrderId !== preliminary.originalOrderId || !sameIds(currentOrderIds, preliminary.orderIds)) {
    throw new VisitRelationsChanged();
  }
  if (record.version !== input.version || locked.version !== input.version) reject("VERSION_CONFLICT");
  if (!mutableStatuses.includes(record.status as typeof mutableStatuses[number])) reject("INVALID_RECURRENCE_TRANSITION");
  if (record.ordenes.some(({ ordenId }) => ordenId === proposedOrderId) || record.originalOrderId === proposedOrderId) {
    reject("RECURRENCE_VISIT_DUPLICATE");
  }
  const originalOrder = lockedOrders.find(({ id }) => id === record.originalOrderId);
  const proposedOrder = lockedOrders.find(({ id }) => id === proposedOrderId);
  if (proposedOrder === undefined) reject("RECURRENCE_ORDER_NOT_FOUND");
  if (
    originalOrder === undefined
    || originalOrder.deletedAt !== null
    || proposedOrder.deletedAt !== null
    || proposedOrder.status === "CANCELLED"
    || originalOrder.branchId !== proposedOrder.branchId
  ) {
    reject("RECURRENCE_ORDER_MISMATCH");
  }
  const assignments = await transaction.ordenTecnico.findMany({
    where: { ordenId: proposedOrderId, assignedAt: { lte: now } },
    select: { tecnicoId: true },
    orderBy: [{ tecnicoId: "asc" }, { id: "asc" }],
  });
  const assignedIds = canonicalIds(assignments.map(({ tecnicoId }) => tecnicoId));
  const existingIds = new Set(record.tecnicos.map(({ tecnicoId }) => tecnicoId));
  const addedTechnicianIds = assignedIds.filter((technicianId) => !existingIds.has(technicianId));
  const visitNumber = Math.max(0, ...record.ordenes.map(({ visitNumber }) => visitNumber)) + 1;
  await transaction.reincidenciaOrden.create({ data: {
    reincidenciaId: recurrenceId,
    ordenId: proposedOrderId,
    visitNumber,
    observation: normalizedOptional(input.observation),
  } });
  for (const technicianId of addedTechnicianIds) {
    await transaction.reincidenciaTecnico.create({ data: {
      reincidenciaId: recurrenceId,
      tecnicoId: technicianId,
      participation: "CORRECTION_PARTICIPANT",
    } });
  }
  const updated = await transaction.reincidencia.updateMany({
    where: { id: recurrenceId, version: input.version, status: { in: [...mutableStatuses] } },
    data: { version: { increment: 1 }, updatedAt: now },
  });
  if (updated.count !== 1) reject("VERSION_CONFLICT");
  await transaction.auditoria.create({ data: {
    userId: actorUser.id,
    action: "RECURRENCE_VISIT_ADDED",
    entity: "Reincidencia",
    entityId: recurrenceId,
    beforeData: asJson({ status: record.status, version: record.version, visitCount: record.ordenes.length }),
    afterData: asJson({
      status: record.status,
      version: record.version + 1,
      visitCount: record.ordenes.length + 1,
      visit: { orderId: proposedOrderId, visitNumber, observation: normalizedOptional(input.observation) },
      addedTechnicianIds,
    }),
    occurredAt: now,
    requestId: actor.requestId,
  } });
  return loadDetail(transaction, recurrenceId);
}

async function addNoteInTransaction(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  input: AddRecurrenceNoteInput,
  actor: RecurrenceActorContext,
  now: Date,
): Promise<RecurrenceDetailRecord> {
  const locked = await lockRecurrence(transaction, recurrenceId);
  if (locked === null) reject("RECURRENCE_NOT_FOUND");
  const actorUser = await lockUser(transaction, actor.userId);
  if (!userIsActive(actorUser)) reject("RECURRENCE_NOT_FOUND");
  const record = await transaction.reincidencia.findUnique({ where: { id: recurrenceId }, select: {
    status: true,
    version: true,
    reportedById: true,
    tecnicos: { select: { tecnicoId: true } },
    _count: { select: { notas: true } },
  } });
  if (record === null) reject("RECURRENCE_NOT_FOUND");
  const visibleTechnician = actor.technicianId !== null
    && (record.reportedById === actorUser.id
      || record.tecnicos.some(({ tecnicoId }) => tecnicoId === canonicalUuid(actor.technicianId!)));
  const visible = canReview(actor) || visibleTechnician;
  if (!visible) reject("RECURRENCE_NOT_FOUND");
  if (!mutableStatuses.includes(record.status as typeof mutableStatuses[number])) reject("INVALID_RECURRENCE_TRANSITION");
  const content = input.content.trim();
  if (!content) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  const note = await transaction.reincidenciaNota.create({ data: {
    reincidenciaId: recurrenceId,
    authorId: actorUser.id,
    content,
    createdAt: now,
  }, select: { id: true, authorId: true, content: true, createdAt: true } });
  await transaction.auditoria.create({ data: {
    userId: actorUser.id,
    action: "RECURRENCE_NOTE_ADDED",
    entity: "Reincidencia",
    entityId: recurrenceId,
    beforeData: asJson({ status: record.status, version: record.version, noteCount: record._count.notas }),
    afterData: asJson({
      status: record.status,
      version: record.version,
      noteCount: record._count.notas + 1,
      note: { id: note.id, authorId: note.authorId, content: note.content, createdAt: note.createdAt.toISOString() },
    }),
    occurredAt: now,
    requestId: actor.requestId,
  } });
  return loadDetail(transaction, recurrenceId);
}

function dismissalSnapshot(record: {
  status: EstadoReincidencia;
  version: number;
  dismissalReason: string | null;
  dismissedById: string | null;
  dismissedAt: Date | null;
}, technicians: readonly QualitySnapshot[]): object {
  return {
    status: record.status,
    version: record.version,
    dismissalReason: record.dismissalReason,
    dismissedById: record.dismissedById,
    dismissedAt: record.dismissedAt?.toISOString() ?? null,
    qualityDecisions: qualitySnapshots(technicians),
  };
}

async function dismissInTransaction(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  input: DismissRecurrenceInput,
  actor: RecurrenceActorContext,
  now: Date,
): Promise<RecurrenceDetailRecord> {
  const locked = await lockRecurrence(transaction, recurrenceId);
  if (locked === null) reject("RECURRENCE_NOT_FOUND");
  const actorUser = await lockUser(transaction, actor.userId);
  if (!userIsActive(actorUser)) reject("RECURRENCE_NOT_FOUND");
  const record = await transaction.reincidencia.findUnique({
    where: { id: recurrenceId },
    select: {
      status: true,
      version: true,
      dismissalReason: true,
      dismissedById: true,
      dismissedAt: true,
      tecnicos: { select: { tecnicoId: true, participation: true, affectsQuality: true, justification: true } },
    },
  });
  if (record === null) reject("RECURRENCE_NOT_FOUND");
  if (record.version !== input.version || locked.version !== input.version) reject("VERSION_CONFLICT");
  if (record.status !== "OPEN" && record.status !== "ANALYSIS") reject("INVALID_RECURRENCE_TRANSITION");
  const reason = validReason(input.reason);
  if (reason === null) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  const technicians = record.tecnicos.map(({ tecnicoId, ...technician }) => ({
    ...technician,
    technicianId: tecnicoId,
  }));
  const beforeData = dismissalSnapshot(record, technicians);
  await transaction.reincidenciaTecnico.updateMany({
    where: { reincidenciaId: recurrenceId },
    data: { affectsQuality: false, justification: null },
  });
  const updated = await transaction.reincidencia.updateMany({
    where: { id: recurrenceId, version: input.version, status: { in: ["OPEN", "ANALYSIS"] } },
    data: {
      status: "DISMISSED",
      dismissalReason: reason,
      dismissedById: actorUser.id,
      dismissedAt: now,
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) reject("VERSION_CONFLICT");
  const afterTechnicians = technicians.map((technician) => ({
    ...technician,
    affectsQuality: false,
    justification: null,
  }));
  await transaction.auditoria.create({ data: {
    userId: actorUser.id,
    action: "RECURRENCE_DISMISSED",
    entity: "Reincidencia",
    entityId: recurrenceId,
    beforeData: asJson(beforeData),
    afterData: asJson(dismissalSnapshot({
      status: "DISMISSED",
      version: input.version + 1,
      dismissalReason: reason,
      dismissedById: actorUser.id,
      dismissedAt: now,
    }, afterTechnicians)),
    reason,
    occurredAt: now,
    requestId: actor.requestId,
  } });
  return loadDetail(transaction, recurrenceId);
}

async function readTerminalRelations(
  database: PrismaClient,
  recurrenceId: string,
): Promise<PreliminaryTerminalRelations | null> {
  const record = await database.reincidencia.findUnique({
    where: { id: recurrenceId },
    select: { ordenes: { select: { ordenId: true } } },
  });
  return record === null
    ? null
    : { orderIds: canonicalIds(record.ordenes.map(({ ordenId }) => ordenId)) };
}

function terminalRelationsAreCurrent(
  preliminary: PreliminaryTerminalRelations,
  orderIds: readonly string[],
): boolean {
  return sameIds(preliminary.orderIds, orderIds);
}

function closureSnapshot(record: {
  status: EstadoReincidencia;
  version: number;
  additionalMinutes: number;
  closedById: string | null;
  closedAt: Date | null;
}, visitMinutes: readonly VisitMinuteSnapshot[]): object {
  return {
    status: record.status,
    version: record.version,
    additionalMinutes: record.additionalMinutes,
    closedById: record.closedById,
    closedAt: record.closedAt?.toISOString() ?? null,
    visitMinutes: visitMinutes.map(({ orderId, additionalMinutes }) => ({ orderId, additionalMinutes })),
  };
}

async function closeInTransaction(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  preliminary: PreliminaryTerminalRelations,
  hooks: RecurrencesWorkflowRepositoryOptions["hooks"],
  input: CloseRecurrenceInput,
  actor: RecurrenceActorContext,
  now: Date,
): Promise<RecurrenceDetailRecord> {
  const lockedOrders = await lockOrdersInOrder(transaction, preliminary.orderIds);
  await runTerminalLockHook(
    transaction,
    hooks?.afterCloseOrdersLocked,
    recurrenceId,
    preliminary.orderIds,
  );
  const locked = await lockRecurrence(transaction, recurrenceId);
  if (locked === null) reject("RECURRENCE_NOT_FOUND");
  await runTerminalLockHook(
    transaction,
    hooks?.afterCloseRecurrenceLocked,
    recurrenceId,
    preliminary.orderIds,
  );
  const record = await transaction.reincidencia.findUnique({
    where: { id: recurrenceId },
    select: {
      status: true,
      version: true,
      causeId: true,
      impact: true,
      responsibility: true,
      analysis: true,
      correctiveAction: true,
      preventiveAction: true,
      additionalMinutes: true,
      closedById: true,
      closedAt: true,
      ordenes: { select: { id: true, ordenId: true, visitNumber: true, additionalMinutes: true } },
      tecnicos: { select: { tecnicoId: true, participation: true, affectsQuality: true, justification: true } },
    },
  });
  if (record === null) reject("RECURRENCE_NOT_FOUND");
  const currentOrderIds = canonicalIds(record.ordenes.map(({ ordenId }) => ordenId));
  if (!terminalRelationsAreCurrent(preliminary, currentOrderIds)) throw new TerminalRelationsChanged();
  if (record.version !== input.version || locked.version !== input.version) reject("VERSION_CONFLICT");
  if (record.status !== "CORRECTION") reject("INVALID_RECURRENCE_TRANSITION");
  const cause = record.causeId === null ? null : await lockCause(transaction, record.causeId);
  const evidenceIds = await lockActiveRecurrenceEvidence(transaction, recurrenceId);
  const activities = await lockCompletedActivities(transaction, currentOrderIds);
  const actorUser = await lockUser(transaction, actor.userId);
  if (!userIsActive(actorUser)) reject("RECURRENCE_NOT_FOUND");
  if (cause === null || !cause.isActive || cause.deletedAt !== null) reject("RECURRENCE_CAUSE_NOT_FOUND");
  if (record.responsibility === "UNDETERMINED") reject("RECURRENCE_QUALITY_INVALID");
  if (!record.analysis?.trim() || !record.correctiveAction?.trim()) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  if (requiresPreventiveAction(record.impact, record.responsibility) && !record.preventiveAction?.trim()) {
    reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  }
  const originals = originalSnapshots(record.tecnicos);
  const decisions = originals.map(({ technicianId, affectsQuality, justification }) => ({
    technicianId,
    affectsQuality,
    ...(justification === null ? {} : { justification }),
  }));
  if (!qualityDecisionSetIsComplete(originals, decisions)
    || !validateQualityDecisions(record.responsibility, originals.map(({ technicianId }) => technicianId), decisions).valid) {
    reject("RECURRENCE_QUALITY_INVALID");
  }
  if (evidenceIds.length === 0) reject("RECURRENCE_EVIDENCE_REQUIRED");
  if (lockedOrders.length !== currentOrderIds.length
    || lockedOrders.some((order) => order.deletedAt !== null || order.status !== "COMPLETED" || order.endedAt === null)) {
    reject("RECURRENCE_ORDER_MISMATCH");
  }
  const beforeVisitMinutes = storedVisitMinutes(record.ordenes);
  const visitMinutes = derivedVisitMinutes(record.ordenes, activities);
  const additionalMinutes = sumUniqueProductiveMinutes(activities);
  const beforeData = closureSnapshot(record, beforeVisitMinutes);
  await writeVisitMinutes(transaction, recurrenceId, visitMinutes);
  const updated = await transaction.reincidencia.updateMany({
    where: { id: recurrenceId, version: input.version, status: "CORRECTION" },
    data: {
      status: "CLOSED",
      additionalMinutes,
      closedById: actorUser.id,
      closedAt: now,
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) reject("VERSION_CONFLICT");
  await transaction.auditoria.create({ data: {
    userId: actorUser.id,
    action: "RECURRENCE_CLOSED",
    entity: "Reincidencia",
    entityId: recurrenceId,
    beforeData: asJson(beforeData),
    afterData: asJson(closureSnapshot({
      status: "CLOSED",
      version: input.version + 1,
      additionalMinutes,
      closedById: actorUser.id,
      closedAt: now,
    }, visitMinutes)),
    occurredAt: now,
    requestId: actor.requestId,
  } });
  return loadDetail(transaction, recurrenceId);
}

function adjustmentSnapshot(record: {
  status: EstadoReincidencia;
  version: number;
  causeId: string | null;
  impact: string;
  responsibility: string;
  analysis: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  observations: string | null;
  estimatedCost: { toFixed(fractionDigits: number): string };
  additionalMinutes: number;
}, qualityDecisions: readonly OriginalSnapshot[], visitMinutes: readonly VisitMinuteSnapshot[], costReason?: string): object {
  return {
    status: record.status,
    version: record.version,
    causeId: record.causeId,
    impact: record.impact,
    responsibility: record.responsibility,
    analysis: record.analysis,
    correctiveAction: record.correctiveAction,
    preventiveAction: record.preventiveAction,
    observations: record.observations,
    estimatedCost: record.estimatedCost.toFixed(2),
    additionalMinutes: record.additionalMinutes,
    visitMinutes,
    ...(costReason === undefined ? {} : { costReason }),
    qualityDecisions,
  };
}

async function adjustInTransaction(
  transaction: Prisma.TransactionClient,
  recurrenceId: string,
  preliminary: PreliminaryTerminalRelations,
  input: AdjustRecurrenceInput,
  actor: RecurrenceActorContext,
  now: Date,
): Promise<RecurrenceDetailRecord> {
  await lockOrdersInOrder(transaction, preliminary.orderIds);
  const locked = await lockRecurrence(transaction, recurrenceId);
  if (locked === null) reject("RECURRENCE_NOT_FOUND");
  const record = await transaction.reincidencia.findUnique({ where: { id: recurrenceId }, select: {
    status: true,
    version: true,
    causeId: true,
    impact: true,
    responsibility: true,
    analysis: true,
    correctiveAction: true,
    preventiveAction: true,
    observations: true,
    estimatedCost: true,
    additionalMinutes: true,
    ordenes: { select: { id: true, ordenId: true, visitNumber: true, additionalMinutes: true } },
    tecnicos: { select: { tecnicoId: true, participation: true, affectsQuality: true, justification: true } },
  } });
  if (record === null) reject("RECURRENCE_NOT_FOUND");
  const currentOrderIds = canonicalIds(record.ordenes.map(({ ordenId }) => ordenId));
  if (!terminalRelationsAreCurrent(preliminary, currentOrderIds)) throw new TerminalRelationsChanged();
  if (record.version !== input.version || locked.version !== input.version) reject("VERSION_CONFLICT");
  if (record.status !== "CLOSED") reject("INVALID_RECURRENCE_TRANSITION");
  const nextCauseId = input.causeId === undefined ? record.causeId : canonicalUuid(input.causeId);
  const cause = nextCauseId === null ? null : await lockCause(transaction, nextCauseId);
  const activities = await lockCompletedActivities(transaction, currentOrderIds);
  const actorUser = await lockUser(transaction, actor.userId);
  if (!userIsActive(actorUser)) reject("RECURRENCE_NOT_FOUND");
  const reason = validReason(input.reason);
  if (reason === null) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  if (cause === null || !cause.isActive || cause.deletedAt !== null) reject("RECURRENCE_CAUSE_NOT_FOUND");
  if (pairedCostIsInvalid(input) || (input.estimatedCost !== undefined && !isValidCost(input.estimatedCost))) {
    reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  }
  const nextResponsibility = input.responsibility ?? record.responsibility;
  if (nextResponsibility === "UNDETERMINED") reject("RECURRENCE_QUALITY_INVALID");
  const nextImpact = input.impact ?? record.impact;
  const nextAnalysis = input.analysis === undefined ? record.analysis : input.analysis.trim();
  const nextCorrectiveAction = input.correctiveAction === undefined ? record.correctiveAction : input.correctiveAction.trim();
  const nextPreventiveAction = input.preventiveAction === undefined ? record.preventiveAction : normalizedNullable(input.preventiveAction);
  const nextObservations = input.observations === undefined ? record.observations : normalizedNullable(input.observations);
  if (!nextAnalysis?.trim() || !nextCorrectiveAction?.trim()) reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  if (requiresPreventiveAction(nextImpact, nextResponsibility) && !nextPreventiveAction?.trim()) {
    reject("RECURRENCE_DOCUMENTATION_INCOMPLETE");
  }
  const originals = originalSnapshots(record.tecnicos);
  const decisions = input.qualityDecisions === undefined
    ? originals.map(({ technicianId, affectsQuality, justification }) => ({ technicianId, affectsQuality, ...(justification === null ? {} : { justification }) }))
    : canonicalQualityDecisions(input.qualityDecisions);
  if (!qualityDecisionSetIsComplete(originals, decisions)
    || !validateQualityDecisions(nextResponsibility, originals.map(({ technicianId }) => technicianId), decisions).valid) {
    reject("RECURRENCE_QUALITY_INVALID");
  }
  const nextEstimatedCost = input.estimatedCost === undefined
    ? record.estimatedCost
    : new Prisma.Decimal(input.estimatedCost.trim());
  const beforeVisitMinutes = storedVisitMinutes(record.ordenes);
  const visitMinutes = derivedVisitMinutes(record.ordenes, activities);
  const additionalMinutes = sumUniqueProductiveMinutes(activities);
  const estimatedCostChanged = !nextEstimatedCost.equals(record.estimatedCost);
  const costReason = estimatedCostChanged ? normalizedOptional(input.costReason) ?? undefined : undefined;
  const beforeData = adjustmentSnapshot(record, originals, beforeVisitMinutes);
  const decisionsById = new Map(decisions.map((decision) => [decision.technicianId, decision]));
  for (const original of originals) {
    const decision = decisionsById.get(original.technicianId)!;
    const updated = await transaction.reincidenciaTecnico.updateMany({
      where: { reincidenciaId: recurrenceId, tecnicoId: original.technicianId, participation: original.participation },
      data: { affectsQuality: decision.affectsQuality, justification: decision.affectsQuality ? normalizedOptional(decision.justification) : null },
    });
    if (updated.count !== 1) reject("RECURRENCE_QUALITY_INVALID");
  }
  await writeVisitMinutes(transaction, recurrenceId, visitMinutes);
  const updated = await transaction.reincidencia.updateMany({
    where: { id: recurrenceId, version: input.version, status: "CLOSED" },
    data: {
      causeId: cause.id,
      impact: nextImpact,
      responsibility: nextResponsibility,
      analysis: nextAnalysis.trim(),
      correctiveAction: nextCorrectiveAction.trim(),
      preventiveAction: nextPreventiveAction,
      observations: nextObservations,
      estimatedCost: nextEstimatedCost,
      additionalMinutes,
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) reject("VERSION_CONFLICT");
  const afterDecisions = originals.map((original) => {
    const decision = decisionsById.get(original.technicianId)!;
    return {
      technicianId: original.technicianId,
      participation: original.participation,
      affectsQuality: decision.affectsQuality,
      justification: decision.affectsQuality ? normalizedOptional(decision.justification) : null,
    };
  });
  await transaction.auditoria.create({ data: {
    userId: actorUser.id,
    action: "RECURRENCE_ADJUSTED",
    entity: "Reincidencia",
    entityId: recurrenceId,
    beforeData: asJson(beforeData),
    afterData: asJson(adjustmentSnapshot({
      status: "CLOSED",
      version: input.version + 1,
      causeId: cause.id,
      impact: nextImpact,
      responsibility: nextResponsibility,
      analysis: nextAnalysis.trim(),
      correctiveAction: nextCorrectiveAction.trim(),
      preventiveAction: nextPreventiveAction,
      observations: nextObservations,
      estimatedCost: nextEstimatedCost,
      additionalMinutes,
    }, afterDecisions, visitMinutes, costReason)),
    reason,
    occurredAt: now,
    requestId: actor.requestId,
  } });
  return loadDetail(transaction, recurrenceId);
}

export function createRecurrencesWorkflowRepository(
  database: PrismaClient,
  options: RecurrencesWorkflowRepositoryOptions = {},
): RecurrencesWorkflowRepository {
  return {
    async analyzeRecurrence(id, input, actor, now, warningDays) {
      if (!canReview(actor)) return { kind: "RECURRENCE_NOT_FOUND" };
      const recurrenceId = canonicalUuid(id);
      const preliminary = await database.reincidencia.findUnique({
        where: { id: recurrenceId },
        select: { originalOrderId: true },
      });
      if (preliminary === null) return { kind: "RECURRENCE_NOT_FOUND" };
      const canonicalInput = {
        ...input,
        causeId: canonicalUuid(input.causeId),
        qualityDecisions: canonicalQualityDecisions(input.qualityDecisions),
      };
      try {
        const recurrence = await runRecurrenceSerializableTransaction(database, (transaction) =>
          analyzeInTransaction(
            transaction,
            recurrenceId,
            preliminary.originalOrderId,
            canonicalInput,
            actor,
            now,
            warningDays,
          ));
        return { kind: "UPDATED", recurrence } satisfies RecurrenceMutationResult;
      } catch (error) {
        if (error instanceof RejectedRecurrenceWorkflow) return { kind: error.kind };
        throw error;
      }
    },

    async correctRecurrence(id, input, actor, now) {
      if (!canReview(actor)) return { kind: "RECURRENCE_NOT_FOUND" };
      try {
        const recurrence = await runRecurrenceSerializableTransaction(database, (transaction) =>
          correctInTransaction(transaction, canonicalUuid(id), input, actor, now));
        return { kind: "UPDATED", recurrence } satisfies RecurrenceMutationResult;
      } catch (error) {
        if (error instanceof RejectedRecurrenceWorkflow) return { kind: error.kind };
        throw error;
      }
    },

    async addVisit(id, input, actor, now) {
      if (!canReview(actor)) return { kind: "RECURRENCE_NOT_FOUND" };
      const recurrenceId = canonicalUuid(id);
      const canonicalInput = { ...input, orderId: canonicalUuid(input.orderId) };
      for (let attempt = 1; attempt <= maximumRelationAttempts; attempt += 1) {
        const preliminary = await readVisitRelations(database, recurrenceId);
        await options.hooks?.afterVisitRelationsRead?.({
          recurrenceId,
          originalOrderId: preliminary?.originalOrderId ?? null,
          orderIds: preliminary?.orderIds ?? [],
          proposedOrderId: canonicalInput.orderId,
        });
        if (preliminary === null) return { kind: "RECURRENCE_NOT_FOUND" };
        try {
          const recurrence = await runRecurrenceSerializableTransaction(database, (transaction) =>
            addVisitInTransaction(transaction, recurrenceId, preliminary, canonicalInput, actor, now));
          return { kind: "UPDATED", recurrence } satisfies RecurrenceMutationResult;
        } catch (error) {
          if (error instanceof VisitRelationsChanged && attempt < maximumRelationAttempts) continue;
          if (error instanceof RejectedRecurrenceWorkflow) return { kind: error.kind };
          throw error;
        }
      }
      throw new Error("Unreachable recurrence visit relationship retry state");
    },

    async addNote(id, input, actor, now) {
      try {
        const recurrence = await runRecurrenceSerializableTransaction(database, (transaction) =>
          addNoteInTransaction(transaction, canonicalUuid(id), input, actor, now));
        return { kind: "UPDATED", recurrence } satisfies RecurrenceMutationResult;
      } catch (error) {
        if (error instanceof RejectedRecurrenceWorkflow) return { kind: error.kind };
        throw error;
      }
    },

    async dismissRecurrence(id, input, actor, now) {
      if (!canReview(actor)) return { kind: "RECURRENCE_NOT_FOUND" };
      try {
        const recurrence = await runRecurrenceSerializableTransaction(database, (transaction) =>
          dismissInTransaction(transaction, canonicalUuid(id), input, actor, now));
        return { kind: "UPDATED", recurrence } satisfies RecurrenceMutationResult;
      } catch (error) {
        if (error instanceof RejectedRecurrenceWorkflow) return { kind: error.kind };
        throw error;
      }
    },

    async closeRecurrence(id, input, actor, now) {
      if (!canReview(actor)) return { kind: "RECURRENCE_NOT_FOUND" };
      const recurrenceId = canonicalUuid(id);
      for (let attempt = 1; attempt <= maximumRelationAttempts; attempt += 1) {
        const preliminary = await readTerminalRelations(database, recurrenceId);
        if (preliminary === null) return { kind: "RECURRENCE_NOT_FOUND" };
        try {
          const recurrence = await runRecurrenceSerializableTransaction(database, (transaction) =>
            closeInTransaction(transaction, recurrenceId, preliminary, options.hooks, input, actor, now));
          return { kind: "UPDATED", recurrence } satisfies RecurrenceMutationResult;
        } catch (error) {
          if (error instanceof TerminalRelationsChanged && attempt < maximumRelationAttempts) continue;
          if (error instanceof RejectedRecurrenceWorkflow) return { kind: error.kind };
          throw error;
        }
      }
      throw new Error("Unreachable recurrence closure relationship retry state");
    },

    async adjustClosedRecurrence(id, input, actor, now) {
      if (!canReview(actor)) return { kind: "RECURRENCE_NOT_FOUND" };
      const recurrenceId = canonicalUuid(id);
      const canonicalInput = {
        ...input,
        ...(input.causeId === undefined ? {} : { causeId: canonicalUuid(input.causeId) }),
        ...(input.qualityDecisions === undefined
          ? {}
          : { qualityDecisions: canonicalQualityDecisions(input.qualityDecisions) }),
      };
      for (let attempt = 1; attempt <= maximumRelationAttempts; attempt += 1) {
        const preliminary = await readTerminalRelations(database, recurrenceId);
        if (preliminary === null) return { kind: "RECURRENCE_NOT_FOUND" };
        try {
          const recurrence = await runRecurrenceSerializableTransaction(database, (transaction) =>
            adjustInTransaction(transaction, recurrenceId, preliminary, canonicalInput, actor, now));
          return { kind: "UPDATED", recurrence } satisfies RecurrenceMutationResult;
        } catch (error) {
          if (error instanceof TerminalRelationsChanged && attempt < maximumRelationAttempts) continue;
          if (error instanceof RejectedRecurrenceWorkflow) return { kind: error.kind };
          throw error;
        }
      }
      throw new Error("Unreachable closed recurrence adjustment relationship retry state");
    },
  };
}
