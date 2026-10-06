import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createKpiReadRepository } from "../../src/kpis/kpis.read.repository.js";
import { createKpiService } from "../../src/kpis/kpis.service.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

it("own and team previews credit the same share of a real shared order without exposing peers", async () => {
  const suffix = randomUUID().slice(0, 12);
  const fixture = await database.$transaction(async tx => {
    const branch = await tx.sucursalCliente.findFirstOrThrow({ where: { deletedAt: null } });
    const serviceType = await tx.tipoServicio.findFirstOrThrow();
    const activityType = await tx.tipoActividad.findFirstOrThrow();
    const a = await tx.tecnico.create({ data: { code: `QA-A-${suffix}`, fullName: "QA Ana" } });
    const b = await tx.tecnico.create({ data: { code: `QA-B-${suffix}`, fullName: "QA Luis" } });
    await tx.metaTecnico.createMany({ data: [a, b].map(tech => ({ tecnicoId: tech.id, periodStart: new Date("2026-08-24T00:00:00Z"), periodEnd: new Date("2026-08-30T00:00:00Z"), targetJobs: 10, targetProductiveMinutes: 100 })) });
    const order = await tx.ordenTrabajo.create({ data: { orderNumber: `QA-${suffix}`, sucursalId: branch.id, tipoServicioId: serviceType.id, status: "COMPLETED", reportedProblem: "QA participación compartida", startedAt: new Date("2026-08-25T12:00:00Z"), endedAt: new Date("2026-08-25T13:40:00Z"), diagnosis: "QA", result: "QA completado" } });
    const activity = await tx.actividad.create({ data: { ordenId: order.id, sucursalId: branch.id, tipoActividadId: activityType.id, status: "COMPLETED", description: "QA trabajo compartido", result: "Completado", startedAt: new Date("2026-08-25T12:00:00Z"), endedAt: new Date("2026-08-25T13:40:00Z"), productiveMinutes: 100, tecnicos: { create: [{ tecnicoId: a.id, role: "RESPONSIBLE", participationPercentage: "40.00" }, { tecnicoId: b.id, role: "PARTICIPANT", participationPercentage: "60.00" }] } } });
    return { a, b, order, activity };
  });
  try {
    const service = createKpiService(createKpiReadRepository(database), "America/Tegucigalpa");
    const context = { userId: randomUUID(), technicianId: fixture.a.id, requestId: randomUUID() };
    const own = await service.getDashboard({ periodStart: "2026-08-24", granularity: "WEEK" }, { ...context, permissions: ["KPI_VIEW_OWN"] });
    const team = await service.getDashboard({ periodStart: "2026-08-24", granularity: "WEEK" }, { ...context, technicianId: null, permissions: ["KPI_VIEW_ALL"] });
    const ownFacts = own.items[0] as { facts: { completedCredits: string } };
    const teamFacts = team.items.find(item => item.technicianId === fixture.a.id) as { facts: { completedCredits: string } };
    expect(ownFacts.facts.completedCredits).toBe("0.4000");
    expect(teamFacts.facts.completedCredits).toBe("0.4000");
    expect(own.items).toHaveLength(1);
    expect(JSON.stringify(own)).not.toContain(fixture.b.id);
    expect(JSON.stringify(own)).not.toContain("QA Luis");
  } finally {
    await database.actividadTecnico.deleteMany({ where: { actividadId: fixture.activity.id } });
    await database.actividad.delete({ where: { id: fixture.activity.id } });
    await database.ordenTrabajo.delete({ where: { id: fixture.order.id } });
    await database.metaTecnico.deleteMany({ where: { tecnicoId: { in: [fixture.a.id, fixture.b.id] } } });
    await database.tecnico.deleteMany({ where: { id: { in: [fixture.a.id, fixture.b.id] } } });
  }
});
