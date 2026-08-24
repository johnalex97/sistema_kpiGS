import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg, { type QueryResult } from "pg";

const scriptPath = process.argv[2];

if (!scriptPath) {
  throw new Error("Debes indicar la ruta del script SQL");
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está configurada");
}

const url = new URL(connectionString);

if (url.pathname.slice(1) !== "Sistema_kpiGS") {
  throw new Error('La verificación solo puede ejecutarse sobre "Sistema_kpiGS"');
}

const schema = url.searchParams.get("schema") ?? undefined;
if (schema !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
  throw new Error("El esquema PostgreSQL no es válido");
}

const sql = await readFile(resolve(process.cwd(), scriptPath), "utf8");
const client = new pg.Client({
  connectionString,
  ...(schema !== undefined && { options: `-c search_path=${schema}` }),
});

try {
  await client.connect();
  const queryResult = (await client.query(sql)) as
    | QueryResult<Record<string, unknown>>
    | QueryResult<Record<string, unknown>>[];
  const results = Array.isArray(queryResult) ? queryResult : [queryResult];

  for (const result of results) {
    if (result.rows.length > 0) {
      console.table(result.rows);
    }
  }
} finally {
  await client.end();
}
