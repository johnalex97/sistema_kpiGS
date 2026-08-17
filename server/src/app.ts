import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Readable } from "node:stream";
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
import type { EvidenceStorage, TemporaryEvidence } from "./evidences/evidences.storage.js";
import { createLogger } from "./utils/logger.js";

export interface CreateAppOptions {
  env: Environment;
  logger?: Logger;
  database?: PrismaClient;
  evidenceStorage?: EvidenceStorage;
  registerRoutes?: (app: Express) => void;
}

class LazyEvidenceStorage implements EvidenceStorage {
  #initialization: Promise<{ removedTemporaries: number }> | undefined;

  constructor(
    private readonly storage: LocalEvidenceStorage,
    private readonly tempMaxAgeMinutes: number,
  ) {}

  async initialize(now: Date, tempMaxAgeMinutes: number): Promise<{ removedTemporaries: number }> {
    const existing = this.#initialization;
    if (existing !== undefined) return existing;
    const initialization = this.storage.initialize(now, tempMaxAgeMinutes);
    this.#initialization = initialization;
    try {
      return await initialization;
    } catch (error) {
      if (this.#initialization === initialization) this.#initialization = undefined;
      throw error;
    }
  }

  async writeTemporary(source: Readable, maxBytes: number): Promise<TemporaryEvidence> {
    await this.#ready();
    return this.storage.writeTemporary(source, maxBytes);
  }

  async readHead(key: string, maxBytes: number): Promise<Buffer> {
    await this.#ready();
    return this.storage.readHead(key, maxBytes);
  }

  async promote(tempKey: string, finalKey: string): Promise<void> {
    await this.#ready();
    return this.storage.promote(tempKey, finalKey);
  }

  async open(finalKey: string): Promise<Readable> {
    await this.#ready();
    return this.storage.open(finalKey);
  }

  async remove(key: string): Promise<void> {
    await this.#ready();
    return this.storage.remove(key);
  }

  async exists(key: string): Promise<boolean> {
    await this.#ready();
    return this.storage.exists(key);
  }

  async *listFinalKeys(): AsyncIterable<string> {
    await this.#ready();
    yield* this.storage.listFinalKeys();
  }

  #ready(): Promise<{ removedTemporaries: number }> {
    return this.initialize(new Date(), this.tempMaxAgeMinutes);
  }
}

const defaultEvidenceStorages = new Map<string, LazyEvidenceStorage>();

function storageForEnvironment(env: Environment): EvidenceStorage {
  let storage = defaultEvidenceStorages.get(env.EVIDENCE_STORAGE_PATH);
  if (storage === undefined) {
    storage = new LazyEvidenceStorage(
      new LocalEvidenceStorage(env.EVIDENCE_STORAGE_PATH),
      env.EVIDENCE_TEMP_MAX_AGE_MINUTES,
    );
    defaultEvidenceStorages.set(env.EVIDENCE_STORAGE_PATH, storage);
  }
  return storage;
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
