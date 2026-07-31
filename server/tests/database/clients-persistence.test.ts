import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
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
