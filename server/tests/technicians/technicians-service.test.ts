import { describe, expect, it } from "vitest";
import {
  mapPublicTechnician,
  type TechnicianRecord,
  type TechniciansRepository,
} from "../../src/technicians/technicians.repository.js";
import { createTechniciansService } from "../../src/technicians/technicians.service.js";
import { ApiError } from "../../src/utils/api-error.js";

const technicianId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const actor = {
  userId: "30000000-0000-4000-8000-000000000001",
  requestId: "40000000-0000-4000-8000-000000000001",
  ipAddress: "127.0.0.1",
  userAgent: "Technicians Service Test",
};

const record: TechnicianRecord = {
  id: technicianId,
  code: "TEC-010",
  fullName: "Ana López",
  specialty: "Redes",
  workPhone: "+504 9999-9999",
  workEmail: "ana@example.test",
  status: "AVAILABLE",
  hiredOn: new Date("2026-07-01T00:00:00.000Z"),
  leftOn: null,
  createdAt: new Date("2026-07-01T14:00:00.000Z"),
  updatedAt: new Date("2026-07-02T14:00:00.000Z"),
  deletedAt: null,
  version: 1,
  usuario: {
    id: userId,
    email: "ana.user@example.test",
    displayName: "Ana Usuario",
  },
};

function repositoryWith(
  overrides: Partial<TechniciansRepository> = {},
): TechniciansRepository {
  return {
    list: async () => ({ items: [], totalItems: 0 }),
    findById: async () => null,
    findUserEligibility: async () => ({ kind: "ELIGIBLE" }),
    create: async () => ({ kind: "CREATED", technician: record }),
    update: async () => ({ kind: "UPDATED", technician: record }),
    changeStatus: async () => ({ kind: "UPDATED", technician: record }),
    deactivate: async () => ({ kind: "UPDATED", technician: record }),
    reactivate: async () => ({ kind: "UPDATED", technician: record }),
    ...overrides,
  };
}

function serviceWith(repository: TechniciansRepository) {
  return createTechniciansService({
    repository,
    now: () => new Date("2026-07-30T14:00:00.000Z"),
    today: () => "2026-07-30",
  });
}

describe("technician read service", () => {
  it("maps only the public technician contract with stable dates", () => {
    expect(mapPublicTechnician(record)).toEqual({
      id: technicianId,
      code: "TEC-010",
      fullName: "Ana López",
      specialty: "Redes",
      workPhone: "+504 9999-9999",
      workEmail: "ana@example.test",
      status: "AVAILABLE",
      hiredOn: "2026-07-01",
      leftOn: null,
      user: {
        id: userId,
        email: "ana.user@example.test",
        displayName: "Ana Usuario",
      },
      createdAt: "2026-07-01T14:00:00.000Z",
      updatedAt: "2026-07-02T14:00:00.000Z",
      version: 1,
    });
    expect(JSON.stringify(mapPublicTechnician(record))).not.toContain(
      "deletedAt",
    );
  });

  it("returns zero total pages when the list is empty", async () => {
    const result = await serviceWith(repositoryWith()).list({
      page: 1,
      pageSize: 20,
      includeInactive: false,
    });

    expect(result).toEqual({
      items: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });
  });

  it("calculates total pages from persisted count", async () => {
    const result = await serviceWith(
      repositoryWith({
        list: async () => ({ items: [record], totalItems: 21 }),
      }),
    ).list({
      page: 2,
      pageSize: 20,
      includeInactive: false,
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 21,
      totalPages: 2,
    });
    expect(result.items[0]?.id).toBe(technicianId);
  });

  it("returns a technician by identifier", async () => {
    const result = await serviceWith(
      repositoryWith({ findById: async () => record }),
    ).getById(technicianId);

    expect(result.code).toBe("TEC-010");
  });

  it("returns a stable not-found error for an unknown identifier", async () => {
    const operation = serviceWith(repositoryWith()).getById(technicianId);

    await expect(operation).rejects.toBeInstanceOf(ApiError);
    await expect(operation).rejects.toMatchObject({
      statusCode: 404,
      code: "TECHNICIAN_NOT_FOUND",
    });
  });
});

