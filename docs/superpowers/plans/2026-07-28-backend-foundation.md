# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una API Express independiente en `server/`, segura, observable, validada y probada, con un endpoint `GET /api/v1/health` y un contrato uniforme de respuestas y errores.

**Architecture:** El frontend permanece en la raíz y el backend tiene su propio paquete. `createApp()` compone middleware y rutas sin abrir puertos, mientras `server.ts` se limita al arranque. La configuración se valida una vez con Zod y cada solicitud recibe un identificador de correlación.

**Tech Stack:** Node.js 20+, TypeScript estricto, Express, Zod, Helmet, CORS, Pino, pino-http, Vitest, Supertest, ESLint y tsx.

## Global Constraints

- No mover ni reescribir el frontend existente.
- La API se versiona bajo `/api/v1`.
- No agregar Prisma, PostgreSQL, autenticación ni módulos de negocio en esta etapa.
- No exponer stack traces, secretos, rutas locales, cookies o encabezados de autorización.
- `server/` debe instalarse, ejecutarse y validarse de forma independiente.
- Toda nueva conducta debe seguir RED–GREEN–REFACTOR.
- No inicializar Git ni crear commits sin autorización expresa. Los mensajes de commit de este plan son únicamente sugerencias mientras no exista repositorio.
- Ejecutar también build, lint y pruebas del frontend antes de cerrar la etapa.

---

## File Map

```text
server/
├── src/
│   ├── config/env.ts                    # Validación y tipado del entorno
│   ├── controllers/health.controller.ts # Respuesta del endpoint de salud
│   ├── middlewares/error.middleware.ts  # Traducción segura de errores
│   ├── middlewares/not-found.middleware.ts
│   ├── middlewares/request-context.middleware.ts
│   ├── routes/health.routes.ts
│   ├── routes/index.ts                  # Registro de /api/v1
│   ├── types/api.ts                     # Contratos de respuesta
│   ├── types/express.d.ts               # requestId en Express.Request
│   ├── utils/api-error.ts
│   ├── utils/logger.ts
│   ├── app.ts                           # Composición, sin listen()
│   └── server.ts                        # Arranque del proceso
├── tests/env.test.ts
├── tests/health.test.ts
├── tests/security.test.ts
├── tests/errors.test.ts
├── tests/server.test.ts
├── .env.example
├── eslint.config.js
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Task 1: Package configuration and validated environment

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/eslint.config.js`
- Create: `server/vitest.config.ts`
- Create: `server/.env.example`
- Create: `server/tests/env.test.ts`
- Create: `server/src/config/env.ts`

**Interfaces:**
- Produces: `Environment`, `EnvironmentInput`, `parseEnvironment(input)` and `env`.
- `parseEnvironment(input: EnvironmentInput): Environment`.
- Later tasks consume `Environment` through `createApp({ env, logger })`.

- [ ] **Step 1: Create the independent package and tool configuration**

Create `server/package.json`:

```json
{
  "name": "geek-solution-service-control-api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/server.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Install runtime dependencies from `server/`:

```powershell
npm install express zod helmet cors pino pino-http dotenv
```

Install development dependencies:

```powershell
npm install --save-dev typescript tsx vitest supertest eslint @eslint/js typescript-eslint pino-pretty @types/node @types/express @types/cors @types/supertest
```

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests", "vitest.config.ts", "eslint.config.js"],
  "exclude": ["dist", "node_modules"]
}
```

Create `server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    restoreMocks: true,
  },
});
```

Create `server/eslint.config.js` using the same strict pattern as the frontend:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },
);
```

Create `server/.env.example`:

```dotenv
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
JSON_BODY_LIMIT=1mb
```

- [ ] **Step 2: Write failing environment tests**

Create `server/tests/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env.js";

