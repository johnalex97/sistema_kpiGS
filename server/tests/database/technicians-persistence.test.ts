import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createTechniciansRepository } from "../../src/technicians/technicians.repository.js";
import { createTechniciansService } from "../../src/technicians/technicians.service.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("technician persistence constraints", () => {
  it("allocates a code number after the existing seed range", async () => {
    const rows = await database.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('tecnico_code_seq') AS value
    `;

    expect(Number(rows[0]?.value)).toBeGreaterThanOrEqual(4);
  });

  it("rejects equal active work emails ignoring case", async () => {
    const suffix = randomUUID().slice(0, 8);
    const firstId = randomUUID();
    const secondId = randomUUID();

    try {
      await database.tecnico.create({
        data: {
          id: firstId,
          code: `TEST-${suffix}-A`,
          fullName: "Correo activo A",
          workEmail: `Unique.${suffix}@Example.Test`,
        },
      });

      await expect(
        database.tecnico.create({
          data: {
            id: secondId,
            code: `TEST-${suffix}-B`,
            fullName: "Correo activo B",
            workEmail: `unique.${suffix}@example.test`,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await database.tecnico.deleteMany({
        where: { id: { in: [firstId, secondId] } },
      });
    }
  });

  it("allows reuse of a work email after soft deletion", async () => {
    const suffix = randomUUID().slice(0, 8);
    const firstId = randomUUID();
    const secondId = randomUUID();

    try {
      await database.tecnico.create({
        data: {
          id: firstId,
          code: `TEST-${suffix}-C`,
          fullName: "Correo inactivo",
          workEmail: `Reuse.${suffix}@Example.Test`,
          status: "INACTIVE",
          deletedAt: new Date("2026-07-30T12:00:00.000Z"),
        },
      });

      const active = await database.tecnico.create({
        data: {
          id: secondId,
          code: `TEST-${suffix}-D`,
          fullName: "Correo reutilizado",
          workEmail: `reuse.${suffix}@example.test`,
        },
      });

      expect(active.workEmail).toBe(`reuse.${suffix}@example.test`);
    } finally {
      await database.tecnico.deleteMany({
        where: { id: { in: [firstId, secondId] } },
      });
    }
  });
});

describe("technician repository reads", () => {
  it("searches labor fields case-insensitively and paginates stably", async () => {
    const suffix = randomUUID().slice(0, 8);
    const ids = [
      "71000000-0000-4000-8000-000000000001",
      "71000000-0000-4000-8000-000000000002",
      "71000000-0000-4000-8000-000000000003",
      "71000000-0000-4000-8000-000000000004",
    ];
    const repository = createTechniciansRepository(database);

    try {
      await database.tecnico.createMany({
        data: [
          {
            id: ids[0]!,
            code: `SRCH-${suffix}-A`,
            fullName: `Álvaro ${suffix}`,
            specialty: "Fibra Óptica",
          },
          {
            id: ids[1]!,
            code: `SRCH-${suffix}-B`,
            fullName: `Beatriz ${suffix}`,
            workEmail: `FIELD.${suffix}@EXAMPLE.TEST`,
          },
          {
            id: ids[2]!,
            code: `SRCH-${suffix}-C`,
            fullName: `Carlos ${suffix}`,
            specialty: `Especialidad ${suffix}`,
          },
          {
            id: ids[3]!,
            code: `SRCH-${suffix}-D`,
            fullName: `Diana ${suffix}`,
          },
        ],
      });

      const byCode = await repository.list({
        search: `srch-${suffix}-a`,
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const byName = await repository.list({
        search: `beatriz ${suffix}`,
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const bySpecialty = await repository.list({
        search: `especialidad ${suffix}`,
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const byEmail = await repository.list({
        search: `field.${suffix}@example.test`,
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const firstPage = await repository.list({
        search: suffix,
        page: 1,
        pageSize: 2,
        includeInactive: false,
      });

      expect(byCode.items.map(({ id }) => id)).toEqual([ids[0]]);
      expect(byName.items.map(({ id }) => id)).toEqual([ids[1]]);
      expect(bySpecialty.items.map(({ id }) => id)).toEqual([ids[2]]);
      expect(byEmail.items.map(({ id }) => id)).toEqual([ids[1]]);
      expect(firstPage.totalItems).toBe(4);
      expect(firstPage.items.map(({ fullName }) => fullName)).toEqual([
        `Álvaro ${suffix}`,
        `Beatriz ${suffix}`,
      ]);
    } finally {
      await database.tecnico.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("excludes inactive technicians unless explicitly requested", async () => {
    const suffix = randomUUID().slice(0, 8);
    const activeId = randomUUID();
    const inactiveId = randomUUID();
    const repository = createTechniciansRepository(database);

    try {
      await database.tecnico.createMany({
        data: [
          {
            id: activeId,
            code: `LIFE-${suffix}-A`,
            fullName: `Activo ${suffix}`,
          },
          {
            id: inactiveId,
            code: `LIFE-${suffix}-I`,
            fullName: `Inactivo ${suffix}`,
            status: "INACTIVE",
            deletedAt: new Date("2026-07-30T12:00:00.000Z"),
          },
        ],
      });

      const activeOnly = await repository.list({
        search: suffix,
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const inactiveOnly = await repository.list({
        search: suffix,
        status: "INACTIVE",
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const all = await repository.list({
        search: suffix,
        page: 1,
        pageSize: 20,
        includeInactive: true,
      });

      expect(activeOnly.items.map(({ id }) => id)).toEqual([activeId]);
      expect(inactiveOnly.items.map(({ id }) => id)).toEqual([inactiveId]);
      expect(all.totalItems).toBe(2);
    } finally {
      await database.tecnico.deleteMany({
        where: { id: { in: [activeId, inactiveId] } },
      });
    }
  });

  it("classifies users by role, lifecycle, and existing technician link", async () => {
    const suffix = randomUUID().slice(0, 8);
    const repository = createTechniciansRepository(database);
    const technicianRole = await database.rol.findUniqueOrThrow({
      where: { code: "TECHNICIAN" },
    });
    const adminRole = await database.rol.findUniqueOrThrow({
      where: { code: "ADMIN" },
    });
    const eligibleId = randomUUID();
    const inactiveId = randomUUID();
    const deletedId = randomUUID();
    const wrongRoleId = randomUUID();
    const linkedId = randomUUID();
    const linkedTechnicianId = randomUUID();
    const userIds = [
      eligibleId,
      inactiveId,
      deletedId,
      wrongRoleId,
      linkedId,
    ];

    try {
      await database.usuario.create({
        data: {
          id: eligibleId,
          email: `eligible.${suffix}@example.test`,
          displayName: "Usuario elegible",
          status: "ACTIVE",
          roles: { create: { rolId: technicianRole.id } },
        },
      });
      await database.usuario.create({
        data: {
          id: inactiveId,
          email: `inactive.${suffix}@example.test`,
          displayName: "Usuario inactivo",
          status: "INACTIVE",
          roles: { create: { rolId: technicianRole.id } },
        },
      });
      await database.usuario.create({
        data: {
          id: deletedId,
          email: `deleted.${suffix}@example.test`,
          displayName: "Usuario eliminado",
          status: "ACTIVE",
          deletedAt: new Date("2026-07-30T12:00:00.000Z"),
          roles: { create: { rolId: technicianRole.id } },
        },
      });
      await database.usuario.create({
        data: {
          id: wrongRoleId,
          email: `wrong.${suffix}@example.test`,
          displayName: "Rol incorrecto",
          status: "ACTIVE",
          roles: { create: { rolId: adminRole.id } },
        },
      });
      await database.usuario.create({
        data: {
          id: linkedId,
          email: `linked.${suffix}@example.test`,
          displayName: "Usuario vinculado",
          status: "ACTIVE",
          roles: { create: { rolId: technicianRole.id } },
          tecnico: {
            create: {
              id: linkedTechnicianId,
              code: `LINK-${suffix}`,
              fullName: "Técnico vinculado",
              status: "INACTIVE",
              deletedAt: new Date("2026-07-30T12:00:00.000Z"),
            },
          },
        },
      });

      await expect(
        repository.findUserEligibility(eligibleId),
      ).resolves.toEqual({ kind: "ELIGIBLE" });
      await expect(
        repository.findUserEligibility(inactiveId),
      ).resolves.toEqual({ kind: "NOT_ELIGIBLE" });
      await expect(
        repository.findUserEligibility(deletedId),
      ).resolves.toEqual({ kind: "NOT_ELIGIBLE" });
      await expect(
        repository.findUserEligibility(wrongRoleId),
      ).resolves.toEqual({ kind: "NOT_ELIGIBLE" });
      await expect(
        repository.findUserEligibility(linkedId),
      ).resolves.toEqual({
        kind: "ALREADY_LINKED",
        technicianId: linkedTechnicianId,
      });
      await expect(
        repository.findUserEligibility(linkedId, linkedTechnicianId),
      ).resolves.toEqual({ kind: "ELIGIBLE" });
    } finally {
      await database.tecnico.deleteMany({
        where: { id: linkedTechnicianId },
      });
      await database.usuarioRol.deleteMany({
        where: { usuarioId: { in: userIds } },
      });
      await database.usuario.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });
});

describe("technician persisted mutations", () => {
  it("creates, updates, changes status, versions, and audits atomically", async () => {
    const repository = createTechniciansRepository(database);
    const service = createTechniciansService({
      repository,
      now: () => new Date("2026-07-30T18:00:00.000Z"),
      today: () => "2026-07-30",
    });
    const admin = await database.usuario.findUniqueOrThrow({
      where: { email: "admin.demo@geeksolution.example.test" },
    });
    const suffix = randomUUID().slice(0, 8);
    const actor = {
      userId: admin.id,
      requestId: randomUUID(),
      ipAddress: "127.0.0.1",
      userAgent: "Technician Persistence Test",
    };
    const createdIds: string[] = [];

    try {
      const first = await service.create(
        {
          fullName: `Mutación ${suffix} A`,
          workEmail: `MUTATION.${suffix}@EXAMPLE.TEST`,
          hiredOn: "2026-07-01",
        },
        actor,
      );
      createdIds.push(first.id);
      const second = await service.create(
        { fullName: `Mutación ${suffix} B` },
        actor,
      );
      createdIds.push(second.id);

      expect(first.status).toBe("AVAILABLE");
      expect(first.version).toBe(1);
      expect(first.workEmail).toBe(
        `mutation.${suffix}@example.test`,
      );
      expect(first.code).toMatch(/^TEC-\d{3,}$/);
      expect(second.code).toMatch(/^TEC-\d{3,}$/);
      expect(second.code).not.toBe(first.code);

      const updated = await service.update(
        first.id,
        { version: first.version, fullName: `Actualizado ${suffix}` },
        actor,
      );
      expect(updated).toMatchObject({
        fullName: `Actualizado ${suffix}`,
        version: 2,
      });

      await expect(
        service.update(
          first.id,
          { version: first.version, specialty: "Versión obsoleta" },
          actor,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "VERSION_CONFLICT",
      });

      const onRoute = await service.changeStatus(
        first.id,
        { version: updated.version, status: "ON_ROUTE" },
        actor,
      );
      expect(onRoute).toMatchObject({ status: "ON_ROUTE", version: 3 });

      await expect(
        service.create(
          {
            fullName: `Correo duplicado ${suffix}`,
            workEmail: `mutation.${suffix}@example.test`,
          },
          actor,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "WORK_EMAIL_ALREADY_EXISTS",
      });

      const audits = await database.auditoria.findMany({
        where: { entity: "tecnico", entityId: first.id },
        orderBy: { occurredAt: "asc" },
      });
      const auditActions = audits.map(({ action }) => action);
      expect(auditActions).toHaveLength(3);
      expect(auditActions).toEqual(
        expect.arrayContaining([
          "TECHNICIAN_CREATED",
          "TECHNICIAN_UPDATED",
          "TECHNICIAN_STATUS_CHANGED",
        ]),
      );
      expect(JSON.stringify(audits)).not.toContain("password");
      expect(JSON.stringify(audits)).not.toContain("session");
    } finally {
      await database.auditoria.deleteMany({
        where: { entity: "tecnico", entityId: { in: createdIds } },
      });
      await database.tecnico.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
  });

  it("links only an eligible active technician user", async () => {
    const repository = createTechniciansRepository(database);
    const service = createTechniciansService({
      repository,
      now: () => new Date("2026-07-30T18:00:00.000Z"),
      today: () => "2026-07-30",
    });
    const admin = await database.usuario.findUniqueOrThrow({
      where: { email: "admin.demo@geeksolution.example.test" },
    });
    const technicianRole = await database.rol.findUniqueOrThrow({
      where: { code: "TECHNICIAN" },
    });
    const adminRole = await database.rol.findUniqueOrThrow({
      where: { code: "ADMIN" },
    });
    const suffix = randomUUID().slice(0, 8);
    const eligibleId = randomUUID();
    const wrongRoleId = randomUUID();
    const userIds = [eligibleId, wrongRoleId];
    const createdIds: string[] = [];
    const actor = {
      userId: admin.id,
      requestId: randomUUID(),
      ipAddress: null,
      userAgent: null,
    };

    try {
      await database.usuario.create({
        data: {
          id: eligibleId,
          email: `mutation.eligible.${suffix}@example.test`,
          displayName: "Elegible para técnico",
          status: "ACTIVE",
          roles: { create: { rolId: technicianRole.id } },
        },
      });
      await database.usuario.create({
        data: {
          id: wrongRoleId,
          email: `mutation.wrong.${suffix}@example.test`,
          displayName: "Sin rol técnico",
          status: "ACTIVE",
          roles: { create: { rolId: adminRole.id } },
        },
      });

      const linked = await service.create(
        {
          fullName: `Vinculado ${suffix}`,
          userId: eligibleId,
        },
        actor,
      );
      createdIds.push(linked.id);
      expect(linked.user).toMatchObject({ id: eligibleId });

      await expect(
        service.create(
          { fullName: `No elegible ${suffix}`, userId: wrongRoleId },
          actor,
        ),
      ).rejects.toMatchObject({
        code: "USER_NOT_ELIGIBLE_AS_TECHNICIAN",
      });
    } finally {
      await database.auditoria.deleteMany({
        where: { entity: "tecnico", entityId: { in: createdIds } },
      });
      await database.tecnico.deleteMany({
        where: { id: { in: createdIds } },
      });
      await database.usuarioRol.deleteMany({
        where: { usuarioId: { in: userIds } },
      });
      await database.usuario.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  it("blocks active work and preserves deactivate/reactivate history", async () => {
    const repository = createTechniciansRepository(database);
    const service = createTechniciansService({
      repository,
      now: () => new Date("2026-07-30T18:00:00.000Z"),
      today: () => "2026-07-30",
    });
    const admin = await database.usuario.findUniqueOrThrow({
      where: { email: "admin.demo@geeksolution.example.test" },
    });
    const order = await database.ordenTrabajo.findUniqueOrThrow({
      where: { orderNumber: "GS-2026-0002" },
    });
    const activityId = "30000000-0000-4000-8000-000000000001";
    const actor = {
      userId: admin.id,
      requestId: randomUUID(),
      ipAddress: "127.0.0.1",
      userAgent: "Technician Lifecycle Test",
    };
    let technicianId: string | undefined;

    try {
      const created = await service.create(
        {
          fullName: `Ciclo ${randomUUID().slice(0, 8)}`,
          hiredOn: "2026-07-01",
        },
        actor,
      );
      technicianId = created.id;
      await database.ordenTecnico.create({
        data: {
          ordenId: order.id,
          tecnicoId: created.id,
          role: "SUPPORT",
        },
      });
      await expect(
        service.deactivate(
          created.id,
          { version: 1, reason: "Fin de relación laboral" },
          actor,
        ),
      ).rejects.toMatchObject({ code: "TECHNICIAN_HAS_ACTIVE_WORK" });

      await database.ordenTecnico.deleteMany({
        where: { ordenId: order.id, tecnicoId: created.id },
      });
      await database.actividad.update({
        where: { id: activityId },
        data: { status: "IN_PROGRESS" },
      });
      await database.actividadTecnico.create({
        data: {
          actividadId: activityId,
          tecnicoId: created.id,
          role: "PARTICIPANT",
        },
      });
      await expect(
        service.deactivate(
          created.id,
          { version: 1, reason: "Fin de relación laboral" },
          actor,
        ),
      ).rejects.toMatchObject({ code: "TECHNICIAN_HAS_ACTIVE_WORK" });

      await database.actividadTecnico.deleteMany({
        where: { actividadId: activityId, tecnicoId: created.id },
      });
      await database.actividad.update({
        where: { id: activityId },
        data: { status: "COMPLETED" },
      });
      const inactive = await service.deactivate(
        created.id,
        { version: 1, reason: "Fin de relación laboral" },
        actor,
      );
      expect(inactive).toMatchObject({
        status: "INACTIVE",
        leftOn: "2026-07-30",
        version: 2,
      });

      const reactivated = await service.reactivate(
        created.id,
        { version: 2, reason: "Reingreso laboral aprobado" },
        actor,
      );
      expect(reactivated).toMatchObject({
        status: "AVAILABLE",
        leftOn: null,
        version: 3,
      });

      const audits = await database.auditoria.findMany({
        where: { entity: "tecnico", entityId: created.id },
      });
      expect(audits.map(({ action }) => action)).toEqual(
        expect.arrayContaining([
          "TECHNICIAN_DEACTIVATED",
          "TECHNICIAN_REACTIVATED",
        ]),
      );
      expect(
        audits.find(({ action }) => action === "TECHNICIAN_DEACTIVATED")
          ?.reason,
      ).toBe("Fin de relación laboral");
    } finally {
      if (technicianId) {
        await database.ordenTecnico.deleteMany({
          where: { tecnicoId: technicianId },
        });
        await database.actividadTecnico.deleteMany({
          where: { tecnicoId: technicianId },
        });
        await database.auditoria.deleteMany({
          where: { entity: "tecnico", entityId: technicianId },
        });
        await database.tecnico.deleteMany({
          where: { id: technicianId },
        });
      }
      await database.actividad.update({
        where: { id: activityId },
        data: { status: "COMPLETED" },
      });
    }
  });
});
