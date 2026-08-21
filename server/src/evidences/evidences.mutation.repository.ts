import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  evidenceRecordSelect,
  type EvidenceMutationRepository,
  type EvidenceMutationResult,
  type EvidenceRecord,
} from "./evidences.repository.types.js";
import type {
  ArchiveEvidenceInput,
  CreateEvidencePersistenceInput,
  EvidenceActorContext,
  EvidenceResource,
  UpdateEvidenceInput,
} from "./evidences.types.js";

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;
const serializableAttempts = 3;

interface LockedTargetRow {
  id: string;
  status: string;
}

interface EvidenceTarget {
  id: string;
  ordenId: string | null;
  actividadId: string | null;
  reincidenciaId: string | null;
}

interface LockedEvidenceRow extends EvidenceTarget {
  version: number;
}

function isRetryablePostgresTransactionError(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  if (error.code !== "P2010") return false;
  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== "object" || adapterError === null) return false;
  const cause = Reflect.get(adapterError, "cause");
  if (typeof cause !== "object" || cause === null) return false;
  const sqlState = Reflect.get(cause, "originalCode") ?? Reflect.get(cause, "code");
  return sqlState === "40P01" || sqlState === "40001";
}

async function runSerializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= serializableAttempts; attempt += 1) {
    try {
      return await database.$transaction(operation, transactionOptions);
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2034" || isRetryablePostgresTransactionError(error));
      if (!retryable || attempt === serializableAttempts) throw error;
    }
  }
  throw new Error("Unreachable serializable transaction state");
}

