import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import { seedDatabase } from "../../prisma/seed.js";
import { createKpiManagementRepository } from "../../src/kpis/kpis.management.repository.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";
beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);
const input = { initialize: true, validFrom: "2026-10-05", productivityWeight: "0.2000", complianceWeight: "0.2500", efficiencyWeight: "0.2500", qualityWeight: "0.3000", qualityCriticalThreshold: "60.00", recurrenceCriticalThreshold: "10.00", productivityAttentionThreshold: "70.00", complianceAttentionThreshold: "70.00", efficiencyAttentionThreshold: "70.00" };
it("creates the first audited configuration in an empty KPI database and rejects a second initialization", async () => {
  const rollback = new Error("Rollback isolated test fixture");
  const originalCount = await database.configuracionKPI.count();
  await expect(database.$transaction(async tx => {
    // Changes remain inside this transaction, which always rolls back; seed/history is preserved.
    await tx.resultadoKPI.deleteMany();
    await tx.configuracionKPI.deleteMany();
    const admin = await tx.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" } });
    const actor = { userId: admin.id, technicianId: null, permissions: [], requestId: randomUUID() };
    const adapter = { $transaction: (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx) } as unknown as PrismaClient;
    const repository = createKpiManagementRepository(adapter);
    const created = await repository.createConfiguration(input, actor);
    expect(created.version).toBe(1);
    expect(created.validFrom.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(await tx.auditoria.count({ where: { entityId: created.id, action: "KPI_CONFIGURATION_CREATED" } })).toBe(1);
    await expect(repository.createConfiguration(input, actor)).rejects.toMatchObject({ code: "KPI_INITIALIZATION_NOT_ALLOWED" });
    expect(await tx.configuracionKPI.count()).toBe(1);
    throw rollback;
  })).rejects.toBe(rollback);
  expect(await database.configuracionKPI.count()).toBe(originalCount);
});