describe("parseEnvironment", () => {
  it("applies safe defaults", () => {
    expect(parseEnvironment({})).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      CORS_ORIGINS: ["http://localhost:5173"],
      LOG_LEVEL: "info",
      JSON_BODY_LIMIT: "1mb",
    });
  });

  it("normalizes a comma-separated CORS allowlist", () => {
    const result = parseEnvironment({
      CORS_ORIGIN: "https://admin.example.com, https://ops.example.com ",
    });

    expect(result.CORS_ORIGINS).toEqual([
      "https://admin.example.com",
      "https://ops.example.com",
    ]);
  });

  it("rejects an invalid port", () => {
    expect(() => parseEnvironment({ PORT: "0" })).toThrow(
      "Configuración de entorno inválida",
    );
  });

  it("rejects an unsupported log level", () => {
    expect(() => parseEnvironment({ LOG_LEVEL: "verbose" })).toThrow(
      "Configuración de entorno inválida",
    );
  });
});
```

- [ ] **Step 3: Run the environment test and verify RED**

Run:

```powershell
Set-Location server
npm run test -- tests/env.test.ts
```

Expected: FAIL because `src/config/env.ts` does not exist.

- [ ] **Step 4: Implement the environment parser**

Create `server/src/config/env.ts`:

```ts
import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JSON_BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i).default("1mb"),
});

export type EnvironmentInput = Record<string, string | undefined>;

export interface Environment {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  CORS_ORIGINS: string[];
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  JSON_BODY_LIMIT: string;
}

export function parseEnvironment(input: EnvironmentInput): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Configuración de entorno inválida: ${z.prettifyError(result.error)}`);
  }

  const corsOrigins = result.data.CORS_ORIGIN
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    throw new Error("Configuración de entorno inválida: CORS_ORIGIN está vacío");
  }

  return {
    NODE_ENV: result.data.NODE_ENV,
    PORT: result.data.PORT,
    CORS_ORIGINS: corsOrigins,
    LOG_LEVEL: result.data.LOG_LEVEL,
    JSON_BODY_LIMIT: result.data.JSON_BODY_LIMIT,
  };
}

export const env = parseEnvironment(process.env);
```

- [ ] **Step 5: Verify GREEN and static checks**

Run:

```powershell
npm run test -- tests/env.test.ts
npm run typecheck
npm run lint
```

Expected: 4 tests PASS; typecheck and lint exit 0.

- [ ] **Step 6: Record the logical checkpoint**

Suggested commit if Git is later initialized:

```text
feat(server): add validated environment configuration
```

## Task 2: Request context and health endpoint

**Files:**
- Create: `server/src/types/api.ts`
- Create: `server/src/types/express.d.ts`
- Create: `server/src/utils/logger.ts`
- Create: `server/src/middlewares/request-context.middleware.ts`
- Create: `server/src/controllers/health.controller.ts`
- Create: `server/src/routes/health.routes.ts`
- Create: `server/src/routes/index.ts`
- Create: `server/src/app.ts`
- Create: `server/tests/health.test.ts`

**Interfaces:**
- Consumes: `Environment` from Task 1.
- Produces: `createApp(options: CreateAppOptions): Express`.
- Produces: `ApiResponse<T>` and Express `requestId`.
- `CreateAppOptions` contains `env: Environment`, `logger?: Logger`, and optional `registerRoutes?: (app: Express) => void`.

- [ ] **Step 1: Write failing health and correlation tests**

