import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env.js";

const developmentDatabaseUrl =
  "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public";
const testDatabaseUrl =
  "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test";
const base = {
  DATABASE_URL: developmentDatabaseUrl,
  DATABASE_TEST_URL: testDatabaseUrl,
};

describe("parseEnvironment", () => {
  it("requires a PostgreSQL development URL", () => {
    expect(() => parseEnvironment({})).toThrow(
      "Configuración de entorno inválida",
    );
  });

  it("applies safe defaults", () => {
    expect(
      parseEnvironment({
        DATABASE_URL: developmentDatabaseUrl,
        DATABASE_TEST_URL: testDatabaseUrl,
      }),
    ).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      CORS_ORIGINS: ["http://localhost:5173"],
      LOG_LEVEL: "info",
      JSON_BODY_LIMIT: "1mb",
      DATABASE_URL: developmentDatabaseUrl,
      DATABASE_TEST_URL: testDatabaseUrl,
      AUTH_SESSION_TTL_MINUTES: 480,
      AUTH_SESSION_IDLE_MINUTES: 30,
      AUTH_COOKIE_SECURE: false,
      AUTH_MAX_FAILED_ATTEMPTS: 5,
      AUTH_LOCK_MINUTES: 15,
      EVIDENCE_STORAGE_PATH: expect.any(String),
      EVIDENCE_MAX_BYTES: 10_485_760,
      EVIDENCE_TEMP_MAX_AGE_MINUTES: 60,
      RECURRENCE_WARNING_DAYS: 30,
      KPI_TIME_ZONE: "America/Tegucigalpa",
    });
  });

  it("defaults the KPI timezone and rejects unknown IANA zones", () => {
    expect(parseEnvironment(base).KPI_TIME_ZONE).toBe("America/Tegucigalpa");
    expect(() => parseEnvironment({ ...base, KPI_TIME_ZONE: "Mars/Olympus" }))
      .toThrow("KPI_TIME_ZONE");
  });

  it("applies safe evidence storage defaults", () => {
    expect(parseEnvironment(base)).toMatchObject({
      EVIDENCE_STORAGE_PATH: expect.any(String),
      EVIDENCE_MAX_BYTES: 10_485_760,
      EVIDENCE_TEMP_MAX_AGE_MINUTES: 60,
    });
  });

  it("defaults recurrence warning days and accepts its inclusive bounds", () => {
    expect(parseEnvironment(base).RECURRENCE_WARNING_DAYS).toBe(30);
    expect(
      parseEnvironment({ ...base, RECURRENCE_WARNING_DAYS: "1" })
        .RECURRENCE_WARNING_DAYS,
    ).toBe(1);
    expect(
      parseEnvironment({ ...base, RECURRENCE_WARNING_DAYS: "365" })
        .RECURRENCE_WARNING_DAYS,
    ).toBe(365);
  });

  it.each(["0", "366", "30.5", "not-a-number"])(
    "rejects invalid recurrence warning days: %s",
    (RECURRENCE_WARNING_DAYS) => {
      expect(() =>
        parseEnvironment({ ...base, RECURRENCE_WARNING_DAYS }),
      ).toThrow("RECURRENCE_WARNING_DAYS");
    },
  );

  it("rejects evidence uploads above the hard size ceiling", () => {
    expect(() =>
      parseEnvironment({ ...base, EVIDENCE_MAX_BYTES: "10485761" }),
    ).toThrow("EVIDENCE_MAX_BYTES");
  });

  it("requires a positive temporary evidence age", () => {
    expect(() =>
      parseEnvironment({ ...base, EVIDENCE_TEMP_MAX_AGE_MINUTES: "0" }),
    ).toThrow("EVIDENCE_TEMP_MAX_AGE_MINUTES");
  });

  it("requires an absolute private evidence path in production", () => {
    expect(() =>
      parseEnvironment({
        ...base,
        NODE_ENV: "production",
        AUTH_COOKIE_SECURE: "true",
        EVIDENCE_STORAGE_PATH: "relative",
      }),
    ).toThrow(
      "Configuración de entorno inválida: EVIDENCE_STORAGE_PATH debe ser una ruta absoluta y privada en producción",
    );
  });

  it("rejects protected evidence paths when started from the repository root", () => {
    const serverRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const repositoryRoot = path.dirname(serverRoot);
    const originalWorkingDirectory = process.cwd();
    const productionBase = {
      ...base,
      NODE_ENV: "production" as const,
      AUTH_COOKIE_SECURE: "true",
    };
    const protectedPaths = [
      path.join(serverRoot, "public", "evidences"),
      path.join(serverRoot, "dist", "evidences"),
      path.join(repositoryRoot, "dist", "evidences"),
    ];

    process.chdir(repositoryRoot);
    try {
      for (const evidenceStoragePath of protectedPaths) {
        expect(() =>
          parseEnvironment({
            ...productionBase,
            EVIDENCE_STORAGE_PATH: evidenceStoragePath,
          }),
        ).toThrow("EVIDENCE_STORAGE_PATH");
      }
    } finally {
      process.chdir(originalWorkingDirectory);
    }
  });

  it("provides safe local authentication defaults", () => {
    const result = parseEnvironment({
      DATABASE_URL: developmentDatabaseUrl,
      DATABASE_TEST_URL: testDatabaseUrl,
    });

    expect(result.AUTH_SESSION_TTL_MINUTES).toBe(480);
    expect(result.AUTH_SESSION_IDLE_MINUTES).toBe(30);
    expect(result.AUTH_COOKIE_SECURE).toBe(false);
    expect(result.AUTH_MAX_FAILED_ATTEMPTS).toBe(5);
    expect(result.AUTH_LOCK_MINUTES).toBe(15);
  });

  it("requires secure cookies in production", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        AUTH_COOKIE_SECURE: "false",
        DATABASE_URL: developmentDatabaseUrl,
        DATABASE_TEST_URL: testDatabaseUrl,
      }),
    ).toThrow("AUTH_COOKIE_SECURE debe ser true en producción");
  });

  it("rejects an idle timeout greater than the absolute lifetime", () => {
    expect(() =>
      parseEnvironment({
        AUTH_SESSION_TTL_MINUTES: "30",
        AUTH_SESSION_IDLE_MINUTES: "31",
        DATABASE_URL: developmentDatabaseUrl,
        DATABASE_TEST_URL: testDatabaseUrl,
      }),
    ).toThrow("AUTH_SESSION_IDLE_MINUTES");
  });

  it("normalizes a comma-separated CORS allowlist", () => {
    const result = parseEnvironment({
      CORS_ORIGIN: "https://admin.example.com, https://ops.example.com ",
      DATABASE_URL: developmentDatabaseUrl,
      DATABASE_TEST_URL: testDatabaseUrl,
    });

    expect(result.CORS_ORIGINS).toEqual([
      "https://admin.example.com",
      "https://ops.example.com",
    ]);
  });

  it("rejects an invalid port", () => {
    expect(() =>
      parseEnvironment({
        PORT: "0",
        DATABASE_URL: developmentDatabaseUrl,
        DATABASE_TEST_URL: testDatabaseUrl,
      }),
    ).toThrow("Configuración de entorno inválida");
  });

  it("rejects an unsupported log level", () => {
    expect(() =>
      parseEnvironment({
        LOG_LEVEL: "verbose",
        DATABASE_URL: developmentDatabaseUrl,
        DATABASE_TEST_URL: testDatabaseUrl,
      }),
    ).toThrow("Configuración de entorno inválida");
  });

  it("accepts isolated development and test schemas", () => {
    const result = parseEnvironment({
      DATABASE_URL: developmentDatabaseUrl,
      DATABASE_TEST_URL: testDatabaseUrl,
    });

    expect(result.DATABASE_URL).toBe(developmentDatabaseUrl);
    expect(result.DATABASE_TEST_URL).toBe(testDatabaseUrl);
  });

  it("rejects a non-PostgreSQL URL", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: "file:./local.db",
        DATABASE_TEST_URL: testDatabaseUrl,
      }),
    ).toThrow("Configuración de entorno inválida");
  });

  it("rejects a test URL that targets the public schema", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: developmentDatabaseUrl,
        DATABASE_TEST_URL: developmentDatabaseUrl,
      }),
    ).toThrow("DATABASE_TEST_URL debe utilizar el esquema test");
  });
});
