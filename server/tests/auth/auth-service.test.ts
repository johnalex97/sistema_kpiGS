import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createAuthRepository } from "../../src/auth/auth.repository.js";
import { createAuthService } from "../../src/auth/auth.service.js";
import {
  hashPassword,
  verifyPassword,
} from "../../src/auth/password.js";
import { ApiError } from "../../src/utils/api-error.js";
import {
  database,
  disconnectTestDatabase,
} from "../database/database-test-context.js";

const fixedNow = new Date("2026-07-30T12:00:00.000Z");
const requestContext = {
  ipAddress: "127.0.0.1",
  userAgent: "Vitest",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const testScryptOptions = {
  N: 1024,
  r: 8,
  p: 1,
  maxmem: 16 * 1024 * 1024,
};

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

async function createAdminUser(password: string) {
  const email = `auth.service.${randomUUID()}@geeksolution.example.test`;
  const role = await database.rol.findUniqueOrThrow({
    where: { code: "ADMIN" },
  });
  const user = await database.usuario.create({
    data: {
      email,
      displayName: "Auth Service",
      status: "ACTIVE",
      passwordHash: await hashPassword(password, testScryptOptions),
      roles: { create: { rolId: role.id } },
    },
  });
  return user;
}

async function cleanupUser(userId: string): Promise<void> {
  await database.sesion.deleteMany({ where: { userId } });
  await database.auditoria.deleteMany({
    where: { entity: "usuario", entityId: userId },
  });
  await database.usuarioRol.deleteMany({ where: { usuarioId: userId } });
  await database.tecnico.updateMany({
    where: { userId },
    data: { userId: null },
  });
  await database.usuario.delete({ where: { id: userId } });
}

function createService() {
  return createAuthService({
    repository: createAuthRepository(database),
    now: () => fixedNow,
    config: {
      sessionTtlMinutes: 480,
      sessionIdleMinutes: 30,
      maxFailedAttempts: 5,
      lockMinutes: 15,
    },
  });
}

describe("authentication service login", () => {
  it("creates a persisted session and returns public authorization data", async () => {
    const password = "GeekLogin-2026!";
    const user = await createAdminUser(password);

    try {
      const result = await createService().login(
        { email: user.email.toUpperCase(), password },
        requestContext,
      );

      expect(result.user).toMatchObject({
        email: user.email,
        displayName: "Auth Service",
        mustChangePassword: true,
        roles: ["ADMIN"],
      });
      expect(result.user.permissions).toContain("USERS_MANAGE");
      expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(
        await database.sesion.count({ where: { userId: user.id } }),
      ).toBe(1);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it("locks an account on the fifth invalid password without changing its public error", async () => {
    const user = await createAdminUser("GeekLogin-2026!");
    const service = createService();

    try {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const error = await service
          .login(
            { email: user.email, password: "WrongPassword-2026!" },
            requestContext,
          )
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
          statusCode: 401,
          code: "INVALID_CREDENTIALS",
        });
      }

      const locked = await database.usuario.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(locked.failedLoginAttempts).toBe(5);
      expect(locked.lockedUntil).toEqual(
        new Date("2026-07-30T12:15:00.000Z"),
      );
    } finally {
      await cleanupUser(user.id);
    }
  });
});

describe("authentication service sessions", () => {
  it("authenticates an active token and rejects it at expiry boundaries", async () => {
    const user = await createAdminUser("GeekSession-2026!");
    const service = createService();

    try {
      const login = await service.login(
        { email: user.email, password: "GeekSession-2026!" },
        requestContext,
      );

      await expect(service.authenticate(login.rawToken)).resolves.toMatchObject({
        userId: user.id,
        email: user.email,
        sessionId: expect.any(String),
        roles: ["ADMIN"],
      });

      await database.sesion.updateMany({
        where: { userId: user.id },
        data: { expiresAt: fixedNow },
      });
      await expect(service.authenticate(login.rawToken)).resolves.toBeNull();
    } finally {
      await cleanupUser(user.id);
    }
  });

  it("rejects idle and revoked sessions", async () => {
    const user = await createAdminUser("GeekSession-2026!");
    const service = createService();

    try {
      const idleLogin = await service.login(
        { email: user.email, password: "GeekSession-2026!" },
        requestContext,
      );
      await database.sesion.updateMany({
        where: { userId: user.id },
        data: { lastSeenAt: new Date("2026-07-30T11:30:00.000Z") },
      });
      await expect(service.authenticate(idleLogin.rawToken)).resolves.toBeNull();

      const revokedLogin = await service.login(
        { email: user.email, password: "GeekSession-2026!" },
        requestContext,
      );
      await service.logout(revokedLogin.rawToken, requestContext);
      await expect(
        service.authenticate(revokedLogin.rawToken),
      ).resolves.toBeNull();
      await expect(
        service.logout("unknown-token", requestContext),
      ).resolves.toBeUndefined();
    } finally {
      await cleanupUser(user.id);
    }
  });
});

describe("authentication service password change", () => {
  it("rejects an incorrect or reused current password", async () => {
    const password = "GeekChange-2026!";
    const user = await createAdminUser(password);
    const service = createService();

    try {
      const login = await service.login(
        { email: user.email, password },
        requestContext,
      );
      const principal = await service.authenticate(login.rawToken);
      expect(principal).not.toBeNull();

      for (const input of [
        {
          currentPassword: "WrongPassword-2026!",
          newPassword: "NewGeekChange-2026!",
        },
        { currentPassword: password, newPassword: password },
      ]) {
        const error = await service
          .changePassword(principal!, input, requestContext)
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ApiError);
      }
    } finally {
      await cleanupUser(user.id);
    }
  });

  it("changes the password and rotates only the current session", async () => {
    const password = "GeekChange-2026!";
    const newPassword = "NewGeekChange-2026!";
    const user = await createAdminUser(password);
    const service = createService();

    try {
      const currentLogin = await service.login(
        { email: user.email, password },
        requestContext,
      );
      const otherLogin = await service.login(
        { email: user.email, password },
        requestContext,
      );
      const principal = await service.authenticate(currentLogin.rawToken);

      const result = await service.changePassword(
        principal!,
        { currentPassword: password, newPassword },
        requestContext,
      );

      expect(result.user.mustChangePassword).toBe(false);
      expect(result.rawToken).not.toBe(currentLogin.rawToken);
      await expect(
        service.authenticate(currentLogin.rawToken),
      ).resolves.toBeNull();
      await expect(
        service.authenticate(otherLogin.rawToken),
      ).resolves.toBeNull();
      await expect(service.authenticate(result.rawToken)).resolves.toMatchObject(
        { userId: user.id, mustChangePassword: false },
      );

      const changed = await database.usuario.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(changed.passwordChangedAt).toEqual(fixedNow);
      expect(await verifyPassword(newPassword, changed.passwordHash!)).toBe(
        true,
      );
      expect(
        await database.sesion.count({
          where: { userId: user.id, revokedAt: null },
        }),
      ).toBe(1);
    } finally {
      await cleanupUser(user.id);
    }
  });
});
