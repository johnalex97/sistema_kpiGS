import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "./http";
import { createActivityLookupApi } from "./activity-lookups";

function lookupResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const pagination = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };

const orderPage = {
  items: [{
    id: "11111111-1111-4111-8111-111111111111",
    orderNumber: "OT-2026-0042",
    client: { id: "c1", code: "CLI-001", tradeName: "Cliente Demo" },
    branch: { id: "b1", code: "TGU-01", name: "Centro" },
    serviceType: { id: "s1", code: "SUP", name: "Soporte" },
    priority: "HIGH",
    status: "ASSIGNED",
    reportedProblem: "Sin conectividad",
    scheduledFor: null,
    primaryTechnician: null,
    supportCount: 0,
    overdue: false,
    startedAt: null,
    endedAt: null,
    estimatedMinutes: 60,
    totalMinutes: null,
    createdAt: "2026-08-26T13:00:00.000Z",
    updatedAt: "2026-08-26T13:00:00.000Z",
    version: 1,
  }],
  pagination,
};

const clientPage = {
  items: [{
    id: "22222222-2222-4222-8222-222222222222",
    code: "CLI-001",
    tradeName: "Cliente Demo",
    legalName: "Cliente Demo S.A.",
    taxId: null,
    phone: null,
    email: null,
    isActive: true,
    createdAt: "2026-08-26T13:00:00.000Z",
    updatedAt: "2026-08-26T13:00:00.000Z",
    version: 1,
    activeBranchCount: 1,
    activeContactCount: 1,
  }],
  pagination,
};

const branchPage = {
  items: [{
    id: "33333333-3333-4333-8333-333333333333",
    clientId: clientPage.items[0].id,
    code: "TGU-01",
    name: "Centro",
    address: "Boulevard Centroamérica",
    city: "Tegucigalpa",
    region: "Francisco Morazán",
    country: "HN",
    lat: null,
    long: null,
    locationReference: null,
    isActive: true,
    isEffectivelyActive: true,
    createdAt: "2026-08-26T13:00:00.000Z",
    updatedAt: "2026-08-26T13:00:00.000Z",
    version: 1,
  }],
  pagination,
};

const technicianPage = {
  items: [{
    id: "44444444-4444-4444-8444-444444444444",
    code: "TEC-001",
    fullName: "Ana López",
    specialty: "Redes",
    workPhone: null,
    workEmail: null,
    status: "AVAILABLE",
    hiredOn: "2025-01-01",
    leftOn: null,
    user: null,
    createdAt: "2026-08-26T13:00:00.000Z",
    updatedAt: "2026-08-26T13:00:00.000Z",
    version: 1,
  }],
  pagination,
};

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("createActivityLookupApi", () => {
  it("busca órdenes paginadas en todos los estados utilizables y excluye canceladas", async () => {
    vi.mocked(fetch).mockResolvedValue(lookupResponse(orderPage));

    const result = await createActivityLookupApi().orders("OT-2026", 1);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));

    expect(url.pathname).toBe("/api/v1/orders");
    expect(url.searchParams.get("search")).toBe("OT-2026");
    expect(url.searchParams.getAll("status")).toEqual([
      "PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED", "COMPLETED",
    ]);
    expect(url.searchParams.getAll("status")).not.toContain("CANCELLED");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(result).toEqual({
      items: [{
        id: orderPage.items[0].id,
        orderNumber: "OT-2026-0042",
        clientName: "Cliente Demo",
        branchName: "Centro",
        status: "ASSIGNED",
      }],
      pagination,
    });
  });

  it("mapea clientes activos sin exponer campos administrativos", async () => {
    vi.mocked(fetch).mockResolvedValue(lookupResponse(clientPage));

    const result = await createActivityLookupApi().clients("Demo", 2);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));

    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(url.searchParams.get("page")).toBe("2");
    expect(result.items).toEqual([{ id: clientPage.items[0].id, code: "CLI-001", tradeName: "Cliente Demo" }]);
  });

  it("codifica el cliente y carga únicamente sucursales activas", async () => {
    vi.mocked(fetch).mockResolvedValue(lookupResponse(branchPage));

    const result = await createActivityLookupApi().branches("cliente/con espacio", "Centro & Norte", 1);
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const url = new URL(String(request));

    expect(url.pathname).toBe("/api/v1/clients/cliente%2Fcon%20espacio/branches");
    expect(url.searchParams.get("search")).toBe("Centro & Norte");
    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(result.items).toEqual([{
      id: branchPage.items[0].id,
      code: "TGU-01",
      name: "Centro",
      address: "Boulevard Centroamérica",
      isEffectivelyActive: true,
    }]);
  });

  it("mapea técnicos operativos y propaga la señal de aborto", async () => {
    vi.mocked(fetch).mockResolvedValue(lookupResponse(technicianPage));
    const controller = new AbortController();

    const result = await createActivityLookupApi().technicians("Ana", 1, controller.signal);
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const url = new URL(String(request));

    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(init).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(result.items).toEqual([{
      id: technicianPage.items[0].id,
      code: "TEC-001",
      fullName: "Ana López",
      status: "AVAILABLE",
    }]);
  });

  it("propaga ApiClientError sin convertir el mensaje del servidor", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "FORBIDDEN", message: "No puede consultar técnicos" }],
    }), { status: 403, headers: { "Content-Type": "application/json" } }));

    const request = createActivityLookupApi().technicians("Ana", 1);

    await expect(request).rejects.toMatchObject<ApiClientError>({
      status: 403,
      code: "FORBIDDEN",
      message: "No puede consultar técnicos",
    });
  });
});
