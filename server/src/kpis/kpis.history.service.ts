import { ApiError } from "../utils/api-error.js";
import type { KpiAccessScope } from "./kpis.repository.types.js";
import type { KpiActorContext } from "./kpis.types.js";
import type { createKpiHistoryRepository } from "./kpis.history.repository.js";
import { buildHistoryWindow, historyToday } from "./kpis.history.period.js";
import { buildHistoryPoints } from "./kpis.history.series.js";
import { createHistorySchemas } from "./kpis.history.schemas.js";
import type { HistoryQuery, HistorySearch, HistorySeries } from "./kpis.history.types.js";
function accessScope(actor:KpiActorContext):KpiAccessScope {
  if(actor.permissions.includes("KPI_VIEW_ALL"))return {kind:"ALL"};
  if(actor.permissions.includes("KPI_VIEW_OWN")&&actor.technicianId)return {kind:"TECHNICIAN",technicianId:actor.technicianId};
  throw new ApiError(403,"No tiene un perfil o permiso para consultar el historial KPI","FORBIDDEN");
}
export function createKpiHistoryService(repository:ReturnType<typeof createKpiHistoryRepository>,timeZone:string,now:()=>Date=()=>new Date()){
  return {
    searchTechnicians(query:HistorySearch,actor:KpiActorContext){
      return repository.searchTechnicians(query,accessScope(actor));
    },
    async getTrend(id:string,query:HistoryQuery,actor:KpiActorContext):Promise<HistorySeries>{
      const scope=accessScope(actor);
      if(scope.kind==="TECHNICIAN"&&scope.technicianId!==id)throw new ApiError(404,"El historial solicitado no existe","KPI_NOT_FOUND");
      const instant=now(), today=historyToday(instant,timeZone);
      const parsed=createHistorySchemas(()=>today).trendQuerySchema.safeParse(query);
      if(!parsed.success)throw new ApiError(400,"El periodo no es válido","VALIDATION_ERROR");
      const referenceDate=query.endDate??today;
      const technician=await repository.findTechnician(id,scope);
      if(!technician)throw new ApiError(404,"El historial solicitado no existe","KPI_NOT_FOUND");
      const window=buildHistoryWindow(query,referenceDate);
      const rows=await repository.findResults(id,scope,window[0]!.periodStart,referenceDate);
      return {technician,granularity:query.granularity,referenceDate,timeZone,generatedAt:instant.toISOString(),points:buildHistoryPoints(query,referenceDate,rows)};
    },
  };
}
