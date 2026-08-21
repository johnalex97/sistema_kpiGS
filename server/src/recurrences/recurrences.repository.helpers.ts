import { Prisma } from "../../generated/prisma/client.js";
import type {
  EstadoOrden,
  EstadoReincidencia,
  PrismaClient,
} from "../../generated/prisma/client.js";

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;
const maximumSerializableAttempts = 3;

export interface RecurrenceSerializableTransactionOptions {
  maxAttempts?: number;
}

export interface LockedOrder {
  id: string;
  status: EstadoOrden;
  branchId: string;
  endedAt: Date | null;
  deletedAt: Date | null;
}

export interface LockedRecurrence {
  id: string;
  status: EstadoReincidencia;
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
  return sqlState === "40001" || sqlState === "40P01";
}

export async function runRecurrenceSerializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  options: RecurrenceSerializableTransactionOptions = {},
): Promise<T> {
  const attempts = Math.min(
    maximumSerializableAttempts,
    Math.max(1, Math.trunc(options.maxAttempts ?? maximumSerializableAttempts)),
  );
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await database.$transaction(operation, transactionOptions);
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2034" || isRetryablePostgresTransactionError(error));
      if (!retryable || attempt === attempts) throw error;
    }
  }
  throw new Error("Unreachable recurrence serializable transaction state");
}

export async function lockOrdersInOrder(
  transaction: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<LockedOrder[]> {
  const locked: LockedOrder[] = [];
  const orderedIds = [...new Set(ids)].sort((left, right) => left.localeCompare(right));
  for (const id of orderedIds) {
    const rows = await transaction.$queryRaw<Array<Omit<LockedOrder, "status"> & { status: string }>>`
      SELECT
        "id",
        "status",
        "sucursal_id" AS "branchId",
        "ended_at" AS "endedAt",
        "deleted_at" AS "deletedAt"
      FROM "orden_trabajo"
      WHERE "id" = ${id}::uuid
      FOR UPDATE
    `;
    if (rows[0] !== undefined) {
      locked.push({
        ...rows[0],
        status: rows[0].status.toUpperCase() as EstadoOrden,
      });
    }
  }
  return locked;
}

export async function lockRecurrence(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<LockedRecurrence | null> {
  const rows = await transaction.$queryRaw<Array<Omit<LockedRecurrence, "status"> & { status: string }>>`
    SELECT "id", "status", "version"
    FROM "reincidencia"
    WHERE "id" = ${id}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : { ...row, status: row.status.toUpperCase() as EstadoReincidencia };
}
