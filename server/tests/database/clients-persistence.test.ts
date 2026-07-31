import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createClientsRepository } from "../../src/clients/clients.repository.js";
import { createClientsService } from "../../src/clients/clients.service.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("client persistence constraints", () => {
  it("allocates a client code number after the seeded range", async () => {
    const rows = await database.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('cliente_code_seq') AS value
    `;

    expect(Number(rows[0]?.value)).toBeGreaterThanOrEqual(3);
  });

  it("starts branch and contact versions at one", async () => {
    const clientId = randomUUID();
    const branchId = randomUUID();
    const contactId = randomUUID();

    try {
      await database.cliente.create({
        data: {
          id: clientId,
          code: `VERS-${randomUUID().slice(0, 8)}`,
          tradeName: "Cliente con versiones",
        },
      });
      const branch = await database.sucursalCliente.create({
        data: {
          id: branchId,
          clienteId: clientId,
          code: "MAIN",
          name: "Principal",
          address: "Dirección de prueba",
        },
      });
      const contact = await database.contactoCliente.create({
        data: {
          id: contactId,
          clienteId: clientId,
          fullName: "Contacto de prueba",
        },
      });

      expect(branch).toMatchObject({ version: 1 });
      expect(contact).toMatchObject({ version: 1 });
    } finally {
      await database.contactoCliente.deleteMany({ where: { id: contactId } });
      await database.sucursalCliente.deleteMany({ where: { id: branchId } });
      await database.cliente.deleteMany({ where: { id: clientId } });
    }
  });

  it("rejects a normalized tax ID already used by inactive history", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const firstId = randomUUID();
    const secondId = randomUUID();

    try {
      await database.cliente.create({
        data: {
          id: firstId,
          code: `TAX-${suffix}-A`,
          tradeName: "Cliente fiscal histórico",
          taxId: `${suffix.slice(0, 4)}-${suffix.slice(4, 8)} ${suffix.slice(8)}`,
          isActive: false,
          deletedAt: new Date("2026-07-31T12:00:00.000Z"),
        },
      });

      await expect(
        database.cliente.create({
          data: {
            id: secondId,
            code: `TAX-${suffix}-B`,
            tradeName: "Cliente fiscal duplicado",
            taxId: suffix.toUpperCase(),
          },
        }),
      ).rejects.toThrow();
    } finally {
      await database.cliente.deleteMany({
        where: { id: { in: [firstId, secondId] } },
      });
    }
  });

  it("rejects two active general primary contacts for one client", async () => {
    const clientId = randomUUID();
    const contactIds = [randomUUID(), randomUUID()] as const;

    try {
      await database.cliente.create({
        data: {
          id: clientId,
          code: `GPRI-${randomUUID().slice(0, 8)}`,
          tradeName: "Cliente principal general",
        },
      });
      await database.contactoCliente.create({
        data: {
          id: contactIds[0],
          clienteId: clientId,
          fullName: "Principal general A",
          isPrimary: true,
        },
      });

      await expect(
        database.contactoCliente.create({
          data: {
            id: contactIds[1],
            clienteId: clientId,
            fullName: "Principal general B",
            isPrimary: true,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await database.contactoCliente.deleteMany({
        where: { id: { in: [...contactIds] } },
      });
      await database.cliente.deleteMany({ where: { id: clientId } });
    }
  });

  it("allows a new branch primary when the former primary is inactive", async () => {
    const clientId = randomUUID();
    const branchId = randomUUID();
    const contactIds = [randomUUID(), randomUUID()] as const;

    try {
      await database.cliente.create({
        data: {
          id: clientId,
          code: `BPRI-${randomUUID().slice(0, 8)}`,
          tradeName: "Cliente principal de sucursal",
        },
      });
      await database.sucursalCliente.create({
        data: {
          id: branchId,
          clienteId: clientId,
          code: "MAIN",
          name: "Principal",
          address: "Dirección de prueba",
        },
      });
      await database.contactoCliente.create({
        data: {
          id: contactIds[0],
          clienteId: clientId,
          sucursalId: branchId,
          fullName: "Principal inactivo",
          isPrimary: true,
          isActive: false,
        },
      });

      const activePrimary = await database.contactoCliente.create({
        data: {
          id: contactIds[1],
          clienteId: clientId,
          sucursalId: branchId,
          fullName: "Principal activo",
          isPrimary: true,
        },
      });

      expect(activePrimary.isPrimary).toBe(true);
    } finally {
      await database.contactoCliente.deleteMany({
        where: { id: { in: [...contactIds] } },
      });
      await database.sucursalCliente.deleteMany({ where: { id: branchId } });
      await database.cliente.deleteMany({ where: { id: clientId } });
    }
  });
});

describe("client repository reads", () => {
  it("searches clients and hides inactive records by default", async () => {
    const suffix = randomUUID().slice(0, 8);
    const clientIds = [randomUUID(), randomUUID()] as const;
    const repository = createClientsRepository(database);

    try {
      await database.cliente.createMany({
        data: [
          {
            id: clientIds[0],
            code: `READ-${suffix}-A`,
            tradeName: `Alpha ${suffix}`,
            legalName: `Legal ${suffix}`,
          },
          {
            id: clientIds[1],
            code: `READ-${suffix}-B`,
            tradeName: `Beta ${suffix}`,
            isActive: false,
            deletedAt: new Date("2026-07-31T12:00:00.000Z"),
          },
        ],
      });

      const active = await repository.listClients({
        search: suffix.toUpperCase(),
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const all = await repository.listClients({
        search: suffix,
        page: 1,
        pageSize: 20,
        includeInactive: true,
      });

      expect(active.items.map(({ id }) => id)).toEqual([clientIds[0]]);
      expect(all.totalItems).toBe(2);
      expect(all.items.map(({ id }) => id)).toEqual([
        clientIds[0],
        clientIds[1],
      ]);
    } finally {
      await database.cliente.deleteMany({
        where: { id: { in: [...clientIds] } },
      });
    }
  });

  it("filters owned branches and contacts", async () => {
    const suffix = randomUUID().slice(0, 8);
    const clientId = randomUUID();
    const branchIds = [randomUUID(), randomUUID()] as const;
    const contactIds = [randomUUID(), randomUUID()] as const;
    const repository = createClientsRepository(database);

    try {
      await database.cliente.create({
        data: {
          id: clientId,
          code: `OWN-${suffix}`,
          tradeName: `Owned ${suffix}`,
        },
      });
      await database.sucursalCliente.createMany({
        data: [
          {
            id: branchIds[0],
            clienteId: clientId,
            code: "MAIN",
            name: "Principal",
            address: "Centro",
            city: "Tegucigalpa",
          },
          {
            id: branchIds[1],
            clienteId: clientId,
            code: "SUC-001",
            name: "Norte",
            address: "Norte",
            city: "San Pedro Sula",
          },
        ],
      });
      await database.contactoCliente.createMany({
        data: [
          {
            id: contactIds[0],
            clienteId: clientId,
            fullName: "Contacto general",
          },
          {
            id: contactIds[1],
            clienteId: clientId,
            sucursalId: branchIds[1],
            fullName: "Contacto norte",
          },
        ],
      });

      const branches = await repository.listBranches(clientId, {
        city: "san pedro",
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const general = await repository.listContacts(clientId, {
        scope: "CLIENT",
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });
      const branch = await repository.listContacts(clientId, {
        branchId: branchIds[1],
        page: 1,
        pageSize: 20,
        includeInactive: false,
      });

      expect(branches?.items.map(({ id }) => id)).toEqual([branchIds[1]]);
      expect(general?.items.map(({ id }) => id)).toEqual([contactIds[0]]);
      expect(branch?.items.map(({ id }) => id)).toEqual([contactIds[1]]);
    } finally {
      await database.contactoCliente.deleteMany({
        where: { id: { in: [...contactIds] } },
      });
      await database.sucursalCliente.deleteMany({
        where: { id: { in: [...branchIds] } },
      });
      await database.cliente.deleteMany({ where: { id: clientId } });
    }
  });
});

describe("client persisted mutations", () => {
  it("creates the initial aggregate and edits with optimistic concurrency", async () => {
    const service = createClientsService(
      createClientsRepository(database),
      () => new Date("2026-07-31T18:00:00.000Z"),
    );
    const admin = await database.usuario.findUniqueOrThrow({
      where: { email: "admin.demo@geeksolution.example.test" },
    });
    const suffix = randomUUID().slice(0, 8);
    const actor = {
      userId: admin.id,
      requestId: randomUUID(),
      ipAddress: "127.0.0.1",
      userAgent: "Client persistence test",
    };
    let clientId: string | undefined;

    try {
      const created = await service.createClient(
        {
          tradeName: `Mutación ${suffix}`,
          taxId: `TAX-${suffix}`,
          email: `CLIENT.${suffix}@EXAMPLE.TEST`,
          mainBranch: {
            name: "Principal",
            address: "Centro",
            country: "HN",
          },
          primaryContact: {
            scope: "MAIN_BRANCH",
            fullName: "Contacto inicial",
          },
        },
        actor,
      );
      clientId = created.id;
      expect(created).toMatchObject({
        version: 1,
        email: `client.${suffix}@example.test`,
      });
      expect(created.code).toMatch(/^CLI-\d{3,}$/);
      expect(created.branches).toHaveLength(1);
      expect(created.branches[0]).toMatchObject({ code: "MAIN", version: 1 });
      expect(created.contacts[0]).toMatchObject({
        scope: "BRANCH",
        isPrimary: true,
      });

      const updated = await service.updateClient(
        created.id,
        { version: 1, tradeName: `Actualizado ${suffix}` },
        actor,
      );
      expect(updated).toMatchObject({
        tradeName: `Actualizado ${suffix}`,
        version: 2,
      });
      await expect(
        service.updateClient(
          created.id,
          { version: 1, phone: "+504 2200-0000" },
          actor,
        ),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const audits = await database.auditoria.findMany({
        where: { entity: "cliente", entityId: created.id },
        orderBy: { occurredAt: "asc" },
      });
      expect(audits.map(({ action }) => action)).toEqual([
        "CLIENT_CREATED",
        "CLIENT_UPDATED",
      ]);
    } finally {
      if (clientId) {
        await database.auditoria.deleteMany({
          where: { entity: "cliente", entityId: clientId },
        });
        await database.contactoCliente.deleteMany({ where: { clienteId: clientId } });
        await database.sucursalCliente.deleteMany({ where: { clienteId: clientId } });
        await database.cliente.deleteMany({ where: { id: clientId } });
      }
    }
  });
});
