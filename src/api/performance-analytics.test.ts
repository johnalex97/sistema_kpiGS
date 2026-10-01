import { afterEach, describe, expect, it, vi } from "vitest";
import { createPerformanceAnalyticsApi } from "./performance-analytics";

afterEach(() => vi.unstubAllGlobals());

describe("performance analytics API", () => {
  it("encodes public filters and forwards AbortSignal", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { rows: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createPerformanceAnalyticsApi().getSummary({ granularity: "WEEK", periodStart: "2026-05-04", clientId: "a&b" }, signal);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("clientId=a%26b"), expect.objectContaining({ signal, credentials: "include" }));
  });

  it("downloads the CSV as a binary response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("codigo", { status: 200, headers: { "Content-Disposition": "attachment; filename=analisis.csv" } })));
    const file = await createPerformanceAnalyticsApi().exportCsv({ granularity: "WEEK", periodStart: "2026-05-04" });
    expect(file.filename).toBe("analisis.csv");
    expect(await file.blob.text()).toBe("codigo");
  });
});
