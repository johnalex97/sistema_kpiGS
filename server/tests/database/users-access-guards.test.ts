import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { seedCatalogs } from "../../prisma/seed/catalogs.js";
import { changeUserAccess } from "../../src/users/users.access.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

afterAll(disconnectTestDatabase);

it("protege al último administrador y revalida al actor dentro de la transacción", async () => {
  const rollback = new Error("ROLLBACK_FIXTURE");
  try {
    await database.$transaction(async tx => {
      const catalogs = await seedCatalogs(tx, { production: true });
      await tx.usuario.updateMany({ where: { status: "ACTIVE" }, data: { status: "INACTIVE" } });
      const admin = await tx.usuario.create({ data: {
        email: `${randomUUID()}@example.test`, displayName: "Último administrador", status: "ACTIVE",
        passwordHash: "hash-de-prueba", mustChangePassword: false, roles: { create: { rolId: catalogs.roles.ADMIN! } },
      } });
      const session = await tx.sesion.create({ data: { userId: admin.id, tokenHash: randomUUID(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } });
      const actor = { userId: admin.id, requestId: randomUUID(), ipAddress: null, userAgent: null };
      await expect(changeUserAccess(tx, admin.id, { action: "status", status: "INACTIVE", version: 1 }, actor)).rejects.toMatchObject({ code: "LAST_ACTIVE_ADMIN" });
      expect((await tx.usuario.findUniqueOrThrow({ where: { id: admin.id } })).status).toBe("ACTIVE");
      expect((await tx.sesion.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
      expect(await tx.auditoria.count({ where: { entityId: admin.id, action: "USER_STATUS_CHANGED" } })).toBe(0);
      const target = await tx.usuario.create({ data: { email: `${randomUUID()}@example.test`, displayName: "Sin contraseña", status: "PENDING", passwordHash: null } });
      await expect(changeUserAccess(tx, target.id, { action: "status", status: "ACTIVE", version: 1 }, actor)).rejects.toMatchObject({ code: "USER_PASSWORD_REQUIRED" });
      await tx.usuario.update({ where: { id: admin.id }, data: { mustChangePassword: true } });
      await expect(changeUserAccess(tx, target.id, { action: "unlock", version: 1 }, actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await tx.usuario.update({ where: { id: admin.id }, data: { mustChangePassword: false, status: "INACTIVE" } });
      await expect(changeUserAccess(tx, target.id, { action: "unlock", version: 1 }, actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
});
