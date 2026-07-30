import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
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
