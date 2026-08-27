import { describe, expect, it } from "vitest";
import { createTechnicianSchemas } from "../../src/technicians/technicians.schemas.js";

const schemas = createTechnicianSchemas(() => "2026-07-30");

describe("technician request schemas", () => {
  it("normalizes and validates eligible user list queries", () => {
    const technicianId = "10000000-0000-4000-8000-000000000001";

    expect(
      schemas.eligibleUserListQuerySchema.parse({ search: "  Ana  " }),
    ).toEqual({
      search: "Ana",
      page: 1,
      pageSize: 20,
    });
    expect(
      schemas.eligibleUserListQuerySchema.parse({
        technicianId,
        page: "2",
        pageSize: "10",
      }),
    ).toEqual({ technicianId, page: 2, pageSize: 10 });
    expect(
      schemas.eligibleUserListQuerySchema.safeParse({
        technicianId: "TEC-001",
      }).success,
    ).toBe(false);
    expect(
      schemas.eligibleUserListQuerySchema.safeParse({ pageSize: 51 })
        .success,
    ).toBe(false);
  });

  it("normalizes list defaults and boolean text", () => {
    expect(
      schemas.technicianListQuerySchema.parse({
        includeInactive: "true",
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      includeInactive: true,
    });

    expect(
      schemas.technicianListQuerySchema.parse({
        includeInactive: "false",
      }).includeInactive,
    ).toBe(false);
  });

  it("validates list search, pagination, and status boundaries", () => {
    expect(
      schemas.technicianListQuerySchema.parse({
        search: "  redes ",
        status: "ON_ROUTE",
        page: "2",
        pageSize: "100",
      }),
    ).toMatchObject({
      search: "redes",
      status: "ON_ROUTE",
      page: 2,
      pageSize: 100,
    });

    for (const query of [
      { search: "" },
      { search: "x".repeat(101) },
      { page: "0" },
      { pageSize: "101" },
      { status: "UNKNOWN" },
      { includeInactive: "yes" },
    ]) {
      expect(
        schemas.technicianListQuerySchema.safeParse(query).success,
      ).toBe(false);
    }
  });

  it("normalizes creation fields without accepting managed fields", () => {
    expect(
      schemas.createTechnicianSchema.parse({
        fullName: "  Ana López  ",
        specialty: "  ",
        workPhone: "",
        workEmail: "  ANA@EXAMPLE.TEST ",
        hiredOn: "2026-07-30",
        userId: null,
      }),
    ).toEqual({
      fullName: "Ana López",
      specialty: null,
      workPhone: null,
      workEmail: "ana@example.test",
      hiredOn: "2026-07-30",
      userId: null,
    });

    expect(
      schemas.createTechnicianSchema.safeParse({
        fullName: "Ana",
        code: "TEC-999",
      }).success,
    ).toBe(false);
    expect(
      schemas.createTechnicianSchema.safeParse({
        fullName: "Ana",
        status: "BUSY",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid creation lengths, identifiers, emails, and dates", () => {
    for (const input of [
      { fullName: "" },
      { fullName: "x".repeat(161) },
      { fullName: "Ana", specialty: "x".repeat(121) },
      { fullName: "Ana", workPhone: "x".repeat(31) },
      { fullName: "Ana", workEmail: "not-an-email" },
      { fullName: "Ana", workEmail: `${"x".repeat(246)}@test.com` },
      { fullName: "Ana", hiredOn: "2026-07-31" },
      { fullName: "Ana", hiredOn: "2026-02-30" },
      { fullName: "Ana", userId: "not-a-uuid" },
    ]) {
      expect(
        schemas.createTechnicianSchema.safeParse(input).success,
      ).toBe(false);
    }
  });

  it("requires a positive version and an editable update field", () => {
    expect(
      schemas.updateTechnicianSchema.safeParse({ version: 1 }).success,
    ).toBe(false);
    expect(
      schemas.updateTechnicianSchema.safeParse({ fullName: "Ana" }).success,
    ).toBe(false);
    expect(
      schemas.updateTechnicianSchema.safeParse({
        version: 0,
        fullName: "Ana",
      }).success,
    ).toBe(false);
    expect(
      schemas.updateTechnicianSchema.parse({
        version: 2,
        workEmail: "",
      }),
    ).toEqual({ version: 2, workEmail: null });
  });

  it("accepts only operational status changes", () => {
    expect(
      schemas.changeTechnicianStatusSchema.parse({
        version: 1,
        status: "AVAILABLE",
      }),
    ).toEqual({ version: 1, status: "AVAILABLE" });
    expect(
      schemas.changeTechnicianStatusSchema.safeParse({
        version: 1,
        status: "INACTIVE",
      }).success,
    ).toBe(false);
  });

  it("validates lifecycle reasons and optional left date", () => {
    expect(
      schemas.deactivateTechnicianSchema.parse({
        version: 3,
        reason: "Fin de relación laboral",
      }),
    ).toEqual({
      version: 3,
      reason: "Fin de relación laboral",
    });
    expect(
      schemas.deactivateTechnicianSchema.safeParse({
        version: 3,
        leftOn: "2026-02-30",
        reason: "Fin de relación laboral",
      }).success,
    ).toBe(false);
    expect(
      schemas.reactivateTechnicianSchema.safeParse({
        version: 4,
        reason: "corto",
      }).success,
    ).toBe(false);
    expect(
      schemas.reactivateTechnicianSchema.safeParse({
        version: 4,
        reason: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("accepts only UUID technician route parameters", () => {
    expect(
      schemas.technicianIdSchema.parse({
        id: "10000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      id: "10000000-0000-4000-8000-000000000001",
    });
    expect(
      schemas.technicianIdSchema.safeParse({ id: "TEC-001" }).success,
    ).toBe(false);
  });
});
