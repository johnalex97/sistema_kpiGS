import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecurrenceLookupApi } from "./recurrence-lookups";
import type { OrderStatus } from "../models/order-lookup";

function jsonResponse<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
  });
}

const pagination = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };

const orderPage = {
  items: [{
    id: "order-1",
    orderNumber: "OT-2026-0042",
    client: { id: "client-1", code: "CLI-001", tradeName: "Cliente Demo" },
    branch: { id: "branch-1", code: "TGU-01", name: "Centro" },
    serviceType: { id: "service-1", code: "SUP", name: "Soporte" },
    priority: "HIGH",
    status: "COMPLETED",
    reportedProblem: "Sin conectividad",
    scheduledFor: null,
    primaryTechnician: null,
    supportCount: 0,
    overdue: false,
    startedAt: "2026-08-31T13:00:00.000Z",
    endedAt: "2026-08-31T14:00:00.000Z",
    estimatedMinutes: 60,
    totalMinutes: 60,
    createdAt: "2026-08-31T13:00:00.000Z",
    updatedAt: "2026-08-31T14:00:00.000Z",
    version: 2,
  }],
  pagination,
};

const technicianPage = {
  items: [{
    id: "technician-1",
    code: "TEC-001",
    fullName: "Ana López",
    specialty: "Redes",
    workPhone: null,
    workEmail: null,
    status: "AVAILABLE",
    hiredOn: "2025-01-01",
    leftOn: null,
    user: null,
    createdAt: "2026-08-31T13:00:00.000Z",
    updatedAt: "2026-08-31T13:00:00.000Z",
    version: 1,
  }],
  pagination,
};

const clientPage = {
  items: [{
    id: "client-1",
    code: "CLI-001",
    tradeName: "Cliente Demo",
    legalName: "Cliente Demo S.A.",
    taxId: null,
    phone: null,
    email: null,
    isActive: true,
    createdAt: "2026-08-31T13:00:00.000Z",
    updatedAt: "2026-08-31T13:00:00.000Z",
    version: 1,
    activeBranchCount: 1,
    activeContactCount: 1,
  }],
  pagination,
};

const branchPage = {
  items: [{
    id: "branch-1",
    clientId: "client-1",
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
    createdAt: "2026-08-31T13:00:00.000Z",
    updatedAt: "2026-08-31T13:00:00.000Z",
    version: 1,
  }],
  pagination,
};

afterEach(() => vi.mocked(fetch).mockReset());

describe("createRecurrenceLookupApi", () => {
  it("busca la orden original completada y mapea sólo el resultado mínimo", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(orderPage));

    const result = await createRecurrenceLookupApi().orders("  OT-42  ", ["COMPLETED"], 1);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));

    expect(`${url.pathname}${url.search}`).toBe(
      "/api/v1/orders?search=OT-42&status=COMPLETED&page=1&pageSize=20",
    );
    expect(url.searchParams.get("search")).toBe("OT-42");
    expect(url.searchParams.getAll("status")).toEqual(["COMPLETED"]);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(result).toEqual({
      items: [{
        id: "order-1",
        orderNumber: "OT-2026-0042",
        clientName: "Cliente Demo",
        branchName: "Centro",
        status: "COMPLETED",
      }],
      pagination,
    });
  });

  it("permite buscar la orden correctiva en todos los estados salvo CANCELLED", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(orderPage));
    const correctiveStatuses = [
      "PENDING",
      "ASSIGNED",
      "ON_ROUTE",
      "IN_PROGRESS",
      "PAUSED",
      "COMPLETED",
    ] satisfies OrderStatus[];

    await createRecurrenceLookupApi().orders("", correctiveStatuses, 2);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));

    expect(url.searchParams.has("search")).toBe(false);
    expect(url.searchParams.getAll("status")).toEqual(correctiveStatuses);
    expect(url.searchParams.getAll("status")).not.toContain("CANCELLED");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("reutiliza el listado de técnicos activos y propaga la señal", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(technicianPage));
    const controller = new AbortController();

    const result = await createRecurrenceLookupApi().technicians("  Ana  ", 3, controller.signal);
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const url = new URL(String(request));

    expect(url.searchParams.get("search")).toBe("Ana");
    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(init).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(result).toEqual(technicianPage);
  });

  it("mapea clientes activos a id, código y nombre", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(clientPage));

    const result = await createRecurrenceLookupApi().clients(" Demo ", 1);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));

    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(result).toEqual({
      items: [{ id: "client-1", code: "CLI-001", name: "Cliente Demo" }],
      pagination,
    });
  });

  it("codifica el cliente y mapea sucursales activas a id, código y nombre", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(branchPage));
    const controller = new AbortController();

    const result = await createRecurrenceLookupApi().branches(
      "cliente/con espacio",
      " Centro & Norte ",
      2,
      controller.signal,
    );
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const url = new URL(String(request));

    expect(url.pathname).toBe("/api/v1/clients/cliente%2Fcon%20espacio/branches");
    expect(url.searchParams.get("search")).toBe("Centro & Norte");
    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(url.searchParams.get("page")).toBe("2");
    expect(init).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(result).toEqual({
      items: [{ id: "branch-1", code: "TGU-01", name: "Centro" }],
      pagination,
    });
  });
});
