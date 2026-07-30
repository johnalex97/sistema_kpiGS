import { describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  getDatabaseClient,
} from "../src/config/database.js";

describe("createDatabaseClient", () => {
  it("rejects a non-PostgreSQL connection string", () => {
    expect(() => createDatabaseClient("file:./local.db")).toThrow(
      "La conexión debe utilizar PostgreSQL",
    );
  });

  it("creates a disconnectable Prisma client", async () => {
    const client = createDatabaseClient(
      "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
    );

    expect(client.$disconnect).toBeTypeOf("function");
    await client.$disconnect();
  });
});

describe("getDatabaseClient", () => {
  it("reuses the same client instance", async () => {
    const connectionString =
      "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test";
    const first = getDatabaseClient(connectionString);
    const second = getDatabaseClient(connectionString);

    expect(second).toBe(first);
    await first.$disconnect();
  });
});
