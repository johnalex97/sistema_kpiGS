import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { seedCatalogs } from "../../prisma/seed/catalogs.js";
import { changeUserRole } from "../../src/users/users.roles.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

afterAll(disconnectTestDatabase);

it("protege al último administrador activo sin cambiar roles ni sesiones", async () => {
  const rollback = new Error("ROLLBACK_FIXTURE");
  try {
    await database.$transaction(async tx => {
      const catalogs = await seedCatalogs(tx, { production: true });
      const roleId = catalogs.roles.ADMIN;
      if (!roleId) throw new Error("Falta ADMIN");
      // Cambios limitados a esta transacción del esquema test y revertidos al final.
      await tx.usuario.updateMany({ where: { status: "ACTIVE" }, data: { status: "INACTIVE" } });
      const user = await tx.usuario.create({ data: {
        email: `${randomUUID()}@example.test`, displayName: "Último administrador",
        status: "ACTIVE", passwordHash: "hash-de-prueba", mustChangePassword: false,
        roles: { create: { rolId: roleId } },
      } });
      const session = await tx.sesion.create({ data: {
        userId: user.id, tokenHash: randomUUID(), lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      } });
      await expect(changeUserRole(tx, user.id, { role: "TECHNICIAN", version: user.version }, {
        userId: user.id, requestId: randomUUID(), ipAddress: null, userAgent: null,
      })).rejects.toMatchObject({ code: "LAST_ACTIVE_ADMIN" });
      expect((await tx.usuarioRol.findMany({ where: { usuarioId: user.id }, include: { rol: true } })).map(item => item.rol.code)).toEqual(["ADMIN"]);
      expect((await tx.usuario.findUniqueOrThrow({ where: { id: user.id } })).version).toBe(user.version);
      expect((await tx.sesion.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
      expect(await tx.auditoria.count({ where: { entityId: user.id, action: "USER_ROLE_CHANGED" } })).toBe(0);
      const inactive = await tx.usuario.create({ data: {
        email: `${randomUUID()}@example.test`, displayName: "Administrador inactivo",
        status: "INACTIVE", passwordHash: "hash-de-prueba", roles: { create: { rolId: roleId } },
      } });
      await changeUserRole(tx, inactive.id, { role: "TECHNICIAN", version: inactive.version }, {
        userId: user.id, requestId: randomUUID(), ipAddress: null, userAgent: null,
      });
      expect((await tx.usuarioRol.findMany({ where: { usuarioId: inactive.id }, include: { rol: true } })).map(item => item.rol.code)).toEqual(["TECHNICIAN"]);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
