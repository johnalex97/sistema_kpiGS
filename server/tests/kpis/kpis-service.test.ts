import { describe, expect, it, vi } from "vitest";
import { createKpiService } from "../../src/kpis/kpis.service.js";
import type { KpiFactsRepository } from "../../src/kpis/kpis.repository.types.js";

const rows = {
  technicians: [
    { id: "a", code: "TEC-A", fullName: "Ana", targetJobs: 10 },
    { id: "b", code: "TEC-B", fullName: "Beto", targetJobs: null },
  ],
  weights: { productivity: "0.2000", compliance: "0.2500", efficiency: "0.2500", quality: "0.3000" },
  orders: [], activities: [], recurrences: [],
};

describe("KPI preview service", () => {
  it("calculates target-bearing technicians and warns about missing goals", async () => {
    const repository: KpiFactsRepository = { loadWeeklySources: vi.fn(async () => rows) };
    const service = createKpiService(repository, "America/Tegucigalpa");
    const result = await service.previewWeekly("2026-08-24", {
      userId: "user", technicianId: null, permissions: ["KPI_VIEW_ALL"], requestId: "request",
    });
    expect(result.status).toBe("PREVIEW");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ technicianId: "a", overallScore: "0.00" });
    expect(result.warnings).toEqual([{ code: "MISSING_TARGET", technicianId: "b" }]);
  });

  it("uses own scope and hides foreign technicians", async () => {
    const repository: KpiFactsRepository = { loadWeeklySources: vi.fn(async () => rows) };
    const service = createKpiService(repository, "America/Tegucigalpa");
    await service.previewWeekly("2026-08-24", {
      userId: "user", technicianId: "a", permissions: ["KPI_VIEW_OWN"], requestId: "request",
    });
    expect(repository.loadWeeklySources).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: "2026-08-24" }),
      { kind: "TECHNICIAN", technicianId: "a" },
    );
  });

  it("allows target management only with its explicit permission", async () => {
    const repository = {
      loadWeeklySources: vi.fn(async () => rows),
      listTargets: vi.fn(async () => []),
    };
    const service = createKpiService(repository, "America/Tegucigalpa");
    await service.listTargets("2026-08-24", {
      userId: "admin", technicianId: null, permissions: ["KPI_MANAGE_TARGETS"], requestId: "request",
    });
    await expect(service.listTargets("2026-08-24", {
      userId: "tech", technicianId: "a", permissions: ["KPI_VIEW_OWN"], requestId: "request",
    })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("allows configuration management only with its explicit permission", async () => {
    const repository = {
      loadWeeklySources: vi.fn(async () => rows),
      listConfigurations: vi.fn(async () => []),
    };
    const service = createKpiService(repository, "America/Tegucigalpa");
    await service.listConfigurations({
      userId: "admin", technicianId: null, permissions: ["KPI_MANAGE_CONFIGURATION"], requestId: "request",
    });
    await expect(service.listConfigurations({
      userId: "tech", technicianId: "a", permissions: ["KPI_VIEW_OWN"], requestId: "request",
    })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("requires the close permission and delegates an official weekly close", async () => {
    const closeWeek = vi.fn(async () => ({ kind: "CLOSED" as const, results: [], warnings: [] }));
    const service = createKpiService({ loadWeeklySources: vi.fn(async () => rows), closeWeek }, "America/Tegucigalpa");
    const actor = { userId: "admin", technicianId: null, permissions: ["KPI_CLOSE_WEEK"], requestId: "request" };
    await service.closeWeek("2026-08-24", actor);
    expect(closeWeek).toHaveBeenCalledWith(expect.objectContaining({
      week: expect.objectContaining({ periodStart: "2026-08-24" }), actor,
    }));
    await expect(service.closeWeek("2026-08-24", { ...actor, permissions: [] }))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});
