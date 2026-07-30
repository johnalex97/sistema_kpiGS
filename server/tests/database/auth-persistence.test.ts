import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createAuthRepository } from "../../src/auth/auth.repository.js";
import { createAuthService } from "../../src/auth/auth.service.js";
import { hashPassword } from "../../src/auth/password.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

const fixedNow = new Date("2026-07-30T14:00:00.000Z");
const requestContext = {
  ipAddress: "127.0.0.1",
  userAgent: "Audit Test",
  requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("authentication persistence", () => {
  it("persists a revocable session without storing the raw token", async () => {
    const user = await database.usuario.create({
      data: {
        email: `auth.persistence.${randomUUID()}@geeksolution.example.test`,
        displayName: "Auth Persistence",
        status: "ACTIVE",
        passwordHash: "scrypt$v1$fixture",
      },
    });

    try {
      const session = await database.sesion.create({
        data: {
          userId: user.id,
          tokenHash: "a".repeat(64),
          lastSeenAt: new Date("2026-07-30T12:00:00.000Z"),
          expiresAt: new Date("2026-07-30T20:00:00.000Z"),
        },
      });

      expect(session.tokenHash).toBe("a".repeat(64));
      expect(session.revokedAt).toBeNull();
    } finally {
      await database.sesion.deleteMany({ where: { userId: user.id } });
      await database.usuario.delete({ where: { id: user.id } });
    }
  });

  it("audits critical authentication events without storing secrets", async () => {
    const password = "GeekAudit-2026!";
    const newPassword = "NewGeekAudit-2026!";
    const role = await database.rol.findUniqueOrThrow({
      where: { code: "ADMIN" },
    });
    const user = await database.usuario.create({
      data: {
        email: `auth.audit.${randomUUID()}@geeksolution.example.test`,
        displayName: "Auth Audit",
        status: "ACTIVE",
        passwordHash: await hashPassword(password, {
          N: 1024,
          r: 8,
          p: 1,
          maxmem: 16 * 1024 * 1024,
        }),
        roles: { create: { rolId: role.id } },
      },
    });
    const service = createAuthService({
      repository: createAuthRepository(database),
      now: () => fixedNow,
      config: {
        sessionTtlMinutes: 480,
        sessionIdleMinutes: 30,
        maxFailedAttempts: 5,
        lockMinutes: 15,
      },
    });

    try {
      const login = await service.login(
        { email: user.email, password },
        requestContext,
      );
      const principal = await service.authenticate(login.rawToken);
      const changed = await service.changePassword(
        principal!,
        { currentPassword: password, newPassword },
        requestContext,
      );
      await service.logout(changed.rawToken, requestContext);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await service
          .login(
            { email: user.email, password: "WrongPassword-2026!" },
            requestContext,
          )
          .catch(() => undefined);
      }

      const audits = await database.auditoria.findMany({
        where: { entity: "usuario", entityId: user.id },
        orderBy: { occurredAt: "asc" },
      });
      expect(audits.map(({ action }) => action)).toEqual(
        expect.arrayContaining([
          "AUTH_LOGIN_SUCCEEDED",
          "AUTH_PASSWORD_CHANGED",
          "AUTH_LOGOUT",
          "AUTH_ACCOUNT_LOCKED",
        ]),
      );

      const serialized = JSON.stringify(audits);
      for (const secret of [
        password,
        newPassword,
        login.rawToken,
        changed.rawToken,
        user.passwordHash!,
        "gs_session",
      ]) {
        expect(serialized).not.toContain(secret);
      }
    } finally {
      await database.sesion.deleteMany({ where: { userId: user.id } });
      await database.auditoria.deleteMany({
        where: { entity: "usuario", entityId: user.id },
      });
      await database.usuarioRol.deleteMany({ where: { usuarioId: user.id } });
      await database.usuario.delete({ where: { id: user.id } });
    }
  });
});
