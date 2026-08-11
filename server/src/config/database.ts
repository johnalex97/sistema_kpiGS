import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

let singleton: PrismaClient | undefined;

export function createDatabaseClient(connectionString: string): PrismaClient {
  const url = new URL(connectionString);

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("La conexión debe utilizar PostgreSQL");
  }

  const schema = url.searchParams.get("schema") ?? undefined;
  if (schema !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error("El esquema PostgreSQL no es válido");
  }
  const adapter = new PrismaPg(
    {
      connectionString,
      ...(schema !== undefined && { options: `-c search_path=${schema}` }),
    },
    schema === undefined ? undefined : { schema },
  );
  return new PrismaClient({ adapter });
}

export function getDatabaseClient(connectionString: string): PrismaClient {
  singleton ??= createDatabaseClient(connectionString);
  return singleton;
}
