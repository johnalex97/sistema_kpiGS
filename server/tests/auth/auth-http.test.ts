import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { parseEnvironment } from "../../src/config/env.js";
import { silentLogger } from "../../src/utils/logger.js";
import {
  database,
  disconnectTestDatabase,
} from "../database/database-test-context.js";

const allowedOrigin = "http://localhost:5173";
const env = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGIN: allowedOrigin,
  DATABASE_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});
const testScryptOptions = {
  N: 1024,
  r: 8,
  p: 1,
  maxmem: 16 * 1024 * 1024,
};

function firstSetCookie(
  headers: Record<string, string | string[] | undefined>,
): string {
  const cookies = headers["set-cookie"];
  const cookie = Array.isArray(cookies) ? cookies[0] : cookies;
  if (!cookie) throw new Error("La respuesta no incluyó Set-Cookie");
  return cookie;
}

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

async function createHttpAdmin(password: string) {
  const role = await database.rol.findUniqueOrThrow({
    where: { code: "ADMIN" },
  });
  return database.usuario.create({
    data: {
      email: `auth.http.${randomUUID()}@geeksolution.example.test`,
      displayName: "Auth HTTP",
      status: "ACTIVE",
      passwordHash: await hashPassword(password, testScryptOptions),
      roles: { create: { rolId: role.id } },
    },
  });
}

async function cleanupHttpUser(userId: string): Promise<void> {
  await database.sesion.deleteMany({ where: { userId } });
  await database.auditoria.deleteMany({
    where: { entity: "usuario", entityId: userId },
  });
  await database.usuarioRol.deleteMany({ where: { usuarioId: userId } });
  await database.usuario.delete({ where: { id: userId } });
}

describe("authentication HTTP API", () => {
  it("logs in with the public contract and a protected local cookie", async () => {
    const password = "GeekHttp-2026!";
    const admin = await createHttpAdmin(password);

    try {
      const response = await request(
        createApp({ env, logger: silentLogger, database }),
      )
        .post("/api/v1/auth/login")
        .set("Origin", allowedOrigin)
        .send({ email: admin.email.toUpperCase(), password })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: admin.id,
            email: admin.email,
            displayName: "Auth HTTP",
            mustChangePassword: true,
            roles: ["ADMIN"],
          },
        },
        errors: [],
        meta: { requestId: expect.any(String) },
      });
      const cookie = firstSetCookie(response.headers);
      expect(cookie).toContain("gs_session=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
      expect(cookie).not.toContain("Secure");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    } finally {
      await cleanupHttpUser(admin.id);
    }
  });

  it("does not accept login without an allowed Origin", async () => {
    const response = await request(
      createApp({ env, logger: silentLogger, database }),
    )
      .post("/api/v1/auth/login")
      .send({
        email: "unknown@geeksolution.example.test",
        password: "UnknownUser-2026!",
      })
      .expect(403);

    expect(response.body.errors[0].code).toBe("ORIGIN_REQUIRED");
  });

  it("uses a Secure session cookie when production requires it", async () => {
    const password = "GeekSecure-2026!";
    const admin = await createHttpAdmin(password);
    const productionEnv = parseEnvironment({
      NODE_ENV: "production",
      LOG_LEVEL: "silent",
      CORS_ORIGIN: allowedOrigin,
      AUTH_COOKIE_SECURE: "true",
      DATABASE_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
      DATABASE_TEST_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
    });

    try {
      const response = await request(
        createApp({
          env: productionEnv,
          logger: silentLogger,
          database,
        }),
      )
        .post("/api/v1/auth/login")
        .set("Origin", allowedOrigin)
        .send({ email: admin.email, password })
        .expect(200);

      expect(firstSetCookie(response.headers)).toContain("Secure");
    } finally {
      await cleanupHttpUser(admin.id);
    }
  });

  it("returns the current user, changes password, and logs out idempotently", async () => {
    const password = "GeekFlow-2026!";
    const newPassword = "NewGeekFlow-2026!";
    const admin = await createHttpAdmin(password);
    const agent = request.agent(
      createApp({ env, logger: silentLogger, database }),
    );

    try {
      const login = await agent
        .post("/api/v1/auth/login")
        .set("Origin", allowedOrigin)
        .send({ email: admin.email, password })
        .expect(200);
      const loginCookie = firstSetCookie(login.headers);

      const beforeChange = await agent.get("/api/v1/auth/me").expect(200);
      expect(beforeChange.body.data.user.mustChangePassword).toBe(true);

      const changed = await agent
        .post("/api/v1/auth/change-password")
        .set("Origin", allowedOrigin)
        .send({ currentPassword: password, newPassword })
        .expect(200);
      const changedCookie = firstSetCookie(changed.headers);
      expect(changedCookie).not.toBe(loginCookie);
      expect(changed.body.data.user.mustChangePassword).toBe(false);

      const afterChange = await agent.get("/api/v1/auth/me").expect(200);
      expect(afterChange.body.data.user.mustChangePassword).toBe(false);

      const logout = await agent
        .post("/api/v1/auth/logout")
        .set("Origin", allowedOrigin)
        .expect(204);
      expect(firstSetCookie(logout.headers)).toContain("Max-Age=0");

      await agent.get("/api/v1/auth/me").expect(401);
      await agent
        .post("/api/v1/auth/logout")
        .set("Origin", allowedOrigin)
        .expect(204);
    } finally {
      await cleanupHttpUser(admin.id);
    }
  });
});
