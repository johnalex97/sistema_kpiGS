import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

let singleton: PrismaClient | undefined;

export function createDatabaseClient(connectionString: string): PrismaClient {
  const url = new URL(connectionString);

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("La conexión debe utilizar PostgreSQL");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getDatabaseClient(connectionString: string): PrismaClient {
  singleton ??= createDatabaseClient(connectionString);
  return singleton;
}
