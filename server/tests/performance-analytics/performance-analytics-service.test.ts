import { describe, expect, it, vi } from "vitest";
import { createPerformanceAnalyticsService } from "../../src/performance-analytics/performance-analytics.service.js";

const snapshot = {
  technicians: [{ id: "tech-a", code: "TEC-01", fullName: "Ana" }, { id: "tech-b", code: "TEC-02", fullName: "Beto" }],
  orders: [{ id: "one", status: "COMPLETED", scheduledFor: new Date("2026-05-05T08:00:00.000Z"), endedAt: new Date("2026-05-05T09:00:00.000Z"), totalMinutes: 60 }],
  activities: [{ id: "one:tech-a", orderId: "one", technicianId: "tech-a", registeredMinutes: 60, productiveMinutes: 45, pausedMinutes: 15 }],
  recurrences: [{ id: "rec", originalOrderId: "one", technicianIds: ["tech-a"] }], officialResults: [], previousResults: [],
};

describe("performance analytics service", () => {
  it("returns an authorized preview with operational variables and no team average for own scope", async () => {
    const repository = { readSnapshot: vi.fn(async () => snapshot) };
    const service = createPerformanceAnalyticsService(repository as never, "America/Tegucigalpa", () => new Date("2026-05-11T12:00:00.000Z"));
    const result = await service.getSummary({ granularity: "WEEK", periodStart: "2026-05-04", clientId: "a12f3b45-c678-4d90-8123-456789abcdef" }, { userId: "user", technicianId: "tech-a", permissions: ["KPI_VIEW_OWN"], requestId: "request" });

    expect(result.status).toBe("PREVIEW");
    expect(result.teamAverage).toBeNull();
    expect(result.rows).toEqual([expect.objectContaining({ technicianId: "tech-a", completedJobs: 1, registeredMinutes: 60, productiveMinutes: 45, pausedMinutes: 15, attributableRecurrences: 1 })]);
    expect(repository.readSnapshot).toHaveBeenCalledWith(expect.objectContaining({ scope: { kind: "TECHNICIAN", technicianId: "tech-a" } }));
  });

  it("reuses the matching official result without treating it as a filtered result", async () => {
    const repository = { readSnapshot: vi.fn(async () => ({ ...snapshot, officialResults: [{
      tecnicoId: "tech-a", periodStart: new Date("2026-05-04T00:00:00.000Z"), periodEnd: new Date("2026-05-10T00:00:00.000Z"),
      productivityScore: { toFixed: () => "80.00" }, complianceScore: { toFixed: () => "90.00" }, efficiencyScore: { toFixed: () => "75.00" }, qualityScore: { toFixed: () => "61.00" }, overallScore: { toFixed: () => "76.50" },
      complianceApplicability: "APPLICABLE", qualityApplicability: "APPLICABLE",
    }], previousResults: [{ tecnicoId: "tech-a", overallScore: { toFixed: () => "70.00" } }] })) };
    const service = createPerformanceAnalyticsService(repository as never, "America/Tegucigalpa");
    const result = await service.getSummary({ granularity: "WEEK", periodStart: "2026-05-04" }, { userId: "admin", technicianId: null, permissions: ["KPI_VIEW_ALL"], requestId: "request" });

    expect(result.status).toBe("OFFICIAL");
    expect(result.rows[0]).toMatchObject({ overallScore: 76.5, comparison: 6.5, dimensions: { productivity: 80, compliance: 90, efficiency: 75, quality: 61 } });
    expect(result.teamAverage).toBe(76.5);
  });
});
