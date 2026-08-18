import { mkdtemp, mkdir, readdir, rm, stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, createEvidenceStorageForEnvironment } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { createShutdownHandler, startServer } from "../src/server.js";
import { silentLogger } from "../src/utils/logger.js";

const openServers: ReturnType<typeof startServer>[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("startServer", () => {
  it("starts the provided Express app", async () => {
    const env = parseEnvironment({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
      DATABASE_TEST_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
    });
    const server = startServer(
      createApp({ env, logger: silentLogger }),
      0,
      silentLogger,
    );
    openServers.push(server);

    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/health`,
    );
    expect(response.status).toBe(200);
  });

  it("closes HTTP and database resources only once", async () => {
    const env = parseEnvironment({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
      DATABASE_TEST_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
    });
    const server = startServer(
      createApp({ env, logger: silentLogger }),
      0,
      silentLogger,
    );
    await new Promise<void>((resolve) => server.once("listening", resolve));

    let disconnectCalls = 0;
    const shutdown = createShutdownHandler(
      server,
      async () => {
        disconnectCalls += 1;
      },
      silentLogger,
    );

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGTERM")]);

    expect(server.listening).toBe(false);
    expect(disconnectCalls).toBe(1);
  });
});

describe("production evidence storage bootstrap", () => {
  it("rejects an absent absolute production root without creating it", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "evidence-production-absent-"));
    const storageRoot = path.join(parent, "missing-root");
    const env = parseEnvironment({
      NODE_ENV: "production",
      AUTH_COOKIE_SECURE: "true",
      DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
      DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
      EVIDENCE_STORAGE_PATH: storageRoot,
    });

    try {
      expect(() => createApp({ env, logger: silentLogger })).toThrow(
        expect.objectContaining({ name: "EvidenceStorageUnavailableError" }),
      );
      await expect(stat(storageRoot)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readdir(parent)).resolves.toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("accepts an existing private production root and creates only its working directories", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "evidence-production-existing-"));
    const storageRoot = path.join(parent, "preprovisioned-root");
    await mkdir(storageRoot, { mode: 0o700 });
    const env = parseEnvironment({
      NODE_ENV: "production",
      AUTH_COOKIE_SECURE: "true",
      DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
      DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
      EVIDENCE_STORAGE_PATH: storageRoot,
    });

    try {
      await expect(
        createEvidenceStorageForEnvironment(env).initialize(
          new Date("2026-08-17T00:00:00.000Z"),
          env.EVIDENCE_TEMP_MAX_AGE_MINUTES,
        ),
      ).resolves.toEqual({ removedTemporaries: 0 });
      await expect(readdir(storageRoot)).resolves.toEqual(["files", "tmp"]);
      expect((await stat(path.join(storageRoot, "tmp"))).isDirectory()).toBe(true);
      expect((await stat(path.join(storageRoot, "files"))).isDirectory()).toBe(true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
