import { describe, expect, it, vi } from "vitest";
import { createKpiHistoryService } from "../../src/kpis/kpis.history.service.js";
const tech={id:"tech",code:"GS-01",fullName:"Ana",inactive:false};
const actor=(permissions:string[],technicianId:string|null=null)=>({userId:"u",technicianId,permissions,requestId:"r"});
const fixture=()=>({searchTechnicians:vi.fn(async()=>({items:[tech],pagination:{page:1,pageSize:20,totalItems:1,totalPages:1}})),findTechnician:vi.fn(async()=>tech),findResults:vi.fn(async()=>[])});
const service=(repo:Parameters<typeof createKpiHistoryService>[0]=fixture())=>createKpiHistoryService(repo,"America/Tegucigalpa",()=>new Date("2026-10-06T12:00:00Z"));
describe("history authorization service",()=>{
  it("returns bounded empty periods for a new technician",async()=>{
    const result=await service().getTrend("tech",{granularity:"WEEK"},actor(["KPI_VIEW_ALL"]));
    expect(result.referenceDate).toBe("2026-10-06"); expect(result.points).toHaveLength(12);
    expect(result.points.every(p=>p.status==="NO_DATA")).toBe(true);
  });
  it("rejects another identity before repository access",async()=>{
    const repo=fixture();
    await expect(service(repo).getTrend("other",{granularity:"WEEK"},actor(["KPI_VIEW_OWN"],"tech"))).rejects.toMatchObject({statusCode:404});
    expect(repo.findTechnician).not.toHaveBeenCalled(); expect(repo.findResults).not.toHaveBeenCalled();
  });
  it.each([actor([]),actor(["KPI_VIEW_OWN"])])("rejects missing permission or linked profile",async current=>{
    await expect(service().getTrend("tech",{granularity:"WEEK"},current)).rejects.toMatchObject({statusCode:403});
  });
  it("passes scoped paginated lookup and ALL takes precedence",async()=>{
    const repo=fixture();
    await service(repo).searchTechnicians({page:1,pageSize:20},actor(["KPI_VIEW_OWN"],"tech"));
    expect(repo.searchTechnicians).toHaveBeenLastCalledWith({page:1,pageSize:20},{kind:"TECHNICIAN",technicianId:"tech"});
    await service(repo).searchTechnicians({page:2,pageSize:10},actor(["KPI_VIEW_ALL","KPI_VIEW_OWN"],"tech"));
    expect(repo.searchTechnicians).toHaveBeenLastCalledWith({page:2,pageSize:10},{kind:"ALL"});
  });
  it("returns not found without reading results for missing identity",async()=>{
    const repo={...fixture(),findTechnician:vi.fn(async()=>null)};
    await expect(service(repo).getTrend("none",{granularity:"WEEK"},actor(["KPI_VIEW_ALL"]))).rejects.toMatchObject({statusCode:404});
    expect(repo.findResults).not.toHaveBeenCalled();
  });
});
