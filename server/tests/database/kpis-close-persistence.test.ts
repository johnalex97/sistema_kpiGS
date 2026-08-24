import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createKpiCloseRepository } from "../../src/kpis/kpis.close.repository.js";
import { resolveWeek } from "../../src/kpis/kpis.period.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const week = resolveWeek(new Date("2026-08-01T12:00:00.000Z"), "America/Tegucigalpa");

beforeAll(async () => {
  await seedDatabase(database);
  await database.resultadoKPI.deleteMany({ where: {
    periodStart: new Date(`${week.periodStart}T00:00:00.000Z`),
    periodEnd: new Date(`${week.periodEnd}T00:00:00.000Z`),
  } });
});
afterAll(async () => {
  await database.auditoria.deleteMany({ where: { entity: "resultado_kpi", action: { startsWith: "KPI_" } } });
  await database.resultadoKPI.deleteMany({ where: {
    periodStart: new Date(`${week.periodStart}T00:00:00.000Z`),
    periodEnd: new Date(`${week.periodEnd}T00:00:00.000Z`),
  } });
  await disconnectTestDatabase();
});

describe("weekly KPI close persistence", () => {
  it("persists revision one and returns unchanged for an identical repeated close", async () => {
    const admin = await database.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" } });
    const repository = createKpiCloseRepository(database, "America/Tegucigalpa");
    const actor = { userId: admin.id, technicianId: null, permissions: ["KPI_CLOSE_WEEK"], requestId: randomUUID() };

    expect(await database.resultadoKPI.count({ where: { periodStart: new Date(`${week.periodStart}T00:00:00.000Z`) } })).toBe(0);
    const first = await repository.closeWeek({ week, actor });
    expect(first.kind).toBe("CLOSED");
    expect(first.results.length).toBeGreaterThan(0);
    expect(first.results.every((result) => result.revision === 1 && result.isCurrent)).toBe(true);

    const repeated = await repository.closeWeek({ week, actor });
    expect(repeated.kind).toBe("UNCHANGED");
    expect(await database.resultadoKPI.count({ where: { periodStart: new Date(`${week.periodStart}T00:00:00.000Z`) } }))
      .toBe(first.results.length);
  });
});
