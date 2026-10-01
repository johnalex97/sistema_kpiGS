import { describe, expect, it, vi } from "vitest";
import { createPerformanceAnalyticsService } from "../../src/performance-analytics/performance-analytics.service.js";

const snapshot = {
  technicians: [{ id: "tech-a", code: "TEC-01", fullName: "Ana" }, { id: "tech-b", code: "TEC-02", fullName: "Beto" }],
  orders: [{ id: "one", status: "COMPLETED", scheduledFor: new Date("2026-05-05T08:00:00.000Z"), endedAt: new Date("2026-05-05T09:00:00.000Z"), totalMinutes: 60 }],
  activities: [{ id: "one:tech-a", orderId: "one", technicianId: "tech-a", registeredMinutes: 60, productiveMinutes: 45, pausedMinutes: 15 }],
  recurrences: [{ id: "rec", originalOrderId: "one", technicianIds: ["tech-a"] }], officialResults: [], previousResults: [],
};

const decimal = (value: string) => ({ toFixed: () => value });

function officialWeek(periodStart: string, periodEnd: string) {
  return {
    tecnicoId: "tech-a", periodStart: new Date(`${periodStart}T00:00:00.000Z`), periodEnd: new Date(`${periodEnd}T00:00:00.000Z`),
    appliedTarget: 10, completedCredits: decimal("8.0000"), eligibleCredits: decimal("10.0000"), onTimeEligibleCredits: decimal("9.0000"),
    registeredMinutes: 100, productiveMinutes: 70, attributableRecurrenceCredits: decimal("2.0000"),
    productivityScore: decimal("80.00"), complianceScore: decimal("90.00"), efficiencyScore: decimal("70.00"), qualityScore: decimal("75.00"), overallScore: decimal("78.00"),
    complianceApplicability: "APPLICABLE", qualityApplicability: "APPLICABLE", revision: 1, isCurrent: true,
  };
}

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
      ...officialWeek("2026-05-04", "2026-05-10"), efficiencyScore: decimal("75.00"), qualityScore: decimal("61.00"), overallScore: decimal("76.50"),
    }], previousResults: [{ tecnicoId: "tech-a", overallScore: { toFixed: () => "70.00" } }] })) };
    const service = createPerformanceAnalyticsService(repository as never, "America/Tegucigalpa");
    const result = await service.getSummary({ granularity: "WEEK", periodStart: "2026-05-04" }, { userId: "admin", technicianId: null, permissions: ["KPI_VIEW_ALL"], requestId: "request" });

    expect(result.status).toBe("OFFICIAL");
    expect(result.rows[0]).toMatchObject({ overallScore: 76.5, comparison: 6.5, dimensions: { productivity: 80, compliance: 90, efficiency: 70, quality: 75 }, officialFacts: { appliedTarget: 10, completedCredits: 8, eligibleCredits: 10, onTimeEligibleCredits: 9, attributableRecurrenceCredits: 2, coverage: "1/1" } });
    expect(result.teamAverage).toBe(76.5);
  });

  it("does not turn unknown productive time into a false zero-efficiency alert", async () => {
    const repository = { readSnapshot: vi.fn(async () => ({ ...snapshot, activities: [{ ...snapshot.activities[0], productiveMinutes: null }] })) };
    const service = createPerformanceAnalyticsService(repository as never, "America/Tegucigalpa");
    const result = await service.getSummary({ granularity: "WEEK", periodStart: "2026-05-04", clientId: "a12f3b45-c678-4d90-8123-456789abcdef" }, { userId: "user", technicianId: "tech-a", permissions: ["KPI_VIEW_OWN"], requestId: "request" });
    expect(result.rows[0]?.dimensions.efficiency).toBe(100);
    expect(result.rows[0]?.alerts.some(({ code }) => code === "EFFICIENCY_LOW")).toBe(false);
  });

  it("counts a completed order assigned to the technician even when its activity predates the period", async () => {
    const repository = { readSnapshot: vi.fn(async () => ({
      ...snapshot,
      orders: [{ ...snapshot.orders[0], technicianIds: ["tech-a"] }],
      activities: [{ ...snapshot.activities[0], orderId: null }],
    })) };
    const service = createPerformanceAnalyticsService(repository as never, "America/Tegucigalpa");
    const result = await service.getSummary({ granularity: "WEEK", periodStart: "2026-05-04", clientId: "a12f3b45-c678-4d90-8123-456789abcdef" }, { userId: "user", technicianId: "tech-a", permissions: ["KPI_VIEW_OWN"], requestId: "request" });

    expect(result.rows[0]?.completedJobs).toBe(1);
  });

  it("consolidates the closed official weeks when reviewing a complete month", async () => {
    const repository = { readSnapshot: vi.fn(async () => ({ ...snapshot, officialResults: [
      officialWeek("2026-04-27", "2026-05-03"), officialWeek("2026-05-04", "2026-05-10"), officialWeek("2026-05-11", "2026-05-17"), officialWeek("2026-05-18", "2026-05-24"), officialWeek("2026-05-25", "2026-05-31"),
    ] })) };
    const service = createPerformanceAnalyticsService(repository as never, "America/Tegucigalpa");
    const result = await service.getSummary({ granularity: "MONTH", periodStart: "2026-05-01" }, { userId: "admin", technicianId: null, permissions: ["KPI_VIEW_ALL"], requestId: "request" });

    expect(result.status).toBe("OFFICIAL");
    expect(result.rows[0]).toMatchObject({ overallScore: 78, dimensions: { productivity: 80, compliance: 90, efficiency: 70, quality: 75 } });
  });
});