describe("technician mutation service", () => {
  it("creates an available technician from an eligible user", async () => {
    const result = await serviceWith(repositoryWith()).create(
      {
        fullName: "Ana López",
        workEmail: "ana@example.test",
        userId,
      },
      actor,
    );

    expect(result).toMatchObject({
      id: technicianId,
      status: "AVAILABLE",
      version: 1,
    });
  });

  it("rejects a user without an active technician role", async () => {
    const operation = serviceWith(
      repositoryWith({
        findUserEligibility: async () => ({ kind: "NOT_ELIGIBLE" }),
      }),
    ).create({ fullName: "Ana", userId }, actor);

    await expect(operation).rejects.toMatchObject({
      statusCode: 409,
      code: "USER_NOT_ELIGIBLE_AS_TECHNICIAN",
    });
  });

  it("rejects a user already linked to another technician", async () => {
    const operation = serviceWith(
      repositoryWith({
        findUserEligibility: async () => ({
          kind: "ALREADY_LINKED",
          technicianId,
        }),
      }),
    ).create({ fullName: "Ana", userId }, actor);

    await expect(operation).rejects.toMatchObject({
      statusCode: 409,
      code: "USER_ALREADY_LINKED",
    });
  });

  it.each([
    ["NOT_FOUND", "TECHNICIAN_NOT_FOUND", 404],
    ["VERSION_CONFLICT", "VERSION_CONFLICT", 409],
    ["INACTIVE", "INVALID_TECHNICIAN_STATUS", 409],
    ["WORK_EMAIL_CONFLICT", "WORK_EMAIL_ALREADY_EXISTS", 409],
    ["USER_NOT_ELIGIBLE", "USER_NOT_ELIGIBLE_AS_TECHNICIAN", 409],
    ["USER_ALREADY_LINKED", "USER_ALREADY_LINKED", 409],
  ] as const)(
    "maps update outcome %s to %s",
    async (kind, code, statusCode) => {
      const operation = serviceWith(
        repositoryWith({
          update: async () => ({ kind }),
        }),
      ).update(
        technicianId,
        { version: 1, fullName: "Actualizado" },
        actor,
      );

      await expect(operation).rejects.toMatchObject({ code, statusCode });
    },
  );

  it("returns the updated operational status and version", async () => {
    const result = await serviceWith(
      repositoryWith({
        changeStatus: async () => ({
          kind: "UPDATED",
          technician: {
            ...record,
            status: "ON_ROUTE",
            version: 2,
          },
        }),
      }),
    ).changeStatus(
      technicianId,
      { version: 1, status: "ON_ROUTE" },
      actor,
    );

    expect(result).toMatchObject({ status: "ON_ROUTE", version: 2 });
  });
});

describe("technician lifecycle service", () => {
  it("rejects deactivation while the technician has active work", async () => {
    const operation = serviceWith(
      repositoryWith({
        findById: async () => record,
        deactivate: async () => ({ kind: "ACTIVE_WORK" }),
      }),
    ).deactivate(
      technicianId,
      { version: 1, reason: "Trabajo todavía pendiente" },
      actor,
    );

    await expect(operation).rejects.toMatchObject({
      statusCode: 409,
      code: "TECHNICIAN_HAS_ACTIVE_WORK",
    });
  });

  it("rejects a departure date before the hiring date", async () => {
    const operation = serviceWith(
      repositoryWith({ findById: async () => record }),
    ).deactivate(
      technicianId,
      {
        version: 1,
        leftOn: "2026-06-30",
        reason: "Fin de relación laboral",
      },
      actor,
    );

    await expect(operation).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("returns the inactive lifecycle state", async () => {
    const result = await serviceWith(
      repositoryWith({
        findById: async () => record,
        deactivate: async () => ({
          kind: "UPDATED",
          technician: {
            ...record,
            status: "INACTIVE",
            leftOn: new Date("2026-07-30T00:00:00.000Z"),
            deletedAt: new Date("2026-07-30T14:00:00.000Z"),
            version: 2,
          },
        }),
      }),
    ).deactivate(
      technicianId,
      { version: 1, reason: "Fin de relación laboral" },
      actor,
    );

    expect(result).toMatchObject({
      status: "INACTIVE",
      leftOn: "2026-07-30",
      version: 2,
    });
  });

  it("returns the reactivated technician as available", async () => {
    const result = await serviceWith(
      repositoryWith({
        reactivate: async () => ({
          kind: "UPDATED",
          technician: {
            ...record,
            status: "AVAILABLE",
            version: 3,
          },
        }),
      }),
    ).reactivate(
      technicianId,
      { version: 2, reason: "Reingreso laboral aprobado" },
      actor,
    );

    expect(result).toMatchObject({ status: "AVAILABLE", version: 3 });
  });
});
