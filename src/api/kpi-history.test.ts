import { afterEach, describe,expect,it,vi } from "vitest";
import { createKpiHistoryApi } from "./kpi-history";
import { historyFixture } from "./kpi-history.fixture";
afterEach(()=>vi.unstubAllGlobals());
describe("history API",()=>{
  it("accepts official zero quality without turning it into missing data", async () => {
    const data = { ...historyFixture, points: historyFixture.points.map(p => p.status === "NO_DATA" ? p : { ...p, scores: { ...p.scores, quality: "0.00" } }) };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data }))));
    expect((await createKpiHistoryApi().getTrend("a", { granularity: "WEEK" })).points[0]?.scores.quality).toBe("0.00");
  });
  it("encodes authorized search, period and abort signal",async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({data:historyFixture}),{status:200}));vi.stubGlobal("fetch",fetchMock);
    const signal=new AbortController().signal;
    const data=await createKpiHistoryApi().getTrend("a",{granularity:"WEEK",endDate:"2026-10-06"},signal);
    expect(data.points[11]?.scores.overall).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/kpis/technicians/a/trend?granularity=WEEK&endDate=2026-10-06"),expect.objectContaining({credentials:"include",signal}));
    fetchMock.mockImplementationOnce(async()=>new Response(JSON.stringify({data:{items:[historyFixture.technician],pagination:{page:1,pageSize:20,totalItems:1,totalPages:1}}})));
    await createKpiHistoryApi().searchTechnicians({search:"Ana López",page:1,pageSize:20},signal);
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("search=Ana+L%C3%B3pez"),expect.objectContaining({signal}));
  });
  it.each([{}, {...historyFixture,points:[{...historyFixture.points[0],scores:{overall:"NaN"}}]}, {...historyFixture,points:[]}, {...historyFixture,technician:{...historyFixture.technician,id:"other"}}])("rejects incomplete or mismatched series",async data=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({data}))));
    await expect(createKpiHistoryApi().getTrend("a",{granularity:"WEEK"})).rejects.toThrow(/historial/i);
  });
});
