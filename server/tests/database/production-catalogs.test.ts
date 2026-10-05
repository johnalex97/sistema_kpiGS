import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { seedCatalogs } from "../../prisma/seed/catalogs.js";
import type { SeedClient } from "../../prisma/seed/constants.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";

afterAll(disconnectTestDatabase);

// Cada prueba revierte su transacción, incluso si una aserción falla.
async function withRollback(run: (tx: SeedClient) => Promise<void>): Promise<void> {
  const rollback = new Error("ROLLBACK_FIXTURE");
  try {
    await database.$transaction(async tx => {
      await run(tx);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe("catálogos de producción", () => {
  it("carga catálogos sin crear usuarios, órdenes ni materiales de demostración", async () => {
    await withRollback(async tx => {
      const before = [await tx.usuario.count(), await tx.ordenTrabajo.count(), await tx.material.count()];
      const result = await seedCatalogs(tx, { production: true });
      expect(Object.keys(result.materials)).toEqual([]);
      expect(result.roles).toHaveProperty("TECHNICIAN");
      expect(result.serviceTypes).toHaveProperty("SUPPORT");
      expect(result.activityTypes).toHaveProperty("INSTALLATION");
      expect(result.recurrenceCauses).toHaveProperty("INCORRECT_DIAGNOSIS");
      expect([await tx.usuario.count(), await tx.ordenTrabajo.count(), await tx.material.count()]).toEqual(before);
      const technicianRoleId = result.roles.TECHNICIAN;
      if (!technicianRoleId) throw new Error("Falta el rol TECHNICIAN");
      const technicianPermissions = await tx.rolPermiso.findMany({
        where: { rolId: technicianRoleId }, include: { permiso: true },
      });
      expect(technicianPermissions.map(item => item.permiso.code)).toContain("CLIENTS_VIEW");
      expect(technicianPermissions.map(item => item.permiso.code)).not.toContain("CLIENTS_MANAGE");
    });
  });

  it("conserva nombres personalizados, roles desactivados y contraseñas existentes", async () => {
    await withRollback(async tx => {
      await seedCatalogs(tx);
      await tx.rol.update({ where: { code: "SUPERVISOR" }, data: { name: "Supervisión personalizada", isActive: false } });
      await tx.tipoServicio.update({ where: { code: "SUPPORT" }, data: { name: "Soporte personalizado", isActive: false } });
      const email = `preserved-${randomUUID()}@example.test`;
      await tx.usuario.create({ data: { email, displayName: "Usuario existente", status: "ACTIVE", passwordHash: "hash-preservado" } });
      await seedCatalogs(tx, { production: true });
      expect(await tx.rol.findUnique({ where: { code: "SUPERVISOR" } })).toMatchObject({ name: "Supervisión personalizada", isActive: false });
      expect(await tx.tipoServicio.findUnique({ where: { code: "SUPPORT" } })).toMatchObject({ name: "Soporte personalizado", isActive: false });
      expect(await tx.usuario.findUnique({ where: { email } })).toMatchObject({ passwordHash: "hash-preservado", status: "ACTIVE" });
    });
  });

  it("puede ejecutarse dos veces sin duplicar registros", async () => {
    await withRollback(async tx => {
      await seedCatalogs(tx, { production: true });
      const before = [await tx.rol.count(), await tx.permiso.count(), await tx.rolPermiso.count(), await tx.tipoServicio.count(), await tx.tipoActividad.count(), await tx.causaReincidencia.count()];
      await seedCatalogs(tx, { production: true });
      expect([await tx.rol.count(), await tx.permiso.count(), await tx.rolPermiso.count(), await tx.tipoServicio.count(), await tx.tipoActividad.count(), await tx.causaReincidencia.count()]).toEqual(before);
    });
  });
});
