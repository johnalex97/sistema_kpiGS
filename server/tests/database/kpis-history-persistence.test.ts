import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createKpiCloseRepository } from "../../src/kpis/kpis.close.repository.js";
import { resolveWeek } from "../../src/kpis/kpis.period.js";
import { createKpiReadRepository } from "../../src/kpis/kpis.read.repository.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const week = resolveWeek(new Date("2026-08-01T12:00:00.000Z"), "America/Tegucigalpa");
beforeAll(async () => {
  await seedDatabase(database);
  await database.resultadoKPI.deleteMany({ where: { periodStart: new Date(`${week.periodStart}T00:00:00.000Z`) } });
});
afterAll(async () => {
  await database.auditoria.deleteMany({ where: { entity: "resultado_kpi", action: { startsWith: "KPI_" } } });
  await database.resultadoKPI.deleteMany({ where: { periodStart: new Date(`${week.periodStart}T00:00:00.000Z`) } });
  await disconnectTestDatabase();
});

describe("KPI official history persistence", () => {
  it("reads current weekly snapshots and immutable versions", async () => {
    const admin = await database.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" } });
    await createKpiCloseRepository(database, "America/Tegucigalpa").closeWeek({
      week, actor: { userId: admin.id, technicianId: null, permissions: [], requestId: randomUUID() },
    });
    const repository = createKpiReadRepository(database);
    const current = await repository.findCurrentResults({ periodStart: week.periodStart, granularity: "WEEK" }, { kind: "ALL" });
    expect(current.length).toBeGreaterThan(0);
    expect(current.every(({ isCurrent }) => isCurrent)).toBe(true);
    const versions = await repository.findVersions(week, { kind: "ALL" });
    expect(versions).toHaveLength(current.length);
    const own = await repository.findTechnicianHistory(current[0]!.tecnicoId, { kind: "TECHNICIAN", technicianId: current[0]!.tecnicoId });
    expect(own.map(({ tecnicoId }) => tecnicoId)).toEqual([current[0]!.tecnicoId]);
  });
});
