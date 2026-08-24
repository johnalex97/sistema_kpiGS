import { describe, expect, it } from "vitest";
import { buildWeeklyFacts } from "../../src/kpis/kpis.facts.js";

describe("weekly KPI fact allocation", () => {
  it("allocates one order and one recurrence by productive minutes", () => {
    const facts = buildWeeklyFacts({
      technicians: [
        { id: "a", code: "TEC-A", fullName: "A", targetJobs: 10 },
        { id: "b", code: "TEC-B", fullName: "B", targetJobs: 10 },
      ],
      weights: { productivity: "0.2000", compliance: "0.2500", efficiency: "0.2500", quality: "0.3000" },
      orders: [{ id: "order-1", scheduledFor: new Date("2026-08-29T18:00:00Z"), endedAt: new Date("2026-08-29T17:00:00Z") }],
      activities: [
        { id: "act-a", orderId: "order-1", technicianId: "a", registeredMinutes: 400, productiveMinutes: 360 },
        { id: "act-b", orderId: "order-1", technicianId: "b", registeredMinutes: 300, productiveMinutes: 240 },
      ],
      recurrences: [{ id: "rec-1", originalOrderId: "order-1", attributableTechnicianIds: ["a", "b"] }],
    });

    expect(facts.get("a")).toMatchObject({
      completedCredits: "0.6000", eligibleCredits: "0.6000",
      onTimeEligibleCredits: "0.6000", attributableRecurrenceCredits: "0.6000",
    });
    expect(facts.get("b")).toMatchObject({
      completedCredits: "0.4000", attributableRecurrenceCredits: "0.4000",
    });
  });

  it("assigns a full recurrence to the only attributable technician", () => {
    const facts = buildWeeklyFacts({
      technicians: [{ id: "a", code: "TEC-A", fullName: "A", targetJobs: 5 }],
      weights: { productivity: "0.2000", compliance: "0.2500", efficiency: "0.2500", quality: "0.3000" },
      orders: [{ id: "order-1", scheduledFor: null, endedAt: new Date("2026-08-29T17:00:00Z") }],
      activities: [{ id: "act-a", orderId: "order-1", technicianId: "a", registeredMinutes: 60, productiveMinutes: 60 }],
      recurrences: [{ id: "rec-1", originalOrderId: "order-1", attributableTechnicianIds: ["a"] }],
    });
    expect(facts.get("a")?.attributableRecurrenceCredits).toBe("1.0000");
  });
});
