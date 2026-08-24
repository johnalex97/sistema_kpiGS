import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createKpiManagementRepository } from "../../src/kpis/kpis.management.repository.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("KPI management persistence", () => {
  it("creates and updates a Monday-Sunday target with audit records", async () => {
    const repository = createKpiManagementRepository(database);
    const [technician, admin] = await Promise.all([
      database.tecnico.findFirstOrThrow({ where: { deletedAt: null } }),
      database.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" } }),
    ]);
    const actor = { userId: admin.id, technicianId: null, permissions: [], requestId: randomUUID() };
    const existing = await database.metaTecnico.findUnique({ where: { tecnicoId_periodStart_periodEnd: {
      tecnicoId: technician.id,
      periodStart: new Date("2030-01-07T00:00:00.000Z"),
      periodEnd: new Date("2030-01-13T00:00:00.000Z"),
    } } });
    if (existing) {
      await database.auditoria.deleteMany({ where: { entity: "meta_tecnico", entityId: existing.id } });
      await database.metaTecnico.delete({ where: { id: existing.id } });
    }

    const created = await repository.createTarget({
      technicianId: technician.id,
      periodStart: "2030-01-07",
      periodEnd: "2030-01-13",
      targetJobs: 8,
      targetProductiveMinutes: 1200,
      observation: "Objetivo inicial",
    }, actor) as { id: string };
    await repository.updateTarget(created.id, {
      targetJobs: 9,
      targetProductiveMinutes: 1300,
      observation: "Objetivo revisado",
    }, actor);

    expect(await database.metaTecnico.findUniqueOrThrow({ where: { id: created.id } }))
      .toMatchObject({ targetJobs: 9, targetProductiveMinutes: 1300, observation: "Objetivo revisado" });
    expect(await database.auditoria.count({ where: { entity: "meta_tecnico", entityId: created.id } })).toBe(2);

    await database.auditoria.deleteMany({ where: { entity: "meta_tecnico", entityId: created.id } });
    await database.metaTecnico.delete({ where: { id: created.id } });
  });

  it("creates a consecutive configuration version and rejects overlap", async () => {
    const repository = createKpiManagementRepository(database);
    const admin = await database.usuario.findUniqueOrThrow({ where: { email: "admin.demo@geeksolution.example.test" } });
    const actor = { userId: admin.id, technicianId: null, permissions: [], requestId: randomUUID() };
    const previous = await database.configuracionKPI.findFirstOrThrow({ orderBy: { version: "desc" } });
    const originalValidTo = previous.validTo;
    const created = await repository.createConfiguration({
      validFrom: "2099-01-05",
      productivityWeight: "0.2000",
      complianceWeight: "0.2500",
      efficiencyWeight: "0.2500",
      qualityWeight: "0.3000",
      description: "Configuración futura de prueba",
    }, actor) as { id: string; version: number };

    expect(created.version).toBe(previous.version + 1);
    await expect(repository.createConfiguration({
      validFrom: "2099-01-05",
      productivityWeight: "0.2000",
      complianceWeight: "0.2500",
      efficiencyWeight: "0.2500",
      qualityWeight: "0.3000",
    }, actor)).rejects.toMatchObject({ code: "KPI_CONFIGURATION_OVERLAP" });

    await database.auditoria.deleteMany({ where: { entity: "configuracion_kpi", entityId: created.id } });
    await database.configuracionKPI.delete({ where: { id: created.id } });
    await database.configuracionKPI.update({ where: { id: previous.id }, data: { validTo: originalValidTo } });
  });
});