Create `server/tests/health.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { silentLogger } from "../src/utils/logger.js";

const testEnv = parseEnvironment({ NODE_ENV: "test", LOG_LEVEL: "silent" });

describe("GET /api/v1/health", () => {
  it("returns service health using the API contract", async () => {
    const response = await request(createApp({ env: testEnv, logger: silentLogger }))
      .get("/api/v1/health")
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      message: "Servicio disponible",
      data: {
        status: "ok",
        service: "geek-solution-service-control-api",
        version: "0.1.0",
        environment: "test",
      },
      errors: [],
      meta: { requestId: expect.any(String) },
    });
    expect(response.body.data.timestamp).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).toBe(response.body.meta.requestId);
  });

  it("preserves a valid request identifier", async () => {
    const requestId = "8a942f39-8ec7-42ea-b2d4-9f0121e57016";
    const response = await request(createApp({ env: testEnv, logger: silentLogger }))
      .get("/api/v1/health")
      .set("x-request-id", requestId)
      .expect(200);

    expect(response.headers["x-request-id"]).toBe(requestId);
    expect(response.body.meta.requestId).toBe(requestId);
  });

  it("replaces an invalid request identifier", async () => {
    const response = await request(createApp({ env: testEnv, logger: silentLogger }))
      .get("/api/v1/health")
      .set("x-request-id", "<script>alert(1)</script>")
      .expect(200);

    expect(response.body.meta.requestId).not.toBe("<script>alert(1)</script>");
    expect(response.body.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 2: Run the health test and verify RED**

Run:

```powershell
npm run test -- tests/health.test.ts
```

Expected: FAIL because `src/app.ts` and `src/utils/logger.ts` do not exist.

- [ ] **Step 3: Implement API types and request context**

Create `server/src/types/api.ts`:

```ts
export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiMeta {
  requestId: string;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiErrorDetail[];
  meta: ApiMeta;
}
```

Create `server/src/types/express.d.ts`:

```ts
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export {};
```

Create `server/src/middlewares/request-context.middleware.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header("x-request-id");
  req.requestId = supplied && uuidPattern.test(supplied) ? supplied : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
```

- [ ] **Step 4: Implement logger, health route and application factory**

Create `server/src/utils/logger.ts`:

```ts
import pino from "pino";

export const silentLogger = pino({ level: "silent" });

export function createLogger(level: string, pretty = false) {
  return pino(
    { level, redact: ["req.headers.authorization", "req.headers.cookie"] },
    pretty
      ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
      : undefined,
  );
}
```

Create `server/src/controllers/health.controller.ts`:

```ts
import type { Request, Response } from "express";
import type { Environment } from "../config/env.js";
import type { ApiResponse } from "../types/api.js";

interface HealthData {
  status: "ok";
  service: string;
  version: string;
  environment: Environment["NODE_ENV"];
  timestamp: string;
}

export function createHealthController(env: Environment) {
  return (_req: Request, res: Response<ApiResponse<HealthData>>) => {
    res.status(200).json({
      success: true,
      message: "Servicio disponible",
      data: {
        status: "ok",
        service: "geek-solution-service-control-api",
        version: "0.1.0",
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
      errors: [],
      meta: { requestId: res.req.requestId },
    });
  };
}
```

Create `server/src/routes/health.routes.ts`:

```ts
import { Router } from "express";
import type { Environment } from "../config/env.js";
import { createHealthController } from "../controllers/health.controller.js";

export function createHealthRouter(env: Environment) {
  const router = Router();
  router.get("/", createHealthController(env));
  return router;
}
```

Create `server/src/routes/index.ts`:

```ts
import { Router } from "express";
import type { Environment } from "../config/env.js";
import { createHealthRouter } from "./health.routes.js";

export function createApiRouter(env: Environment) {
  const router = Router();
  router.use("/health", createHealthRouter(env));
  return router;
}
```

Create `server/src/app.ts` initially with only the composition needed by this task:

```ts
import express, { type Express } from "express";
import pinoHttp from "pino-http";
import type { Logger } from "pino";
import type { Environment } from "./config/env.js";
import { requestContext } from "./middlewares/request-context.middleware.js";
import { createApiRouter } from "./routes/index.js";
import { createLogger } from "./utils/logger.js";

export interface CreateAppOptions {
  env: Environment;
  logger?: Logger;
  registerRoutes?: (app: Express) => void;
}

export function createApp(options: CreateAppOptions) {
  const logger = options.logger ?? createLogger(
    options.env.LOG_LEVEL,
    options.env.NODE_ENV === "development",
  );
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(pinoHttp({
    logger,
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    },
  }));
  app.use("/api/v1", createApiRouter(options.env));
  options.registerRoutes?.(app);
  return app;
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm run test -- tests/health.test.ts
npm run typecheck
npm run lint
```

Expected: 3 tests PASS; typecheck and lint exit 0.

- [ ] **Step 6: Record the logical checkpoint**

Suggested commit:

```text
feat(server): add health endpoint and request correlation
```

## Task 3: Security middleware, CORS and body limits

**Files:**
- Create: `server/tests/security.test.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/config/env.ts`

**Interfaces:**
- Consumes: `createApp()` and `Environment`.
- Produces: configured Helmet, allowlist CORS and JSON body limit.
- CORS callback allows requests without `Origin` and configured exact origins.

- [ ] **Step 1: Write failing security tests**

Create `server/tests/security.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { silentLogger } from "../src/utils/logger.js";

const env = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGIN: "https://allowed.example.com",
  JSON_BODY_LIMIT: "1kb",
});

