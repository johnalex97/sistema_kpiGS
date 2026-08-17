import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";
import type { PrismaClient } from "../generated/prisma/client.js";
import { getDatabaseClient } from "./config/database.js";
import type { Environment } from "./config/env.js";
import { createErrorHandler } from "./middlewares/error.middleware.js";
import { notFoundHandler } from "./middlewares/not-found.middleware.js";
import { requestContext } from "./middlewares/request-context.middleware.js";
import { createApiRouter } from "./routes/index.js";
import { LocalEvidenceStorage } from "./evidences/evidences.local-storage.js";
import type { EvidenceStorage } from "./evidences/evidences.storage.js";
import { createLogger } from "./utils/logger.js";

export interface CreateAppOptions {
  env: Environment;
  logger?: Logger;
  database?: PrismaClient;
  evidenceStorage?: EvidenceStorage;
  registerRoutes?: (app: Express) => void;
}

let defaultEvidenceStorage: { root: string; storage: LocalEvidenceStorage } | undefined;

function storageForEnvironment(env: Environment): EvidenceStorage {
  if (defaultEvidenceStorage?.root !== env.EVIDENCE_STORAGE_PATH) {
    defaultEvidenceStorage = { root: env.EVIDENCE_STORAGE_PATH, storage: new LocalEvidenceStorage(env.EVIDENCE_STORAGE_PATH) };
  }
  return defaultEvidenceStorage.storage;
}

export function createApp(options: CreateAppOptions) {
  const logger =
    options.logger ??
    createLogger(
      options.env.LOG_LEVEL,
      options.env.NODE_ENV === "development",
    );
  const app = express();
  const database =
    options.database ?? getDatabaseClient(options.env.DATABASE_URL);
  const evidenceStorage = options.evidenceStorage ?? storageForEnvironment(options.env);

  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      autoLogging: options.env.NODE_ENV !== "test",
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || options.env.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }

        const error = new Error("Origen no permitido");
        Object.assign(error, {
          statusCode: 403,
          code: "CORS_ORIGIN_DENIED",
        });
        callback(error);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: options.env.JSON_BODY_LIMIT }));
  app.use("/api/v1", createApiRouter(options.env, database, evidenceStorage));
  options.registerRoutes?.(app);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
