import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { runSerializableTransaction } from "../../src/activities/activities.mutation.repository.js";

function knownRequestError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("transaction failed", {
    code,
    clientVersion: "7.9.1",
    ...(meta !== undefined && { meta }),
  });
}

function postgresRawError(sqlState: string) {
  return knownRequestError("P2010", {
    driverAdapterError: {
      cause: {
        originalCode: sqlState,
        code: sqlState,
      },
    },
  });
}

function databaseThatRuns(
  transaction: ReturnType<typeof vi.fn>,
): PrismaClient {
  return { $transaction: transaction } as unknown as PrismaClient;
}

describe("activities serializable transaction runner", () => {
  it("retries a P2010 only when PostgreSQL reports the deadlock SQLSTATE", async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(postgresRawError("40P01"))
      .mockResolvedValueOnce("committed");

    await expect(runSerializableTransaction(
      databaseThatRuns(transaction),
      async () => "unused",
    )).resolves.toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("caps repeated P2010 deadlock retries at three attempts", async () => {
    const deadlock = postgresRawError("40P01");
    const transaction = vi.fn().mockRejectedValue(deadlock);

    await expect(runSerializableTransaction(
      databaseThatRuns(transaction),
      async () => "unused",
    )).rejects.toBe(deadlock);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("retries the observed P2010 PostgreSQL serialization SQLSTATE", async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(postgresRawError("40001"))
      .mockResolvedValueOnce("committed");

    await expect(runSerializableTransaction(
      databaseThatRuns(transaction),
      async () => "unused",
    )).resolves.toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry another P2010 database error", async () => {
    const constraintFailure = postgresRawError("23514");
    const transaction = vi.fn().mockRejectedValue(constraintFailure);

    await expect(runSerializableTransaction(
      databaseThatRuns(transaction),
      async () => "unused",
    )).rejects.toBe(constraintFailure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("continues retrying Prisma P2034 serialization conflicts", async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(knownRequestError("P2034"))
      .mockResolvedValueOnce("committed");

    await expect(runSerializableTransaction(
      databaseThatRuns(transaction),
      async () => "unused",
    )).resolves.toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
