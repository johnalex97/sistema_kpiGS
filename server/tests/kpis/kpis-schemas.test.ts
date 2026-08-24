import { describe, expect, it } from "vitest";
import { createKpiSchemas } from "../../src/kpis/kpis.schemas.js";

const schemas = createKpiSchemas(() => "2026-08-24");

describe("KPI management schemas", () => {
  it("accepts a complete Monday-Sunday weekly target", () => {
    expect(schemas.createTargetSchema.safeParse({
      technicianId: "11111111-1111-4111-8111-111111111111",
      periodStart: "2026-08-24",
      periodEnd: "2026-08-30",
      targetJobs: 10,
      targetProductiveMinutes: 1800,
      observation: "Meta semanal acordada",
    }).success).toBe(true);
  });

  it("rejects non-weekly periods and non-positive goals", () => {
    expect(schemas.createTargetSchema.safeParse({
      technicianId: "11111111-1111-4111-8111-111111111111",
      periodStart: "2026-08-25", periodEnd: "2026-08-30",
      targetJobs: 0, targetProductiveMinutes: -1,
    }).success).toBe(false);
  });

  it("accepts future versioned weights whose exact sum is one", () => {
    expect(schemas.createConfigurationSchema.safeParse({
      validFrom: "2026-08-31",
      productivityWeight: "0.2000",
      complianceWeight: "0.2500",
      efficiencyWeight: "0.2500",
      qualityWeight: "0.3000",
      description: "Mayor peso para calidad",
    }).success).toBe(true);
  });

  it("rejects current dates, out-of-range weights, and a sum unlike one", () => {
    const base = {
      validFrom: "2026-08-24", productivityWeight: "0.5000",
      complianceWeight: "0.2500", efficiencyWeight: "0.2500", qualityWeight: "0.3000",
    };
    expect(schemas.createConfigurationSchema.safeParse(base).success).toBe(false);
    expect(schemas.createConfigurationSchema.safeParse({ ...base, validFrom: "2026-08-31", productivityWeight: "1.1000" }).success).toBe(false);
  });

  it("requires a meaningful recalculation reason", () => {
    expect(schemas.recalculationReasonSchema.safeParse({ reason: "muy corto" }).success).toBe(false);
    expect(schemas.recalculationReasonSchema.safeParse({ reason: "Corrección validada por supervisión" }).success).toBe(true);
  });
});
