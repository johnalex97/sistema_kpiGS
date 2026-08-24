import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { createDatabaseClient } from "../src/config/database.js";

export async function verifyKpiPersistence(database: PrismaClient): Promise<string[]> {
  const checkpoints: string[] = [];
  const configurations = await database.configuracionKPI.findMany({ where: { isActive: true } });
  if (configurations.length === 0 || configurations.some((item) => !item.productivityWeight.plus(item.complianceWeight).plus(item.efficiencyWeight).plus(item.qualityWeight).equals(new Prisma.Decimal(1)))) throw new Error("KPI_CONFIG_INVALID");
  checkpoints.push("Configuración KPI vigente y ponderaciones válidas");
  const invalidGoals = await database.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM "meta_tecnico" WHERE "period_end" - "period_start" <> 6 OR EXTRACT(ISODOW FROM "period_start") <> 1 OR "target_jobs" <= 0 OR "target_productive_minutes" <= 0`;
  if ((invalidGoals[0]?.count ?? 1) !== 0) throw new Error("KPI_WEEKLY_TARGET_INVALID");
  checkpoints.push("Metas semanales con periodos lunes-domingo");
  const permissions = await database.permiso.findMany({ where: { code: { startsWith: "KPI_" } }, select: { roles: true } });
  if (permissions.length < 7 || permissions.some(({ roles }) => roles.length === 0)) throw new Error("KPI_PERMISSIONS_INVALID");
  checkpoints.push("Permisos KPI asignados por rol");
  const inconsistent = await database.$queryRaw<Array<{ count: number }>>`
    SELECT (SELECT count(*) FROM (SELECT "tecnico_id", "period_start", "period_end" FROM "resultado_kpi" WHERE "is_current" GROUP BY 1,2,3 HAVING count(*) > 1) duplicates)::int
      + (SELECT count(*) FROM "solicitud_revision_kpi" WHERE "status" NOT IN ('PENDING','PROCESSING','PROCESSED','FAILED') OR "attempts" < 0)::int AS count`;
  if ((inconsistent[0]?.count ?? 1) !== 0) throw new Error("KPI_REVISION_INVARIANT_INVALID");
  checkpoints.push("Revisiones actuales y cola durable consistentes");
  return checkpoints;
}

async function main() {
  const connectionString = process.env.DATABASE_TEST_URL;
  if (!connectionString) throw new Error("DATABASE_TEST_URL no está configurada");
  const url = new URL(connectionString);
  if (url.pathname.slice(1) !== "Sistema_kpiGS" || url.searchParams.get("schema") !== "test") throw new Error('kpis:verify solo puede ejecutarse en "Sistema_kpiGS", esquema "test"');
  const database = createDatabaseClient(connectionString);
  try { for (const checkpoint of await verifyKpiPersistence(database)) console.log(`✓ ${checkpoint}`); }
  finally { await database.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
