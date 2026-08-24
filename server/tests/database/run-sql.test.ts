import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("database/run-sql", () => {
  test("applies the schema selected by DATABASE_URL", async () => {
    const databaseUrl = process.env.DATABASE_TEST_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_TEST_URL no está configurada");
    }

    const directory = await mkdtemp(join(tmpdir(), "run-sql-schema-"));
    const scriptPath = join(directory, "current-schema.sql");
    await writeFile(
      scriptPath,
      "SELECT current_schema() AS selected_schema;",
      "utf8",
    );

    try {
      const result = spawnSync(
        process.execPath,
        ["--import=tsx", "database/run-sql.ts", scriptPath],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: databaseUrl },
        },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("selected_schema");
      expect(result.stdout).toContain("'test'");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
