import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerformanceAnalyticsRepository } from "../../src/performance-analytics/performance-analytics.repository.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";
import { createActivitiesReadFixture, removeActivitiesReadFixture, type ActivitiesReadFixture } from "./activities-test-data.js";

describe("performance analytics persistence", () => {
  let fixture: ActivitiesReadFixture;
  let activityId: string;

  beforeAll(async () => {
    fixture = await createActivitiesReadFixture(database);
    await database.ordenTrabajo.update({ where: { id: fixture.primaryOrderId }, data: { status: "COMPLETED", endedAt: new Date("2026-08-06T15:00:00.000Z") } });
    const activity = await database.actividad.create({
      data: {
        sucursalId: fixture.primaryBranchId, ordenId: fixture.primaryOrderId, tipoActividadId: fixture.primaryTypeId,
        status: "COMPLETED", description: "Actividad de análisis", startedAt: new Date("2026-08-06T12:00:00.000Z"), endedAt: new Date("2026-08-06T14:00:00.000Z"), productiveMinutes: 80,
        tecnicos: { create: [{ tecnicoId: fixture.technicianId, role: "RESPONSIBLE", participationPercentage: 50 }, { tecnicoId: fixture.foreignTechnicianId, role: "PARTICIPANT", participationPercentage: 50 }] },
        pausas: { create: [{ startedAt: new Date("2026-08-06T12:20:00.000Z"), endedAt: new Date("2026-08-06T12:20:40.000Z"), reason: "Pausa 1" }, { startedAt: new Date("2026-08-06T13:00:00.000Z"), endedAt: new Date("2026-08-06T13:00:40.000Z"), reason: "Pausa 2" }] },
      },
    });
    activityId = activity.id;
  });

  afterAll(async () => {
    await database.pausaActividad.deleteMany({ where: { actividadId: activityId } });
    await database.actividadTecnico.deleteMany({ where: { actividadId: activityId } });
    await database.actividad.deleteMany({ where: { id: activityId } });
    await removeActivitiesReadFixture(database, fixture);
    await disconnectTestDatabase();
  });

  it("keeps only own partial facts and rounds captured pause duration once per activity", async () => {
    const snapshot = await createPerformanceAnalyticsRepository(database).readSnapshot({
      query: { granularity: "WEEK", periodStart: "2026-08-03" },
      period: { granularity: "WEEK", periodStart: "2026-08-03", periodEnd: "2026-08-09", startInclusive: new Date("2026-08-03T06:00:00.000Z"), endExclusive: new Date("2026-08-10T06:00:00.000Z") },
      scope: { kind: "TECHNICIAN", technicianId: fixture.technicianId },
    });

    expect(snapshot.technicians.map(({ id }) => id)).toEqual([fixture.technicianId]);
    expect(snapshot.activities).toEqual([expect.objectContaining({ technicianId: fixture.technicianId, registeredMinutes: 60, productiveMinutes: 40, pausedMinutes: 1 })]);
    expect(snapshot.orders.map(({ id }) => id)).toEqual([fixture.primaryOrderId]);
  });
});
