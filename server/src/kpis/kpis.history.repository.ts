import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { KpiAccessScope } from "./kpis.repository.types.js";
import type { HistorySearch, HistoryTechnician } from "./kpis.history.types.js";
const select = { id:true, code:true, fullName:true, status:true, deletedAt:true } as const;
const eligible: Prisma.TecnicoWhereInput = { OR: [{deletedAt:null,status:{not:"INACTIVE"}},{resultadosKpi:{some:{isCurrent:true}}}] };
function scopeWhere(scope:KpiAccessScope): Prisma.TecnicoWhereInput { return scope.kind==="ALL" ? {} : {id:scope.technicianId}; }
function publicTechnician(row: Prisma.TecnicoGetPayload<{select:typeof select}>):HistoryTechnician {
  return { id:row.id, code:row.code, fullName:row.fullName, inactive:row.status==="INACTIVE"||row.deletedAt!==null };
}
export function createKpiHistoryRepository(database: PrismaClient | Prisma.TransactionClient) {
  return {
    async searchTechnicians(query:HistorySearch, scope:KpiAccessScope) {
      const where:Prisma.TecnicoWhereInput={ AND:[eligible,scopeWhere(scope),query.search?{OR:[{fullName:{contains:query.search,mode:"insensitive"}},{code:{contains:query.search,mode:"insensitive"}}]}:{}] };
      const [rows,totalItems]=await Promise.all([database.tecnico.findMany({where,select,orderBy:[{fullName:"asc"},{id:"asc"}],skip:(query.page-1)*query.pageSize,take:query.pageSize}),database.tecnico.count({where})]);
      return { items:rows.map(publicTechnician),pagination:{page:query.page,pageSize:query.pageSize,totalItems,totalPages:Math.ceil(totalItems/query.pageSize)} };
    },
    async findTechnician(id:string,scope:KpiAccessScope) {
      const row=await database.tecnico.findFirst({where:{AND:[eligible,scopeWhere(scope),{id}]},select});
      return row?publicTechnician(row):null;
    },
    async findResults(id:string,scope:KpiAccessScope,periodEndFrom:string,periodEndThrough:string) {
      return database.resultadoKPI.findMany({
        where:{AND:[{tecnicoId:id},{isCurrent:true},{periodEnd:{gte:new Date(periodEndFrom+"T00:00:00Z"),lte:new Date(periodEndThrough+"T00:00:00Z")}},scope.kind==="ALL"?{}:{tecnicoId:scope.technicianId}]},
        include:{tecnico:{select:{code:true,fullName:true}}},orderBy:{periodStart:"asc"},
      });
    },
  };
}
