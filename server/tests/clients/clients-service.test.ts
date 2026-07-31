import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import {
  mapPublicBranch,
  mapPublicContact,
} from "../../src/clients/clients.mapper.js";
import type { ClientsRepository } from "../../src/clients/clients.repository.js";
import { createClientsService } from "../../src/clients/clients.service.js";

const date = new Date("2026-07-31T12:00:00.000Z");
const actor = {
  userId: "10000000-0000-4000-8000-000000000010",
  requestId: "10000000-0000-4000-8000-000000000011",
  ipAddress: "127.0.0.1",
  userAgent: "Client service test",
};

const detailRecord = {
  id: "10000000-0000-4000-8000-000000000020",
  code: "CLI-020",
  tradeName: "Cliente prueba",
  legalName: null,
  taxId: null,
  phone: null,
  email: null,
  notes: null,
  isActive: true,
  createdAt: date,
  updatedAt: date,
  deletedAt: null,
  version: 1,
  _count: { sucursales: 1, contactos: 0 },
  sucursales: [],
  contactos: [],
};

function repositoryFake(
  overrides: Partial<ClientsRepository> = {},
): ClientsRepository {
  return {
    listClients: async () => ({ items: [], totalItems: 0 }),
    findClientById: async () => null,
    listBranches: async () => ({
      clientActive: true,
      items: [],
      totalItems: 0,
    }),
    listContacts: async () => ({
      clientActive: true,
      items: [],
      totalItems: 0,
    }),
    createClient: async () => ({ kind: "CREATED", client: detailRecord }),
    updateClient: async () => ({ kind: "UPDATED", client: detailRecord }),
    deactivateClient: async () => ({ kind: "UPDATED", client: detailRecord }),
    reactivateClient: async () => ({ kind: "UPDATED", client: detailRecord }),
    ...overrides,
  };
}

describe("client public mapping", () => {
  it("serializes coordinates and combines branch state with its parent", () => {
    expect(
      mapPublicBranch(
        {
          id: "10000000-0000-4000-8000-000000000001",
          clienteId: "10000000-0000-4000-8000-000000000002",
          code: "MAIN",
          name: "Principal",
          address: "Centro",
          city: "Tegucigalpa",
          region: "Francisco Morazán",
          country: "HN",
          latitude: new Prisma.Decimal("14.072300"),
          longitude: new Prisma.Decimal("-87.192100"),
          locationReference: null,
          isActive: true,
          createdAt: date,
          updatedAt: date,
          deletedAt: null,
          version: 1,
        },
        false,
      ),
    ).toMatchObject({
      clientId: "10000000-0000-4000-8000-000000000002",
      lat: "14.072300",
      long: "-87.192100",
      isActive: true,
      isEffectivelyActive: false,
    });
  });

  it("derives contact scope and branch name", () => {
    expect(
      mapPublicContact(
        {
          id: "10000000-0000-4000-8000-000000000003",
          clienteId: "10000000-0000-4000-8000-000000000002",
          sucursalId: "10000000-0000-4000-8000-000000000001",
          fullName: "Ana López",
          position: null,
          phone: null,
          email: "ana@example.test",
          isPrimary: true,
          isActive: true,
          createdAt: date,
          updatedAt: date,
          deletedAt: null,
          version: 1,
          sucursal: { name: "Principal" },
        },
        true,
      ),
    ).toMatchObject({
      scope: "BRANCH",
      branchName: "Principal",
      isEffectivelyActive: true,
    });
  });
});

describe("client read service", () => {
  it("returns zero total pages for an empty client list", async () => {
    const service = createClientsService(repositoryFake());
    await expect(
      service.listClients({ page: 1, pageSize: 20, includeInactive: false }),
    ).resolves.toMatchObject({
      items: [],
      pagination: { totalItems: 0, totalPages: 0 },
    });
  });

  it("calculates pages from the repository total", async () => {
    const service = createClientsService(
      repositoryFake({
        listClients: async () => ({ items: [], totalItems: 21 }),
      }),
    );
    const result = await service.listClients({
      page: 1,
      pageSize: 20,
      includeInactive: false,
    });
    expect(result.pagination.totalPages).toBe(2);
  });

  it("returns the public not-found error for hidden or missing clients", async () => {
    const service = createClientsService(repositoryFake());
    await expect(
      service.getClient("10000000-0000-4000-8000-000000000099", false),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "CLIENT_NOT_FOUND",
    });
  });

  it("rejects branch and contact lists when the parent is unavailable", async () => {
    const service = createClientsService(
      repositoryFake({
        listBranches: async () => null,
        listContacts: async () => null,
      }),
    );
    const filters = { page: 1, pageSize: 20, includeInactive: false };
    await expect(
      service.listBranches("10000000-0000-4000-8000-000000000099", filters),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" });
    await expect(
      service.listContacts("10000000-0000-4000-8000-000000000099", filters),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" });
  });
});

describe("client mutation service", () => {
  it("creates and maps an atomic client aggregate", async () => {
    const service = createClientsService(repositoryFake(), () => date);
    const result = await service.createClient(
      {
        tradeName: "Cliente prueba",
        mainBranch: {
          name: "Principal",
          address: "Centro",
          country: "HN",
        },
      },
      actor,
    );
    expect(result).toMatchObject({ code: "CLI-020", version: 1 });
  });

  it("maps duplicate tax and stale edit outcomes to conflicts", async () => {
    const duplicate = createClientsService(
      repositoryFake({
        createClient: async () => ({ kind: "TAX_ID_CONFLICT" }),
      }),
      () => date,
    );
    await expect(
      duplicate.createClient(
        {
          tradeName: "Duplicado",
          taxId: "0801-1999",
          mainBranch: { name: "Principal", address: "Centro", country: "HN" },
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "TAX_ID_ALREADY_EXISTS" });

    const stale = createClientsService(
      repositoryFake({
        updateClient: async () => ({ kind: "VERSION_CONFLICT" }),
      }),
      () => date,
    );
    await expect(
      stale.updateClient(
        detailRecord.id,
        { version: 1, tradeName: "Cambio" },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
  });

  it("maps active work and lifecycle state conflicts", async () => {
    const activeWork = createClientsService(
      repositoryFake({
        deactivateClient: async () => ({ kind: "ACTIVE_WORK" }),
      }),
      () => date,
    );
    await expect(
      activeWork.deactivateClient(
        detailRecord.id,
        { version: 1, reason: "Cliente con trabajo activo" },
        actor,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CLIENT_HAS_ACTIVE_WORK",
    });

    const alreadyActive = createClientsService(
      repositoryFake({
        reactivateClient: async () => ({ kind: "ALREADY_ACTIVE" }),
      }),
      () => date,
    );
    await expect(
      alreadyActive.reactivateClient(
        detailRecord.id,
        { version: 1, reason: "Cliente ya se encuentra activo" },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "RESOURCE_INACTIVE" });
  });
});
