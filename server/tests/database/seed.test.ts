import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { verifyPassword } from "../../src/auth/password.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

afterAll(disconnectTestDatabase);

describe("database seed", () => {
  it("seeds twice without duplicating natural keys", async () => {
    await seedDatabase(database);
    const first = {
      roles: await database.rol.count(),
      technicians: await database.tecnico.count(),
      recurrences: await database.reincidencia.count(),
    };

    await seedDatabase(database);
    const second = {
      roles: await database.rol.count(),
      technicians: await database.tecnico.count(),
      recurrences: await database.reincidencia.count(),
    };

    expect(second).toEqual(first);
  });

  it("keeps demo users unable to authenticate", async () => {
    await seedDatabase(database);
    const demoUsers = await database.usuario.findMany({
      where: { email: { endsWith: "@geeksolution.example.test" } },
    });

    expect(demoUsers).toHaveLength(3);
    expect(demoUsers.every(({ passwordHash }) => passwordHash === null)).toBe(
      true,
    );
  });

  it("provisions an idempotent active administrator from private input", async () => {
    const email = `admin.seed.${randomUUID()}@geeksolution.example.test`;
    const options = {
      adminEmail: email.toUpperCase(),
      adminPassword: "AdminSeed-2026!",
      adminDisplayName: "Administrador Seed",
    };

    try {
      await seedDatabase(database, options);
      const first = await database.usuario.findUniqueOrThrow({
        where: { email },
        include: { roles: { include: { rol: true } } },
      });

      await seedDatabase(database, options);
      const second = await database.usuario.findUniqueOrThrow({
        where: { email },
        include: { roles: { include: { rol: true } } },
      });

      expect(second.id).toBe(first.id);
      expect(second.passwordHash).toBe(first.passwordHash);
      expect(second.status).toBe("ACTIVE");
      expect(second.mustChangePassword).toBe(true);
      expect(
        await verifyPassword("AdminSeed-2026!", second.passwordHash!),
      ).toBe(true);
      expect(second.roles.map(({ rol }) => rol.code)).toContain("ADMIN");
    } finally {
      const user = await database.usuario.findUnique({ where: { email } });
      if (user) {
        await database.sesion.deleteMany({ where: { userId: user.id } });
        await database.usuarioRol.deleteMany({ where: { usuarioId: user.id } });
        await database.usuario.delete({ where: { id: user.id } });
      }
    }
  });

  it("rejects partial administrator credentials before changing data", async () => {
    const email = `admin.partial.${randomUUID()}@geeksolution.example.test`;

    await expect(
      seedDatabase(database, { adminEmail: email }),
    ).rejects.toThrow("SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD");
    expect(await database.usuario.count({ where: { email } })).toBe(0);
  });
});
