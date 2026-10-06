import { expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createKpiManagementRepository } from "../../src/kpis/kpis.management.repository.js";
const input = { initialize: true, validFrom: "2026-10-05", productivityWeight: "0.2000", complianceWeight: "0.2500", efficiencyWeight: "0.2500", qualityWeight: "0.3000", qualityCriticalThreshold: "60.00", recurrenceCriticalThreshold: "10.00", productivityAttentionThreshold: "70.00", complianceAttentionThreshold: "70.00", efficiencyAttentionThreshold: "70.00" };
const actor = { userId: "admin", technicianId: null, permissions: [], requestId: "request" };
function repository(existing: boolean, results: number) {
  const stored: unknown[] = [];
  const tx = { $executeRaw: vi.fn(), configuracionKPI: { findFirst: async () => existing ? { id: "existing", version: 1 } : null, count: async () => existing ? 1 : 0, update: vi.fn(), create: async ({ data }: { data: unknown }) => { stored.push(data); return { id: "new", version: 1, validFrom: new Date("2026-10-05T00:00:00Z") }; } }, resultadoKPI: { count: async () => results }, auditoria: { create: vi.fn() } };
  const db = { $transaction: async (operation: (value: typeof tx) => unknown) => operation(tx) } as unknown as PrismaClient;
  return { api: createKpiManagementRepository(db), stored };
}
it("rejects initialization over an existing configuration without writes", async () => {
  const { api, stored } = repository(true, 0);
  await expect(api.createConfiguration(input, actor)).rejects.toMatchObject({ code: "KPI_INITIALIZATION_NOT_ALLOWED" });
  expect(stored).toHaveLength(0);
});
it("rejects initialization when official history exists even without configuration", async () => {
  const { api, stored } = repository(false, 1);
  await expect(api.createConfiguration(input, actor)).rejects.toMatchObject({ code: "KPI_INITIALIZATION_NOT_ALLOWED" });
  expect(stored).toHaveLength(0);
});
