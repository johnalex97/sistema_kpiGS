import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, createKpiApi } from "./kpis";

afterEach(() => vi.unstubAllGlobals());

describe("KPI API client", () => {
  it("rechaza respuestas incompletas en lugar de presentar una meta falsa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { items: [] } }), { status: 200 })));
    await expect(createKpiApi().getDashboard({ periodStart: "2026-10-05", granularity: "WEEK" })).rejects.toThrow("respuesta KPI");
  });
  it("normaliza los hechos de la semana abierta para mostrar metas y créditos reales", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: {
      status: "PREVIEW", periodStart: "2026-10-05", periodEnd: "2026-10-11", warnings: [], capabilities: {},
      items: [{ technicianId: "t1", code: "GS-1", fullName: "Ana", overallScore: "50.00",
        scores: { productivity: "40.00", compliance: null, efficiency: "60.00", quality: null },
        facts: { completedCredits: "4.0000", targetJobs: 10, registeredMinutes: 100, productiveMinutes: 60,
          weights: { productivity: "0.2", compliance: "0.25", efficiency: "0.25", quality: "0.3" } } }],
    } }), { status: 200 })));
    const result = await createKpiApi().getDashboard({ periodStart: "2026-10-05", granularity: "WEEK" });
    expect(result.items[0]).toMatchObject({ completedCredits: "4.0000", appliedTarget: 10, productivityScore: "40.00", efficiencyScore: "60.00", periodStart: "2026-10-05" });
  });
  it("sends credentials and encoded period filters", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: "OFFICIAL", items: [], warnings: [], capabilities: {} } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createKpiApi().getDashboard({ periodStart: "2026-08-01", granularity: "MONTH", workStatus: "IN PROGRESS" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("workStatus=IN+PROGRESS"), expect.objectContaining({ credentials: "include" }));
  });

  it("maps non-success responses to ApiClientError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ code: "FORBIDDEN", message: "Sin permiso" }] }), { status: 403 })));
    await expect(createKpiApi().getDashboard({ periodStart: "2026-08-24", granularity: "WEEK" }))
      .rejects.toBeInstanceOf(ApiClientError);
  });
});
