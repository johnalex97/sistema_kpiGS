import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../api/http";
import { usePerformanceAnalytics } from "./usePerformanceAnalytics";

const query = { granularity: "WEEK" as const, periodStart: "2026-05-04" };
const summary = { status: "PREVIEW" as const, period: { granularity: "WEEK", periodStart: "2026-05-04", periodEnd: "2026-05-10" }, generatedAt: "2026-05-11T12:00:00.000Z", teamAverage: null, rows: [{ technicianId: "tech", code: "TEC-01", fullName: "Ana", overallScore: null, comparison: null, completedJobs: 0, registeredMinutes: 0, productiveMinutes: 0, pausedMinutes: 0, attributableRecurrences: 0, recurrenceRate: null, dimensions: { productivity: null, compliance: null, efficiency: null, quality: null }, alerts: [] }] };

describe("usePerformanceAnalytics", () => {
  it("loads data and preserves it while a retry refreshes", async () => {
    const api = { getSummary: vi.fn(async () => summary), exportCsv: vi.fn() };
    const { result } = renderHook(() => usePerformanceAnalytics(api, query));
    await waitFor(() => expect(result.current.state.status).toBe("success"));
    act(() => result.current.retry());
    expect(result.current.state).toMatchObject({ status: "loading", data: summary });
  });

  it("clears prior data when access is revoked", async () => {
    const api = { getSummary: vi.fn().mockResolvedValueOnce(summary).mockRejectedValueOnce(new ApiClientError(403, "FORBIDDEN", "Sin permiso")), exportCsv: vi.fn() };
    const { result } = renderHook(() => usePerformanceAnalytics(api, query));
    await waitFor(() => expect(result.current.state.status).toBe("success"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state).not.toHaveProperty("data");
  });
});
