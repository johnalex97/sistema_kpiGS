import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "./http";
import { createOperationalDashboardApi } from "./dashboard";

afterEach(() => vi.unstubAllGlobals());

describe("operational dashboard API", () => {
  it("requests the dashboard without a date or with its encoded date and signal", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: {
      date: "2026-09-30", generatedAt: "2026-09-30T12:00:00.000Z",
      capabilities: { team: false, recentActivities: false, recurrences: false },
      team: [], recentActivities: [], recurrences: null,
    } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createOperationalDashboardApi();
    const controller = new AbortController();

    await api.getOperationalDashboard();
    await api.getOperationalDashboard("2026-09-30", controller.signal);

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/dashboard/operational");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("date=2026-09-30");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });

  it("propagates API failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      errors: [{ code: "FORBIDDEN", message: "Sin permiso" }],
    }), { status: 403 })));

    await expect(createOperationalDashboardApi().getOperationalDashboard())
      .rejects.toBeInstanceOf(ApiClientError);
  });
});
