import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { verifyKpiPersistence } from "../../scripts/verify-kpis.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("KPI deterministic smoke verification", () => {
  it("checks configuration, weekly goals, permissions, revisions, and queue invariants", async () => {
    expect(await verifyKpiPersistence(database)).toEqual([
      "Configuración KPI vigente y ponderaciones válidas",
      "Metas semanales con periodos lunes-domingo",
      "Permisos KPI asignados por rol",
      "Revisiones actuales y cola durable consistentes",
    ]);
  });
});
