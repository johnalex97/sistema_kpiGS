import { describe, expect, it } from "vitest";
import { serializePerformanceCsv } from "../../src/performance-analytics/performance-analytics.csv.js";

describe("performance analytics CSV", () => {
  it("uses stable headers and RFC 4180 escaping without private fields", () => {
    const csv = serializePerformanceCsv({
      period: { periodStart: "2026-05-04", periodEnd: "2026-05-10" },
      generatedAt: "2026-05-11T12:00:00.000Z",
      rows: [{ technicianId: "private-id", code: "TEC-01", fullName: "Ana, \"Técnica\"\nPrincipal", overallScore: 76.5, completedJobs: 3, registeredMinutes: 120, productiveMinutes: 90, pausedMinutes: 30, attributableRecurrences: 1, recurrenceRate: 33.33, comparison: 2.5, dimensions: { productivity: 80, compliance: 90, efficiency: 75, quality: 61 }, alerts: [] }],
    });
    expect(csv).toContain("Código,Técnico,Puntaje general,Trabajos completados");
    expect(csv).toContain('TEC-01,"Ana, ""Técnica""\nPrincipal",76.50,3');
    expect(csv).not.toContain("private-id");
  });
});
