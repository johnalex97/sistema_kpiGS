import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../../src/auth/auth.service.js";
import { createKpiRouter } from "../../src/kpis/kpis.routes.js";
import { parseEnvironment } from "../../src/config/env.js";
const id="11111111-1111-4111-8111-111111111111";
const env=parseEnvironment({NODE_ENV:"test",LOG_LEVEL:"silent",CORS_ORIGIN:"http://localhost:5173",DATABASE_URL:"postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",DATABASE_TEST_URL:"postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test"});
function fixture(permissions=["KPI_VIEW_ALL"], mustChangePassword=false){
  const tech={id,code:"GS-01",fullName:"Ana",status:"AVAILABLE",deletedAt:null};
  const database={tecnico:{findMany:vi.fn(async()=>[tech]),count:vi.fn(async()=>1),findFirst:vi.fn(async()=>tech)},resultadoKPI:{findMany:vi.fn(async()=>[])}};
  const auth={authenticate:vi.fn(async()=>({id:"u",userId:"u",sessionId:"s",email:"u@example.test",displayName:"Usuario",roles:[],permissions,mustChangePassword,technicianId:id}))};
  const close={closeWeek:vi.fn(),recalculateWeek:vi.fn(),processRevisionRequests:vi.fn()};
  const app=express();
  app.use("/kpis",createKpiRouter(env,database as unknown as PrismaClient,auth as unknown as AuthService,close));
  const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{res.status(error.statusCode??500).json({code:error.code});};
  app.use(errorHandler);
  return {app,close};
}
describe("history HTTP routes",()=>{
  it("requires authentication on both new routes",async()=>{
    const {app}=fixture();
    await request(app).get("/kpis/history/technicians").expect(401);
    await request(app).get(`/kpis/technicians/${id}/trend`).expect(401);
  });
  it.each([[[],false],[["KPI_VIEW_ALL"],true]])("checks permissions and provisional password",async(permissions,pending)=>{
    await request(fixture(permissions,pending).app).get("/kpis/history/technicians").set("Cookie","gs_session=test").expect(403);
  });
  it("validates ids, future dates and unknown queries",async()=>{
    const {app}=fixture();
    for(const path of ["/kpis/technicians/bad/trend",`/kpis/technicians/${id}/trend?endDate=9999-01-01`,"/kpis/history/technicians?pageSize=51",`/kpis/technicians/${id}/trend?extra=x`])
      await request(app).get(path).set("Cookie","gs_session=test").expect(400);
  });
  it("returns official-only series and does not run closure or convergence",async()=>{
    const {app,close}=fixture();
    const response=await request(app).get(`/kpis/technicians/${id}/trend?endDate=2026-10-06`).set("Cookie","gs_session=test").expect(200);
    expect(response.body.success).toBe(true);expect(response.body.data.points).toHaveLength(12);
    expect(response.body.data.points[11].status).toBe("NO_DATA");
    for(const spy of Object.values(close))expect(spy).not.toHaveBeenCalled();
    const options=await request(app).get("/kpis/history/technicians").set("Cookie","gs_session=test").expect(200);
    expect(options.body.data.items[0]).toEqual({id,code:"GS-01",fullName:"Ana",inactive:false});
  });
  it("does not permit an own-scope reader to request another technician",async()=>{
    await request(fixture(["KPI_VIEW_OWN"]).app).get("/kpis/technicians/22222222-2222-4222-8222-222222222222/trend").set("Cookie","gs_session=test").expect(404);
  });
});
