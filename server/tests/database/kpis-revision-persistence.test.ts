import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { seedIds } from "../../prisma/seed/constants.js";
import { createKpiCloseRepository } from "../../src/kpis/kpis.close.repository.js";
import { resolveWeek } from "../../src/kpis/kpis.period.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

const week = resolveWeek(new Date("2026-08-01T12:00:00.000Z"), "America/Tegucigalpa");
let originalState: { status: "OPEN" | "ANALYSIS" | "CORRECTION" | "CLOSED" | "DISMISSED"; version: number; closedAt: Date | null; closedById: string | null };
let attributableTechnicianId = "";

beforeAll(async () => {
  await seedDatabase(database);
  const recurrence = await database.reincidencia.findUniqueOrThrow({ where: { id: seedIds.recurrences.technical } });
  attributableTechnicianId = (await database.reincidenciaTecnico.findFirstOrThrow({
    where: { reincidenciaId: recurrence.id, affectsQuality: true },
  })).tecnicoId;
  originalState = { status: recurrence.status, version: recurrence.version, closedAt: recurrence.closedAt, closedById: recurrence.closedById };
  await database.solicitudRevisionKPI.deleteMany({ where: { reincidenciaId: recurrence.id } });
  await database.resultadoKPI.deleteMany({ where: { periodStart: new Date(`${week.periodStart}T00:00:00.000Z`) } });
});
afterAll(async () => {
  await database.solicitudRevisionKPI.deleteMany({ where: { reincidenciaId: seedIds.recurrences.technical } });
  await database.auditoria.deleteMany({ where: { entity: "resultado_kpi", action: { startsWith: "KPI_" } } });
  await database.resultadoKPI.deleteMany({ where: { periodStart: new Date(`${week.periodStart}T00:00:00.000Z`) } });
  await database.reincidencia.update({ where: { id: seedIds.recurrences.technical }, data: originalState });
  await disconnectTestDatabase();
});

describe("durable KPI recurrence revisions", () => {
  it("creates revision two once and preserves revision one", async () => {
    const admin = await database.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" } });
    const repository = createKpiCloseRepository(database, "America/Tegucigalpa");
    const actor = { userId: admin.id, technicianId: null, permissions: ["KPI_CLOSE_WEEK"], requestId: randomUUID() };
    const first = await repository.closeWeek({ week, actor });
    const qualityBefore = first.results.find(({ tecnicoId }) => tecnicoId === attributableTechnicianId)?.qualityScore?.toString();

    const recurrence = await database.reincidencia.update({
      where: { id: seedIds.recurrences.technical },
      data: { status: "CLOSED", closedAt: new Date("2026-08-10T12:00:00.000Z"), closedById: admin.id, version: { increment: 1 } },
    });
    await database.solicitudRevisionKPI.create({ data: {
      reincidenciaId: recurrence.id,
      recurrenceVersion: recurrence.version,
      originalOrderId: recurrence.originalOrderId,
      requestedById: admin.id,
    } });
    expect(await repository.processRevisionRequests(10, new Date("2026-08-10T13:00:00.000Z")))
      .toEqual({ processed: 1, failed: 0 });

    const versions = await database.resultadoKPI.findMany({
      where: { tecnicoId: attributableTechnicianId, periodStart: new Date(`${week.periodStart}T00:00:00.000Z`) },
      orderBy: { revision: "asc" },
    });
    expect(versions.map(({ revision, isCurrent }) => ({ revision, isCurrent })))
      .toEqual([{ revision: 1, isCurrent: false }, { revision: 2, isCurrent: true }]);
    expect(versions[1]?.qualityScore?.toString()).not.toBe(qualityBefore);
    expect(await repository.processRevisionRequests(10, new Date("2026-08-10T14:00:00.000Z")))
      .toEqual({ processed: 0, failed: 0 });
  });
});
