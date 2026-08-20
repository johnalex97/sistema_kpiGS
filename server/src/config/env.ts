import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const postgresUrl = z
  .string()
  .url()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "Debe utilizar PostgreSQL",
  );

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  JSON_BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i).default("1mb"),
  DATABASE_URL: postgresUrl,
  DATABASE_TEST_URL: postgresUrl,
  AUTH_SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(15)
    .max(1440)
    .default(480),
  AUTH_SESSION_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(480)
    .default(30),
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(3)
    .max(10)
    .default(5),
  AUTH_LOCK_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(1440)
    .default(15),
  EVIDENCE_STORAGE_PATH: z.string().min(1).default("./storage/evidences"),
  EVIDENCE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(10_485_760)
    .default(10_485_760),
  EVIDENCE_TEMP_MAX_AGE_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .max(10_080)
    .default(60),
  RECURRENCE_WARNING_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export type EnvironmentInput = Record<string, string | undefined>;

export interface Environment {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  CORS_ORIGINS: string[];
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  JSON_BODY_LIMIT: string;
  DATABASE_URL: string;
  DATABASE_TEST_URL: string;
  AUTH_SESSION_TTL_MINUTES: number;
  AUTH_SESSION_IDLE_MINUTES: number;
  AUTH_COOKIE_SECURE: boolean;
  AUTH_MAX_FAILED_ATTEMPTS: number;
  AUTH_LOCK_MINUTES: number;
  EVIDENCE_STORAGE_PATH: string;
  EVIDENCE_MAX_BYTES: number;
  EVIDENCE_TEMP_MAX_AGE_MINUTES: number;
  RECURRENCE_WARNING_DAYS: number;
}

function isPathInside(pathname: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, pathname);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  );
}

function findServerRoot(startPath: string): string {
  let currentPath = startPath;

  while (!existsSync(path.join(currentPath, "package.json"))) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error("No se pudo localizar el directorio del servidor");
    }
    currentPath = parentPath;
  }

  return currentPath;
}

const serverRoot = findServerRoot(
  path.dirname(fileURLToPath(import.meta.url)),
);
const protectedEvidenceStoragePaths = [
  path.join(serverRoot, "public"),
  path.join(serverRoot, "dist"),
  path.resolve(serverRoot, "..", "dist"),
];

export function parseEnvironment(input: EnvironmentInput): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Configuración de entorno inválida: ${z.prettifyError(result.error)}`,
    );
  }

  const corsOrigins = result.data.CORS_ORIGIN
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    throw new Error("Configuración de entorno inválida: CORS_ORIGIN está vacío");
  }

  const developmentUrl = new URL(result.data.DATABASE_URL);
  const testUrl = new URL(result.data.DATABASE_TEST_URL);

  if (developmentUrl.searchParams.get("schema") !== "public") {
    throw new Error(
      "Configuración de entorno inválida: DATABASE_URL debe utilizar el esquema public",
    );
  }

  if (testUrl.searchParams.get("schema") !== "test") {
    throw new Error(
      "Configuración de entorno inválida: DATABASE_TEST_URL debe utilizar el esquema test",
    );
  }

  if (
    result.data.AUTH_SESSION_IDLE_MINUTES >
    result.data.AUTH_SESSION_TTL_MINUTES
  ) {
    throw new Error(
      "Configuración de entorno inválida: AUTH_SESSION_IDLE_MINUTES no puede superar AUTH_SESSION_TTL_MINUTES",
    );
  }

  if (
    result.data.NODE_ENV === "production" &&
    !result.data.AUTH_COOKIE_SECURE
  ) {
    throw new Error(
      "Configuración de entorno inválida: AUTH_COOKIE_SECURE debe ser true en producción",
    );
  }

  const evidenceStoragePath = path.resolve(result.data.EVIDENCE_STORAGE_PATH);
  if (result.data.NODE_ENV === "production") {
    const privatePathRequired = !path.isAbsolute(result.data.EVIDENCE_STORAGE_PATH);
    if (
      privatePathRequired ||
      protectedEvidenceStoragePaths.some((unsafePath) =>
        isPathInside(evidenceStoragePath, unsafePath),
      )
    ) {
      throw new Error(
        "Configuración de entorno inválida: EVIDENCE_STORAGE_PATH debe ser una ruta absoluta y privada en producción",
      );
    }
  }

  return {
    NODE_ENV: result.data.NODE_ENV,
    PORT: result.data.PORT,
    CORS_ORIGINS: corsOrigins,
    LOG_LEVEL: result.data.LOG_LEVEL,
    JSON_BODY_LIMIT: result.data.JSON_BODY_LIMIT,
    DATABASE_URL: result.data.DATABASE_URL,
    DATABASE_TEST_URL: result.data.DATABASE_TEST_URL,
    AUTH_SESSION_TTL_MINUTES: result.data.AUTH_SESSION_TTL_MINUTES,
    AUTH_SESSION_IDLE_MINUTES: result.data.AUTH_SESSION_IDLE_MINUTES,
    AUTH_COOKIE_SECURE: result.data.AUTH_COOKIE_SECURE,
    AUTH_MAX_FAILED_ATTEMPTS: result.data.AUTH_MAX_FAILED_ATTEMPTS,
    AUTH_LOCK_MINUTES: result.data.AUTH_LOCK_MINUTES,
    EVIDENCE_STORAGE_PATH: evidenceStoragePath,
    EVIDENCE_MAX_BYTES: result.data.EVIDENCE_MAX_BYTES,
    EVIDENCE_TEMP_MAX_AGE_MINUTES: result.data.EVIDENCE_TEMP_MAX_AGE_MINUTES,
    RECURRENCE_WARNING_DAYS: result.data.RECURRENCE_WARNING_DAYS,
  };
}

export const env = parseEnvironment(process.env);
