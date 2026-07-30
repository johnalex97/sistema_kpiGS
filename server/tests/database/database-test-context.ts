import "dotenv/config";
import { createDatabaseClient } from "../../src/config/database.js";

const connectionString = process.env.DATABASE_TEST_URL;

if (!connectionString) {
  throw new Error("DATABASE_TEST_URL no está configurada");
}

const url = new URL(connectionString);

if (
  url.pathname.slice(1) !== "Sistema_kpiGS" ||
  url.searchParams.get("schema") !== "test"
) {
  throw new Error("Las pruebas de base solo pueden usar el esquema test");
}

export const database = createDatabaseClient(connectionString);

export async function disconnectTestDatabase(): Promise<void> {
  await database.$disconnect();
}
