import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import type { Express } from "express";
import type { Logger } from "pino";
import { createApp } from "./app.js";
import { getDatabaseClient } from "./config/database.js";
import { env } from "./config/env.js";
import { createLogger } from "./utils/logger.js";

export function startServer(
  app: Express,
  port: number,
  logger: Logger,
): Server {
  return app.listen(port, () => {
    logger.info({ port }, "API listening");
  });
}

export function createShutdownHandler(
  server: Server,
  disconnectDatabase: () => Promise<void>,
  logger: Logger,
) {
  let shutdownPromise: Promise<void> | undefined;

  return (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    logger.info({ signal }, "API shutting down");
    shutdownPromise = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }).finally(disconnectDatabase);

    return shutdownPromise;
  };
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  const logger = createLogger(
    env.LOG_LEVEL,
    env.NODE_ENV === "development",
  );
  const database = getDatabaseClient(env.DATABASE_URL);
  const app = createApp({ env, logger, database });
  const server = startServer(app, env.PORT, logger);
  const shutdown = createShutdownHandler(
    server,
    () => database.$disconnect(),
    logger,
  );

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal).catch((error: unknown) => {
        logger.error({ err: error, signal }, "API shutdown failed");
        process.exitCode = 1;
      });
    });
  }
}
