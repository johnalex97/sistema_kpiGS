import { Prisma } from "../../generated/prisma/client.js";
import { describe, expect, it } from "vitest";
import { mapKpiResult } from "../../src/kpis/kpis.mapper.js";

describe("KPI public mapper", () => {
  it("serializes decimals and dates without leaking database fields", () => {
    const mapped = mapKpiResult({
      id: "result", tecnicoId: "tech", configuracionId: "config",
      periodStart: new Date("2026-08-24T00:00:00.000Z"), periodEnd: new Date("2026-08-30T00:00:00.000Z"),
      completedCredits: new Prisma.Decimal("8.5"), eligibleCredits: new Prisma.Decimal("8.5"),
      onTimeEligibleCredits: new Prisma.Decimal("8"), attributableRecurrenceCredits: new Prisma.Decimal("1"),
      appliedTarget: 10, registeredMinutes: 600, productiveMinutes: 500,
      productivityScore: new Prisma.Decimal("85"), complianceScore: new Prisma.Decimal("94.12"),
      efficiencyScore: new Prisma.Decimal("83.33"), qualityScore: new Prisma.Decimal("88.24"), overallScore: new Prisma.Decimal("87.50"),
      productivityWeight: new Prisma.Decimal(".2"), complianceWeight: new Prisma.Decimal(".25"), efficiencyWeight: new Prisma.Decimal(".25"), qualityWeight: new Prisma.Decimal(".3"),
      productivityEffectiveWeight: new Prisma.Decimal(".2"), complianceEffectiveWeight: new Prisma.Decimal(".25"), efficiencyEffectiveWeight: new Prisma.Decimal(".25"), qualityEffectiveWeight: new Prisma.Decimal(".3"),
      complianceApplicability: "APPLICABLE", qualityApplicability: "APPLICABLE", revision: 1, isCurrent: true,
      calculationType: "OFFICIAL", calculationReason: null, calculatedById: null, previousResultId: null,
      calculationMetadata: { databaseUrl: "secret", orderIds: ["order"] }, calculatedAt: new Date("2026-08-31T01:00:00.000Z"),
    });
    expect(mapped).toMatchObject({ periodStart: "2026-08-24", completedCredits: "8.5000", overallScore: "87.50" });
    expect(mapped).not.toHaveProperty("configuracionId");
    expect(mapped).not.toHaveProperty("calculationMetadata.databaseUrl");
  });
});
