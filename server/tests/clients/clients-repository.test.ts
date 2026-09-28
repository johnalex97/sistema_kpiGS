import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createClientsRepository } from "../../src/clients/clients.repository.js";

describe("clients repository contacts", () => {
  it("compone scope BRANCH con branchId sin sustituir el identificador específico", async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const database = {
      cliente: { findFirst: vi.fn(async () => ({ isActive: true, deletedAt: null })) },
      contactoCliente: { findMany, count },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    } as unknown as PrismaClient;
    const repository = createClientsRepository(database);
    const branchId = "10000000-0000-4000-8000-000000000001";
    await repository.listContacts("10000000-0000-4000-8000-000000000002", {
      scope: "BRANCH", branchId, page: 1, pageSize: 20, includeInactive: false,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sucursalId: branchId }) }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sucursalId: branchId }) }));
  });
});
