import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, createKpiApi } from "./kpis";

afterEach(() => vi.unstubAllGlobals());

describe("KPI API client", () => {
  it("sends credentials and encoded period filters", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: "OFFICIAL", items: [] } }), { status: 200 }));
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
