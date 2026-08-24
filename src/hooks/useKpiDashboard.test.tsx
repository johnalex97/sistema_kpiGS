import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKpiDashboard } from "./useKpiDashboard";

describe("useKpiDashboard", () => {
  it("loads, navigates weekly, and retries an error", async () => {
    const getDashboard = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ status: "OFFICIAL", items: [], warnings: [], capabilities: {} });
    const api = { getDashboard } as never;
    const { result } = renderHook(() => useKpiDashboard(api, { periodStart: "2026-08-24", granularity: "WEEK" }));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("empty"));
    act(() => result.current.previous());
    expect(result.current.period.periodStart).toBe("2026-08-17");
  });
});
