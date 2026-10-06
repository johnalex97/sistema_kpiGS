import { act,renderHook,waitFor } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
import { useKpiHistory } from "./useKpiHistory";
import { historyFixture } from "../api/kpi-history.fixture";
import type { HistorySeries } from "../models/kpi-history";
describe("history request identity",()=>{
  it("aborts on unmount and ignores resolution from a transport that does not honor abort", async () => {
    let resolve!: (data: HistorySeries) => void;
    const api = { getTrend: vi.fn((_id: string, _query: unknown, _signal?: AbortSignal) => { void _id; void _query; void _signal; return new Promise<HistorySeries>(r => { resolve = r; }); }), searchTechnicians: vi.fn() };
    const { unmount } = renderHook(() => useKpiHistory(api, "a", { granularity: "WEEK" }, "u"));
    const signal = api.getTrend.mock.calls[0]?.[2];
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(historyFixture));
  });
  it("does not request without a selection",()=>{
    const api={getTrend:vi.fn(),searchTechnicians:vi.fn()};
    const {result}=renderHook(()=>useKpiHistory(api,null,{granularity:"WEEK"},"u"));
    expect(result.current.state.status).toBe("idle");expect(api.getTrend).not.toHaveBeenCalled();
  });
  it("ignores late responses and clears prior data on identity or session changes",async()=>{
    let resolveA!:(data:HistorySeries)=>void;
    const api={getTrend:vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolveA=r;})).mockResolvedValue({...historyFixture,technician:{...historyFixture.technician,id:"b"}}),searchTechnicians:vi.fn()};
    const {result,rerender}=renderHook(({id,session})=>useKpiHistory(api,id,{granularity:"WEEK"} ,session),{initialProps:{id:"a",session:"u"}});
    rerender({id:"b",session:"u"});await waitFor(()=>expect(result.current.state.status).toBe("success"));
    await act(async()=>resolveA(historyFixture));
    expect(result.current.state.data?.technician.id).toBe("b");
    api.getTrend.mockImplementation(()=>new Promise(()=>{}));
    rerender({id:"b",session:"v"});
    expect(result.current.state.status).toBe("loading");expect(result.current.state.data).toBeUndefined();
  });
  it("retries errors without retaining a previous period",async()=>{
    const api={getTrend:vi.fn().mockResolvedValueOnce(historyFixture).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(historyFixture),searchTechnicians:vi.fn()};
    const {result,rerender}=renderHook(({endDate})=>useKpiHistory(api,"a",{granularity:"WEEK",endDate},"u"),{initialProps:{endDate:"2026-10-06"}});
    await waitFor(()=>expect(result.current.state.status).toBe("success"));
    rerender({endDate:"2026-10-05"});await waitFor(()=>expect(result.current.state.status).toBe("error"));
    expect(result.current.state.data).toBeUndefined();
    act(()=>result.current.retry());await waitFor(()=>expect(result.current.state.status).toBe("success"));
    expect(api.getTrend).toHaveBeenLastCalledWith("a",{granularity:"WEEK",endDate:"2026-10-05"},expect.any(AbortSignal));
  });
});
