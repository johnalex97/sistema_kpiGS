import "dotenv/config";
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
}

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
  };
}

export const env = parseEnvironment(process.env);
