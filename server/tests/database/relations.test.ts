import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("seeded database relations", () => {
  it("keeps technicians with and without user accounts", async () => {
    expect(
      await database.tecnico.count({ where: { userId: null } }),
    ).toBeGreaterThan(0);
    expect(
      await database.tecnico.count({ where: { userId: { not: null } } }),
    ).toBeGreaterThan(0);
  });

  it("derives clients through work-order branches", async () => {
    const order = await database.ordenTrabajo.findUniqueOrThrow({
      where: { orderNumber: "GS-2026-0001" },
      include: { sucursal: { include: { cliente: true } } },
    });

    expect(order.sucursal.cliente.code).toBe("CLI-001");
  });

  it("stores primary and support order participants", async () => {
    const order = await database.ordenTrabajo.findUniqueOrThrow({
      where: { orderNumber: "GS-2026-0001" },
      include: { tecnicos: true },
    });

    expect(order.tecnicos.map(({ role }) => role).sort()).toEqual([
      "PRIMARY",
      "SUPPORT",
    ]);
  });

  it("stores activities with and without a work order", async () => {
    expect(
      await database.actividad.count({ where: { ordenId: null } }),
    ).toBeGreaterThan(0);
    expect(
      await database.actividad.count({ where: { ordenId: { not: null } } }),
    ).toBeGreaterThan(0);
  });

  it("distinguishes attributable and non-attributable recurrences", async () => {
    expect(
      await database.reincidenciaTecnico.count({
        where: { affectsQuality: true },
      }),
    ).toBeGreaterThan(0);
    expect(
      await database.reincidenciaTecnico.count({
        where: { affectsQuality: false },
      }),
    ).toBeGreaterThan(0);
  });

  it("keeps recurrence visits linked to later orders", async () => {
    const recurrence = await database.reincidencia.findUniqueOrThrow({
      where: { id: "60000000-0000-4000-8000-000000000001" },
      include: { ordenes: { include: { orden: true } } },
    });

    expect(recurrence.ordenes[0]?.orden.orderNumber).toBe("GS-2026-0002");
  });

  it("stores the approved initial KPI weights", async () => {
    const configuration = await database.configuracionKPI.findUniqueOrThrow({
      where: { version: 1 },
    });

    expect({
      productivity: configuration.productivityWeight.toString(),
      compliance: configuration.complianceWeight.toString(),
      efficiency: configuration.efficiencyWeight.toString(),
      quality: configuration.qualityWeight.toString(),
    }).toEqual({
      productivity: "0.3",
      compliance: "0.25",
      efficiency: "0.2",
      quality: "0.25",
    });
  });
});
