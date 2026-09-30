import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDashboardReadRepository } from "../../src/dashboard/dashboard.repository.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";
import {
  createActivitiesReadFixture,
  removeActivitiesReadFixture,
  type ActivitiesReadFixture,
} from "./activities-test-data.js";

describe("dashboard persistence", () => {
  let fixture: ActivitiesReadFixture;

  beforeAll(async () => {
    fixture = await createActivitiesReadFixture(database);
  });
  afterEach(async () => {
    await database.reincidencia.deleteMany({ where: { originalOrderId: { in: [fixture.primaryOrderId, fixture.secondaryOrderId] } } });
  });
  afterAll(async () => {
    await removeActivitiesReadFixture(database, fixture);
    await disconnectTestDatabase();
  });

  it("keeps only own activities that started during the Honduras day", async () => {
    const snapshot = await createDashboardReadRepository(database).readOperationalDashboard({
      start: new Date("2026-08-01T06:00:00.000Z"),
      end: new Date("2026-08-02T06:00:00.000Z"),
      generatedAt: new Date("2026-08-01T12:00:00.000Z"),
      activityTechnicianId: fixture.technicianId,
      recurrenceTechnicianId: null,
      includeTeam: false,
      includeRecurrences: false,
    });

    expect(snapshot.activities.map((activity) => (activity as { id: string }).id))
      .toEqual([fixture.runningActivityId]);
  });
});
