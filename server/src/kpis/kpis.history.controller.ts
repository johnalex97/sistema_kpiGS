import type { Request,Response,NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import type { createKpiHistoryService } from "./kpis.history.service.js";
import { createHistorySchemas } from "./kpis.history.schemas.js";
import { historyToday } from "./kpis.history.period.js";
import { kpiTechnicianParamsSchema } from "./kpis.schemas.js";
import type { ZodError } from "zod";
function parse<T>(result:{success:true;data:T}|{success:false;error:ZodError}):T {
  if(!result.success)throw new ApiError(400,"Los datos enviados no son válidos","VALIDATION_ERROR",result.error.issues.map(issue=>({field:issue.path.join("."),code:"VALIDATION_ERROR",message:issue.message})));
  return result.data;
}
const actor=(req:Request)=>({userId:req.auth!.userId,technicianId:req.auth!.technicianId,permissions:req.auth!.permissions,requestId:req.requestId});
const success=(req:Request,res:Response,data:unknown)=>res.json({success:true,message:"Historial KPI consultado",data,errors:[],meta:{requestId:req.requestId}});
export function createKpiHistoryController(service:ReturnType<typeof createKpiHistoryService>,timeZone:string){
  const schemas=createHistorySchemas(()=>historyToday(new Date(),timeZone));
  return {
    technicians:async(req:Request,res:Response,next:NextFunction)=>{try{
      const query=parse(schemas.technicianSearchSchema.safeParse(req.query));
      success(req,res,await service.searchTechnicians({page:query.page,pageSize:query.pageSize,...(query.search!==undefined?{search:query.search}:{})},actor(req)));
    }catch(error){next(error);}},
    trend:async(req:Request,res:Response,next:NextFunction)=>{try{
      const {technicianId}=parse(kpiTechnicianParamsSchema.safeParse(req.params));
      const query=parse(schemas.trendQuerySchema.safeParse(req.query));
      success(req,res,await service.getTrend(technicianId,{granularity:query.granularity,...(query.endDate!==undefined?{endDate:query.endDate}:{})},actor(req)));
    }catch(error){next(error);}},
  };
}
