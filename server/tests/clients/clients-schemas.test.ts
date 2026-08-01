import { describe, expect, it } from "vitest";
import {
  branchListQuerySchema,
  branchParamsSchema,
  clientIdSchema,
  clientListQuerySchema,
  contactListQuerySchema,
  contactParamsSchema,
  createBranchSchema,
  createClientSchema,
  createContactSchema,
  lifecycleSchema,
  updateBranchSchema,
  updateClientSchema,
  updateContactSchema,
} from "../../src/clients/clients.schemas.js";

describe("client request schemas", () => {
  it("parses list defaults without treating false text as true", () => {
    expect(clientListQuerySchema.parse({ includeInactive: "false" })).toEqual({
      page: 1,
      pageSize: 20,
      includeInactive: false,
    });
    expect(
      clientListQuerySchema.parse({ isActive: "false" }),
    ).toMatchObject({ isActive: false, includeInactive: true });
  });

  it("normalizes the atomic client payload", () => {
    expect(
      createClientSchema.parse({
        tradeName: "  Aurora  ",
        legalName: " ",
        email: " ADMIN@AURORA.HN ",
        mainBranch: {
          name: " Principal ",
          address: " Centro ",
          country: "hn",
          lat: "14.0723",
          long: "-87.1921",
        },
        primaryContact: {
          scope: "MAIN_BRANCH",
          fullName: " Ana López ",
          email: " ANA@AURORA.HN ",
        },
      }),
    ).toMatchObject({
      tradeName: "Aurora",
      legalName: null,
      email: "admin@aurora.hn",
      mainBranch: {
        name: "Principal",
        address: "Centro",
        country: "HN",
        lat: "14.0723",
        long: "-87.1921",
      },
      primaryContact: {
        scope: "MAIN_BRANCH",
        fullName: "Ana López",
        email: "ana@aurora.hn",
      },
    });
  });

  it("requires paired coordinates and enforces geographic ranges", () => {
    expect(() =>
      createBranchSchema.parse({
        name: "Norte",
        address: "Barrio Norte",
        lat: "14.1",
      }),
    ).toThrow();
    expect(() =>
      createBranchSchema.parse({
        name: "Norte",
        address: "Barrio Norte",
        lat: "91",
        long: "-87",
      }),
    ).toThrow();
  });

  it("requires branch ownership data only for branch contacts", () => {
    expect(
      createContactSchema.parse({
        scope: "CLIENT",
        fullName: "Contacto general",
      }),
    ).toMatchObject({ scope: "CLIENT", isPrimary: false });
    expect(() =>
      createContactSchema.parse({
        scope: "CLIENT",
        branchId: "10000000-0000-4000-8000-000000000001",
        fullName: "Inválido",
      }),
    ).toThrow();
    expect(() =>
      createContactSchema.parse({
        scope: "BRANCH",
        fullName: "Sin sucursal",
      }),
    ).toThrow();
  });

  it("requires an editable field in every update", () => {
    expect(() => updateClientSchema.parse({ version: 1 })).toThrow();
    expect(() => updateBranchSchema.parse({ version: 1 })).toThrow();
    expect(() => updateContactSchema.parse({ version: 1 })).toThrow();
    expect(
      updateClientSchema.parse({ version: 1, phone: " " }),
    ).toEqual({ version: 1, phone: null });
  });

  it("validates identifiers, lifecycle reasons, and strict objects", () => {
    const clientId = "10000000-0000-4000-8000-000000000001";
    const branchId = "10000000-0000-4000-8000-000000000002";
    const contactId = "10000000-0000-4000-8000-000000000003";
    expect(clientIdSchema.parse({ clientId })).toEqual({ clientId });
    expect(branchParamsSchema.parse({ clientId, branchId })).toEqual({
      clientId,
      branchId,
    });
    expect(contactParamsSchema.parse({ clientId, contactId })).toEqual({
      clientId,
      contactId,
    });
    expect(() => lifecycleSchema.parse({ version: 0, reason: "muy corta" })).toThrow();
    expect(() => clientIdSchema.parse({ clientId, extra: true })).toThrow();
  });

  it("normalizes branch and contact list filters", () => {
    expect(
      branchListQuerySchema.parse({ city: " Tegucigalpa ", pageSize: "50" }),
    ).toMatchObject({
      city: "Tegucigalpa",
      page: 1,
      pageSize: 50,
      includeInactive: false,
    });
    expect(
      contactListQuerySchema.parse({ scope: "BRANCH", isActive: "true" }),
    ).toMatchObject({
      scope: "BRANCH",
      isActive: true,
      page: 1,
      pageSize: 20,
    });
  });
});