describe("HTTP security", () => {
  it("sets security headers and hides Express", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/health")
      .expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("authorizes an allowed CORS origin", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/health")
      .set("Origin", "https://allowed.example.com")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://allowed.example.com",
    );
  });

  it("does not authorize a disallowed CORS origin", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/health")
      .set("Origin", "https://attacker.example.com")
      .expect(403);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects JSON bodies larger than the configured limit", async () => {
    const response = await request(createApp({
      env,
      logger: silentLogger,
      registerRoutes: (app) => {
        app.post("/echo", (_req, res) => res.status(204).end());
      },
    }))
      .post("/echo")
      .send({ content: "x".repeat(2048) })
      .expect(413);

    expect(response.body.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run security tests and verify RED**

Run:

```powershell
npm run test -- tests/security.test.ts
```

Expected: FAIL because Helmet, CORS, JSON parsing and error normalization are not active.

- [ ] **Step 3: Add security middleware to `createApp`**

Modify `server/src/app.ts` so middleware order becomes:

```ts
import cors from "cors";
import helmet from "helmet";

// After pinoHttp and before routes:
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || options.env.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    const error = new Error("Origen no permitido");
    Object.assign(error, { statusCode: 403, code: "CORS_ORIGIN_DENIED" });
    callback(error);
  },
  credentials: true,
}));
app.use(express.json({ limit: options.env.JSON_BODY_LIMIT }));
```

Task 4 will centralize the temporary CORS/body errors into `ApiError`. For this
task, add a final minimal error response after `registerRoutes`:

```ts
app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const candidate = error as { status?: number; statusCode?: number };
  const status = candidate.statusCode ?? candidate.status ?? 500;
  res.status(status).json({
    success: false,
    message: status === 413 ? "El cuerpo de la solicitud excede el límite permitido" : "No fue posible completar la operación",
    data: null,
    errors: [],
    meta: { requestId: req.requestId },
  });
});
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run test -- tests/security.test.ts
npm run test
npm run typecheck
npm run lint
```

Expected: 4 security tests PASS and all earlier tests remain green.

- [ ] **Step 5: Record the logical checkpoint**

Suggested commit:

```text
feat(server): enforce HTTP security and CORS allowlist
```

## Task 4: Uniform errors and not-found handling

**Files:**
- Create: `server/src/utils/api-error.ts`
- Create: `server/src/middlewares/not-found.middleware.ts`
- Create: `server/src/middlewares/error.middleware.ts`
- Create: `server/tests/errors.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Produces: `ApiError(statusCode, message, code, errors?)`.
- Produces: `notFoundHandler` and `errorHandler`.
- Replaces the temporary inline error middleware from Task 3.

- [ ] **Step 1: Write failing error contract tests**

Create `server/tests/errors.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { silentLogger } from "../src/utils/logger.js";

const env = parseEnvironment({ NODE_ENV: "test", LOG_LEVEL: "silent" });

describe("API errors", () => {
  it("returns a consistent 404 response", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/unknown")
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      message: "Recurso no encontrado",
      data: null,
      errors: [{ code: "RESOURCE_NOT_FOUND", message: "La ruta solicitada no existe" }],
      meta: { requestId: response.headers["x-request-id"] },
    });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(createApp({
      env,
      logger: silentLogger,
      registerRoutes: (app) => app.post("/input", (_req, res) => res.sendStatus(204)),
    }))
      .post("/input")
      .set("Content-Type", "application/json")
      .send('{"broken":')
      .expect(400);

    expect(response.body.message).toBe("El JSON enviado no es válido");
    expect(JSON.stringify(response.body)).not.toContain("SyntaxError");
  });

  it("hides unexpected error details", async () => {
    const response = await request(createApp({
      env,
      logger: silentLogger,
      registerRoutes: (app) => {
        app.get("/failure", () => {
          throw new Error("DATABASE_PASSWORD=super-secret");
        });
      },
    }))
      .get("/failure")
      .expect(500);

    expect(response.body.message).toBe("Ocurrió un error interno");
    expect(JSON.stringify(response.body)).not.toContain("super-secret");
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });

  it("returns 413 using the same error contract", async () => {
    const smallEnv = { ...env, JSON_BODY_LIMIT: "1kb" };
    const response = await request(createApp({
      env: smallEnv,
      logger: silentLogger,
      registerRoutes: (app) => {
        app.post("/input", express.json(), (_req, res) => res.sendStatus(204));
      },
    }))
      .post("/input")
      .send({ content: "x".repeat(2048) })
      .expect(413);

    expect(response.body.errors[0].code).toBe("PAYLOAD_TOO_LARGE");
  });
});
```

- [ ] **Step 2: Run error tests and verify RED**

Run:

```powershell
npm run test -- tests/errors.test.ts
```

Expected: FAIL because unknown routes and errors do not yet use the required detailed contract.

- [ ] **Step 3: Implement `ApiError` and error middleware**

Create `server/src/utils/api-error.ts`:

```ts
import type { ApiErrorDetail } from "../types/api.js";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly errors: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