async function lockTarget(
  transaction: Prisma.TransactionClient,
  resource: EvidenceResource,
): Promise<LockedTargetRow | null> {
  if (resource.type === "ORDER") {
    const rows = await transaction.$queryRaw<LockedTargetRow[]>`
      SELECT "id", UPPER("status"::text) AS "status"
      FROM "orden_trabajo"
      WHERE "id" = ${resource.id}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }
  const rows = resource.type === "ACTIVITY"
    ? await transaction.$queryRaw<LockedTargetRow[]>`
      SELECT "id", UPPER("status"::text) AS "status"
      FROM "actividad"
      WHERE "id" = ${resource.id}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `
    : await transaction.$queryRaw<LockedTargetRow[]>`
      SELECT "id", UPPER("status"::text) AS "status"
      FROM "reincidencia"
      WHERE "id" = ${resource.id}::uuid
      FOR UPDATE
    `;
  return rows[0] ?? null;
}

async function findEvidenceTarget(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<EvidenceResource | null> {
  const evidence = await transaction.evidencia.findUnique({
    where: { id },
    select: { ordenId: true, actividadId: true, reincidenciaId: true, deletedAt: true },
  });
  if (evidence === null || evidence.deletedAt !== null) return null;
  if (evidence.ordenId !== null && evidence.actividadId === null && evidence.reincidenciaId === null) {
    return { type: "ORDER", id: evidence.ordenId };
  }
  if (evidence.actividadId !== null && evidence.ordenId === null && evidence.reincidenciaId === null) {
    return { type: "ACTIVITY", id: evidence.actividadId };
  }
  if (evidence.reincidenciaId !== null && evidence.ordenId === null && evidence.actividadId === null) {
    return { type: "RECURRENCE", id: evidence.reincidenciaId };
  }
  return null;
}

async function lockEvidence(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<LockedEvidenceRow | null> {
  const rows = await transaction.$queryRaw<LockedEvidenceRow[]>`
    SELECT
      "id",
      "orden_id" AS "ordenId",
      "actividad_id" AS "actividadId",
      "reincidencia_id" AS "reincidenciaId",
      "version"
    FROM "evidencia"
    WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function loadEvidence(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<EvidenceRecord> {
  return transaction.evidencia.findUniqueOrThrow({
    where: { id },
    select: evidenceRecordSelect,
  }) as Promise<EvidenceRecord>;
}

function resourceSnapshot(evidence: EvidenceRecord): {
  resourceType: "ORDER" | "ACTIVITY" | "RECURRENCE";
  resourceId: string;
} {
  if (evidence.orden !== null && evidence.actividad === null && evidence.reincidencia === null) {
    return { resourceType: "ORDER", resourceId: evidence.orden.id };
  }
  if (evidence.actividad !== null && evidence.orden === null && evidence.reincidencia === null) {
    return { resourceType: "ACTIVITY", resourceId: evidence.actividad.id };
  }
  if (evidence.reincidencia !== null && evidence.orden === null && evidence.actividad === null) {
    return { resourceType: "RECURRENCE", resourceId: evidence.reincidencia.id };
  }
  throw new Error("Evidence mutation requires exactly one supported resource");
}

function auditSnapshot(
  evidence: EvidenceRecord,
  actor: EvidenceActorContext,
  includeMutableValues = false,
) {
  return {
    ...resourceSnapshot(evidence),
    checksumSha256: evidence.checksumSha256,
    sizeBytes: Number(evidence.sizeBytes),
    accessLevel: evidence.accessLevel,
    actorId: actor.userId,
    version: evidence.version,
    ...(includeMutableValues && { description: evidence.description }),
  };
}

async function writeAudit(
  transaction: Prisma.TransactionClient,
  action: "EVIDENCE_UPLOADED" | "EVIDENCE_UPDATED" | "EVIDENCE_ARCHIVED" | "EVIDENCE_DOWNLOADED",
  evidence: EvidenceRecord,
  actor: EvidenceActorContext,
  now: Date,
  before?: EvidenceRecord,
  reason?: string,
): Promise<void> {
  const includesMutableValues = action === "EVIDENCE_UPLOADED" || action === "EVIDENCE_UPDATED";
  const afterData = {
    ...auditSnapshot(evidence, actor, includesMutableValues),
    ...(action === "EVIDENCE_ARCHIVED" && {
      deletedAt: evidence.deletedAt?.toISOString() ?? null,
      deletedById: evidence.deletedById,
      deletionReason: evidence.deletionReason,
    }),
  };
  await transaction.auditoria.create({
    data: {
      userId: actor.userId,
      action,
      entity: "Evidencia",
      entityId: evidence.id,
      ...(before !== undefined && { beforeData: auditSnapshot(before, actor, includesMutableValues) }),
      afterData,
      ...(reason !== undefined && { reason }),
      occurredAt: now,
      requestId: actor.requestId,
    },
  });
}

async function createEvidence(
  transaction: Prisma.TransactionClient,
  input: CreateEvidencePersistenceInput,
  actor: EvidenceActorContext,
  now: Date,
  promote: () => Promise<void>,
  promotion: { complete: boolean },
): Promise<EvidenceMutationResult> {
  const target = await lockTarget(transaction, input.resource);
  if (target === null) return { kind: "RESOURCE_NOT_FOUND" };
  if (target.status === "CANCELLED") return { kind: "RESOURCE_CANCELLED" };
  if (input.resource.type === "RECURRENCE"
    && target.status !== "OPEN"
    && target.status !== "ANALYSIS"
    && target.status !== "CORRECTION") {
    return { kind: "RESOURCE_INACTIVE" };
  }

  // The final storage key is supplied by the storage coordinator; promotion stays
  // inside the target lock so its same-volume rename cannot outlive a stale target.
  if (!promotion.complete) {
    await promote();
    promotion.complete = true;
  }
  const evidence = await transaction.evidencia.create({
    data: {
      originalName: input.originalName,
      storedName: input.storedName,
      mimeType: input.mimeType,
      fileExtension: input.fileExtension,
      sizeBytes: BigInt(input.sizeBytes),
      storageKey: input.storageKey,
      checksumSha256: input.checksumSha256,
      description: input.description,
      accessLevel: input.accessLevel,
      uploadedById: actor.userId,
      ...(input.resource.type === "ORDER"
        ? { ordenId: input.resource.id }
        : input.resource.type === "ACTIVITY"
          ? { actividadId: input.resource.id }
          : { reincidenciaId: input.resource.id }),
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  const record = await loadEvidence(transaction, evidence.id);
  await writeAudit(transaction, "EVIDENCE_UPLOADED", record, actor, now);
  return { kind: "CREATED", evidence: record };
}

async function updateEvidence(
  transaction: Prisma.TransactionClient,
  id: string,
  input: UpdateEvidenceInput,
  actor: EvidenceActorContext,
  now: Date,
): Promise<EvidenceMutationResult> {
  const resource = await findEvidenceTarget(transaction, id);
  if (resource === null) return { kind: "EVIDENCE_NOT_FOUND" };
  if (await lockTarget(transaction, resource) === null) return { kind: "RESOURCE_NOT_FOUND" };
  const locked = await lockEvidence(transaction, id);
  if (locked === null) return { kind: "EVIDENCE_NOT_FOUND" };
  if (locked.version !== input.version) return { kind: "VERSION_CONFLICT" };

  const before = await loadEvidence(transaction, id);
  const changed = await transaction.evidencia.updateMany({
    where: { id, version: input.version, deletedAt: null },
    data: {
      ...(input.description !== undefined && { description: input.description }),
      ...(input.accessLevel !== undefined && { accessLevel: input.accessLevel }),
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  const record = await loadEvidence(transaction, id);
  await writeAudit(transaction, "EVIDENCE_UPDATED", record, actor, now, before);
  return { kind: "UPDATED", evidence: record };
}

async function archiveEvidence(
  transaction: Prisma.TransactionClient,
  id: string,
  input: ArchiveEvidenceInput,
  actor: EvidenceActorContext,
  now: Date,
): Promise<EvidenceMutationResult> {
  const resource = await findEvidenceTarget(transaction, id);
  if (resource === null) return { kind: "EVIDENCE_NOT_FOUND" };
  if (await lockTarget(transaction, resource) === null) return { kind: "RESOURCE_NOT_FOUND" };
  const locked = await lockEvidence(transaction, id);
  if (locked === null) return { kind: "EVIDENCE_NOT_FOUND" };
  if (locked.version !== input.version) return { kind: "VERSION_CONFLICT" };

  const before = await loadEvidence(transaction, id);
  const changed = await transaction.evidencia.updateMany({
    where: { id, version: input.version, deletedAt: null },
    data: {
      deletedAt: now,
      deletedById: actor.userId,
      deletionReason: input.reason,
      updatedAt: now,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return { kind: "VERSION_CONFLICT" };
  const record = await loadEvidence(transaction, id);
  await writeAudit(transaction, "EVIDENCE_ARCHIVED", record, actor, now, before, input.reason);
  return { kind: "UPDATED", evidence: record };
}

export function createEvidencesMutationRepository(
  database: PrismaClient,
): EvidenceMutationRepository {
  return {
    async createEvidence(input, actor, now, promote) {
      const promotion = { complete: false };
      return runSerializableTransaction(
        database,
        (transaction) => createEvidence(transaction, input, actor, now, promote, promotion),
      );
    },
    updateEvidence: (id, input, actor, now) => runSerializableTransaction(
      database,
      (transaction) => updateEvidence(transaction, id, input, actor, now),
    ),
    archiveEvidence: (id, input, actor, now) => runSerializableTransaction(
      database,
      (transaction) => archiveEvidence(transaction, id, input, actor, now),
    ),
    async recordAdministrativeDownload(id, actor, now) {
      await runSerializableTransaction(database, async (transaction) => {
        const record = await transaction.evidencia.findFirst({
          where: { id, deletedAt: null },
          select: evidenceRecordSelect,
        }) as EvidenceRecord | null;
        if (record !== null) {
          await writeAudit(transaction, "EVIDENCE_DOWNLOADED", record, actor, now);
        }
      });
    },
  };
}
