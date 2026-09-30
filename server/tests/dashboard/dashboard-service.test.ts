import { describe, expect, it, vi } from "vitest";
import { createDashboardService } from "../../src/dashboard/dashboard.service.js";

describe("dashboard service", () => {
  it("keeps recurrence data absent when the actor cannot view recurrences", async () => {
    const repository = {
      readOperationalDashboard: vi.fn(async () => ({
        team: [],
        activities: [],
        recurrences: [{ id: "private-case" }],
      })),
    };
    const service = createDashboardService(repository as never, "America/Tegucigalpa", () => new Date("2026-09-30T12:00:00.000Z"));

    const dashboard = await service.getOperationalDashboard(
      { date: "2026-09-30" },
      {
        userId: "user-1", technicianId: null,
        permissions: ["KPI_VIEW_ALL", "TECHNICIANS_VIEW", "ACTIVITIES_VIEW_ALL"],
        requestId: "request-1",
      },
    );

    expect(dashboard.capabilities.recurrences).toBe(false);
    expect(dashboard.recurrences).toBeNull();
    expect(repository.readOperationalDashboard).toHaveBeenCalledWith(expect.objectContaining({
      includeRecurrences: false,
    }));
  });
});