Create `server/src/middlewares/not-found.middleware.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(
    404,
    "Recurso no encontrado",
    "RESOURCE_NOT_FOUND",
    [{ code: "RESOURCE_NOT_FOUND", message: "La ruta solicitada no existe" }],
  ));
}
```

Create `server/src/middlewares/error.middleware.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { ApiError } from "../utils/api-error.js";

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

export function createErrorHandler(logger: Logger) {
  return (
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const parserError = error as BodyParserError;
    let apiError: ApiError;

    if (error instanceof ApiError) {
      apiError = error;
    } else if (parserError.type === "entity.parse.failed") {
      apiError = new ApiError(400, "El JSON enviado no es válido", "INVALID_JSON");
    } else if (parserError.type === "entity.too.large") {
      apiError = new ApiError(413, "El cuerpo de la solicitud excede el límite permitido", "PAYLOAD_TOO_LARGE");
    } else if ((error as { code?: string }).code === "CORS_ORIGIN_DENIED") {
      apiError = new ApiError(403, "Origen no permitido", "CORS_ORIGIN_DENIED");
    } else {
      logger.error({ err: error, requestId: req.requestId }, "Unhandled request error");
      apiError = new ApiError(500, "Ocurrió un error interno", "INTERNAL_ERROR");
    }

    const errors = apiError.errors.length > 0
      ? apiError.errors
      : [{ code: apiError.code, message: apiError.message }];

    res.status(apiError.statusCode).json({
      success: false,
      message: apiError.message,
      data: null,
      errors,
      meta: { requestId: req.requestId },
    });
  };
}
```

- [ ] **Step 4: Replace the temporary middleware in `app.ts`**

After routes and `registerRoutes`, add:

```ts
app.use(notFoundHandler);
app.use(createErrorHandler(logger));
```

Ensure test-injected routes are registered before `notFoundHandler`. Remove the
temporary inline error middleware from Task 3.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm run test -- tests/errors.test.ts
npm run test
npm run typecheck
npm run lint
```

Expected: 4 error tests PASS and the complete suite remains green.

- [ ] **Step 6: Record the logical checkpoint**

Suggested commit:

```text
feat(server): add safe centralized API errors
```

## Task 5: Server startup, final documentation and full verification

**Files:**
- Create: `server/src/server.ts`
- Create: `server/tests/server.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: `env`, `createApp`, `createLogger`.
- Produces: `startServer(app, port, logger)` returning `http.Server`.

- [ ] **Step 1: Write a failing startup test**

Create `server/tests/server.test.ts`:

```ts
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { startServer } from "../src/server.js";
import { silentLogger } from "../src/utils/logger.js";

const openServers: ReturnType<typeof startServer>[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(
    (server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  ));
});

describe("startServer", () => {
  it("starts the provided Express app", async () => {
    const env = parseEnvironment({ NODE_ENV: "test", LOG_LEVEL: "silent" });
    const server = startServer(
      createApp({ env, logger: silentLogger }),
      0,
      silentLogger,
    );
    openServers.push(server);

    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run startup test and verify RED**

Run:

```powershell
npm run test -- tests/server.test.ts
```

Expected: FAIL because `src/server.ts` does not exist.

- [ ] **Step 3: Implement server startup**

Create `server/src/server.ts`:

```ts
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import type { Express } from "express";
import type { Logger } from "pino";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createLogger } from "./utils/logger.js";

export function startServer(app: Express, port: number, logger: Logger): Server {
  return app.listen(port, () => {
    logger.info({ port }, "API listening");
  });
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
  const app = createApp({ env, logger });
  startServer(app, env.PORT, logger);
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run test -- tests/server.test.ts
npm run test
npm run typecheck
npm run lint
npm run build
```

Expected: startup test and complete backend suite PASS; all static checks exit 0.

- [ ] **Step 5: Verify the running API**

Create `server/.env` locally from `.env.example`; it remains ignored. Start:

```powershell
npm run dev
```

In a second process:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health
```

Expected: HTTP 200 with `success: true`, `data.status: "ok"` and a non-empty
`meta.requestId`. Stop the temporary server after the request.

- [ ] **Step 6: Update documentation**

Update root `README.md` with:

- Backend prerequisites.
- `Set-Location server`.
- `npm install`.
- Copy `.env.example` to `.env`.
- Commands `dev`, `build`, `typecheck`, `lint`, `test`.
- Health endpoint and response contract.
- Clear statement that database and authentication remain pending.

Update `docs/architecture/current-state.md`:

- Add `server/` architecture.
- Record the backend test count and validation results.
- Remove “no backend/API” from current limitations.
- Keep persistence and authentication marked pending.

Update `docs/plans/implementation-plan.md`:

- Mark Etapa 3 completed only after all acceptance commands pass.
- Record the API boundary and the next stage: Prisma/PostgreSQL.

- [ ] **Step 7: Run fresh final verification**

From `server/`:

```powershell
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm audit --audit-level=moderate
```

From the project root:

```powershell
npm run lint
npm run test
npm run build
npm audit --audit-level=moderate
```

Expected:

- Every command exits 0.
- Backend tests report 0 failures.
- Frontend tests report 5 passing tests.
- Both audits report 0 vulnerabilities at moderate or higher.

- [ ] **Step 8: Record the logical checkpoint**

Suggested commit:

```text
feat(server): establish secure tested API foundation
```

## Completion Report

Before declaring the stage complete, report:

- Files created and modified.
- Exact backend and frontend test counts.
- Build, typecheck, lint and audit outputs.
- HTTP health-check result.
- Remaining warnings.
- Explicitly pending Prisma, PostgreSQL and authentication.
