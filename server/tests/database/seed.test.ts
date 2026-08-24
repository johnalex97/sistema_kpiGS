import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { seedIds } from "../../prisma/seed/constants.js";
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

  it("assigns evidence viewing and upload to technicians, with management reserved for leaders", async () => {
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
      expect.arrayContaining([
        "EVIDENCES_VIEW",
        "EVIDENCES_UPLOAD",
        "EVIDENCES_MANAGE",
      ]),
    );
    expect(rolePermissions.SUPERVISOR).toEqual(
      expect.arrayContaining([
        "EVIDENCES_VIEW",
        "EVIDENCES_UPLOAD",
        "EVIDENCES_MANAGE",
      ]),
    );
    expect(rolePermissions.TECHNICIAN).toEqual(
      expect.arrayContaining(["EVIDENCES_VIEW", "EVIDENCES_UPLOAD"]),
    );
    expect(rolePermissions.TECHNICIAN).not.toContain("EVIDENCES_MANAGE");
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

    await expect(database.permiso.findUniqueOrThrow({
      where: { code: "ACTIVITIES_CREATE_OWN" },
      select: { description: true },
    })).resolves.toEqual({ description: "Permiso activities_create_own" });

    expect(
      await database.rolPermiso.count({
        where: { permiso: { code: { in: activityPermissionCodes } } },
      }),
    ).toBe(8);
  });

  it("seeds visibility ACL rows for every current activity participant", async () => {
    await seedDatabase(database);
    await seedDatabase(database);

    const rows = await database.$queryRaw<Array<{ missing: bigint }>>`
      SELECT COUNT(*) AS "missing"
      FROM "actividad_tecnico" AS team
      LEFT JOIN "actividad_visibilidad_tecnico" AS visibility
        ON visibility."actividad_id" = team."actividad_id"
       AND visibility."tecnico_id" = team."tecnico_id"
      WHERE visibility."actividad_id" IS NULL
    `;

    expect(Number(rows[0]?.missing ?? -1)).toBe(0);
  });

  it("grants the exact reviewed recurrence permissions after an idempotent second seed", async () => {
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
      expect.arrayContaining(["RECURRENCES_VIEW_ALL", "RECURRENCES_REVIEW"]),
    );
    expect(technicianPermissions).toEqual(
      expect.arrayContaining(["RECURRENCES_VIEW_OWN", "RECURRENCES_REPORT_OWN"]),
    );
    expect(technicianPermissions).not.toContain("RECURRENCES_REVIEW");

    const recurrencePermissionCodes = [
      "RECURRENCES_VIEW_ALL",
      "RECURRENCES_VIEW_OWN",
      "RECURRENCES_REPORT_OWN",
      "RECURRENCES_REVIEW",
    ];
    for (const code of recurrencePermissionCodes) {
      expect(await database.permiso.count({ where: { code } })).toBe(1);
    }
  });

  it("upserts stable recurrence numbers and workflow actors", async () => {
    await seedDatabase(database);
    await seedDatabase(database);
    const [technician, supervisor, recurrences] = await Promise.all([
      database.usuario.findUniqueOrThrow({
        where: { email: "tecnico.demo@geeksolution.example.test" },
      }),
      database.usuario.findUniqueOrThrow({
        where: { email: "supervision.demo@geeksolution.example.test" },
      }),
      database.reincidencia.findMany({
        where: {
          id: { in: [seedIds.recurrences.technical, seedIds.recurrences.equipment] },
        },
        orderBy: { recurrenceNumber: "asc" },
        select: {
          recurrenceNumber: true,
          reportedById: true,
          reviewedById: true,
          reviewedAt: true,
        },
      }),
    ]);

    expect(recurrences).toEqual([
      {
        recurrenceNumber: "RI-2026-0001",
        reportedById: technician.id,
        reviewedById: supervisor.id,
        reviewedAt: new Date("2026-07-28T16:00:00.000Z"),
      },
      {
        recurrenceNumber: "RI-2026-0002",
        reportedById: technician.id,
        reviewedById: supervisor.id,
        reviewedAt: new Date("2026-07-29T15:00:00.000Z"),
      },
    ]);
  });

  it("seeds approved KPI weights, weekly goals, and role permissions", async () => {
    await seedDatabase(database);
    const configuration = await database.configuracionKPI.findUniqueOrThrow({ where: { version: 1 } });
    expect([
      configuration.productivityWeight.toFixed(4),
      configuration.complianceWeight.toFixed(4),
      configuration.efficiencyWeight.toFixed(4),
      configuration.qualityWeight.toFixed(4),
    ]).toEqual(["0.2000", "0.2500", "0.2500", "0.3000"]);
    const goals = await database.metaTecnico.findMany();
    expect(goals.length).toBeGreaterThan(0);
    expect(goals.every((goal) =>
      (goal.periodEnd.getTime() - goal.periodStart.getTime()) / 86_400_000 === 6,
    )).toBe(true);
    const supervisor = await database.rol.findUniqueOrThrow({
      where: { code: "SUPERVISOR" },
      include: { permissions: { include: { permiso: true } } },
    });
    expect(supervisor.permissions.map(({ permiso }) => permiso.code)).toEqual(
      expect.arrayContaining([
        "KPI_VIEW_ALL",
        "KPI_MANAGE_TARGETS",
        "KPI_MANAGE_CONFIGURATION",
        "KPI_CLOSE_WEEK",
        "KPI_RECALCULATE",
        "KPI_VIEW_AUDIT",
      ]),
    );
  });

  it("raises the seeded annual recurrence sequence without regressing it", async () => {
    await database.secuenciaReincidencia.deleteMany({ where: { year: 2026 } });

    try {
      await seedDatabase(database);
      await seedDatabase(database);

      await expect(
        database.secuenciaReincidencia.findUniqueOrThrow({
          where: { year: 2026 },
          select: { year: true, lastNumber: true },
        }),
      ).resolves.toEqual({ year: 2026, lastNumber: 2 });

      await database.secuenciaReincidencia.update({
        where: { year: 2026 },
        data: { lastNumber: 99 },
      });
      await seedDatabase(database);

      await expect(
        database.secuenciaReincidencia.findUniqueOrThrow({
          where: { year: 2026 },
          select: { year: true, lastNumber: true },
        }),
      ).resolves.toEqual({ year: 2026, lastNumber: 99 });
    } finally {
      await database.secuenciaReincidencia.upsert({
        where: { year: 2026 },
        update: { lastNumber: 2 },
        create: { year: 2026, lastNumber: 2 },
      });
    }
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
