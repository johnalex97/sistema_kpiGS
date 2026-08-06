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
  it("assigns client reading to every role and management only to leaders", async () => {
    await seedDatabase(database);
    const roles = await database.rol.findMany({
      where: { code: { in: ["ADMIN", "SUPERVISOR", "TECHNICIAN"] } },
      include: { permissions: { include: { permiso: true } } },
    });
    const rolePermissions = Object.fromEntries(
      roles.map((role) => [
        role.code,
        role.permissions.map(({ permiso }) => permiso.code),
      ]),
    );

    expect(rolePermissions.ADMIN).toEqual(
      expect.arrayContaining(["CLIENTS_VIEW", "CLIENTS_MANAGE"]),
    );
    expect(rolePermissions.SUPERVISOR).toEqual(
      expect.arrayContaining(["CLIENTS_VIEW", "CLIENTS_MANAGE"]),
    );
    expect(rolePermissions.TECHNICIAN).toContain("CLIENTS_VIEW");
    expect(rolePermissions.TECHNICIAN).not.toContain("CLIENTS_MANAGE");
  });

  it("seeds twice without duplicating natural keys", async () => {
    await seedDatabase(database);
    const first = {
      roles: await database.rol.count(),
      rolePermissions: await database.rolPermiso.count(),
      technicians: await database.tecnico.count(),
      recurrences: await database.reincidencia.count(),
    };

    await seedDatabase(database);
    const second = {
      roles: await database.rol.count(),
      rolePermissions: await database.rolPermiso.count(),
      technicians: await database.tecnico.count(),
      recurrences: await database.reincidencia.count(),
    };

    expect(second).toEqual(first);
  });

  it("grants the order permissions after an idempotent second seed", async () => {
    await seedDatabase(database);
    await seedDatabase(database);
    const roles = await database.rol.findMany({
      where: { code: { in: ["SUPERVISOR", "TECHNICIAN"] } },
      include: { permissions: { include: { permiso: true } } },
    });
    const rolePermissions = Object.fromEntries(
      roles.map((role) => [
        role.code,
        role.permissions.map(({ permiso }) => permiso.code),
      ]),
    );
    const supervisorPermissions = rolePermissions.SUPERVISOR ?? [];
    const technicianPermissions = rolePermissions.TECHNICIAN ?? [];

    expect(supervisorPermissions).toEqual(
      expect.arrayContaining(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]),
    );
    expect(technicianPermissions).toEqual(
      expect.arrayContaining(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]),
    );
  });

  it("grants activity permissions exactly once after an idempotent second seed", async () => {
    await seedDatabase(database);
    await seedDatabase(database);
    const roles = await database.rol.findMany({
      where: { code: { in: ["SUPERVISOR", "TECHNICIAN"] } },
      include: { permissions: { include: { permiso: true } } },
    });
    const rolePermissions = Object.fromEntries(
      roles.map((role) => [
        role.code,
        role.permissions.map(({ permiso }) => permiso.code),
      ]),
    );
    const supervisorPermissions = rolePermissions.SUPERVISOR ?? [];
    const technicianPermissions = rolePermissions.TECHNICIAN ?? [];
    const activityPermissionCodes = [
      "ACTIVITIES_VIEW_ALL",
      "ACTIVITIES_MANAGE",
      "ACTIVITIES_CREATE_OWN",
      "ACTIVITIES_OPERATE_OWN",
    ];

    expect(technicianPermissions).toEqual(
      expect.arrayContaining([
        "ACTIVITIES_CREATE_OWN",
        "ACTIVITIES_OPERATE_OWN",
      ]),
    );
    expect(supervisorPermissions).toEqual(
      expect.arrayContaining([
        "ACTIVITIES_VIEW_ALL",
        "ACTIVITIES_MANAGE",
      ]),
    );

    const allPermissionCodes = (
      await database.permiso.findMany({ select: { code: true } })
    ).map(({ code }) => code);
    expect(allPermissionCodes).not.toContain("ACTIVITIES_MANAGE_OWN");

    for (const code of activityPermissionCodes) {
      expect(await database.permiso.count({ where: { code } })).toBe(1);
    }

    expect(
      await database.rolPermiso.count({
        where: { permiso: { code: { in: activityPermissionCodes } } },
      }),
    ).toBe(8);
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
