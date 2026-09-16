import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrderLookupApi } from "./order-lookups";

function jsonResponse<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const pagination = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("createOrderLookupApi", () => {
  it("loads the order catalog with an abort signal", async () => {
    const catalog = {
      serviceTypes: [{ id: "service-1", code: "SUPPORT", name: "Soporte" }],
      materials: [{ id: "material-1", code: "MAT-001", name: "Cable", unit: "metro", referenceCost: "12.5" }],
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(catalog));
    const controller = new AbortController();

    await expect(createOrderLookupApi().catalog(controller.signal)).resolves.toEqual(catalog);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/orders/catalog"),
      expect.objectContaining({ signal: controller.signal, credentials: "include" }),
    );
  });

  it("normalizes client search and maps only selection fields", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      items: [{
        id: "client-1",
        code: "CLI-001",
        tradeName: "Acme",
        legalName: "Acme S.A.",
        taxId: "0801",
        isActive: true,
      }],
      pagination,
    }));

    const result = await createOrderLookupApi().clients("  Acme  ", 1);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));

    expect(url.pathname).toBe("/api/v1/clients");
    expect(url.searchParams.get("search")).toBe("Acme");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(result).toEqual({
      items: [{ id: "client-1", code: "CLI-001", tradeName: "Acme" }],
      pagination,
    });
  });

  it("encodes a client id and returns its active branch options", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      items: [{
        id: "branch-1",
        code: "MAIN",
        name: "Principal",
        address: "Centro",
        isEffectivelyActive: true,
        city: "Tegucigalpa",
      }],
      pagination,
    }));
    const controller = new AbortController();

    const result = await createOrderLookupApi().branches(
      "client/id con espacio",
      controller.signal,
    );
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const url = new URL(String(request));

    expect(url.pathname).toBe("/api/v1/clients/client%2Fid%20con%20espacio/branches");
    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("100");
    expect(init).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(result).toEqual([{
      id: "branch-1",
      code: "MAIN",
      name: "Principal",
      address: "Centro",
      isEffectivelyActive: true,
    }]);
  });

  it("normalizes technician search and maps operational status", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      items: [{
        id: "tech-1",
        code: "TEC-001",
        fullName: "Ana López",
        status: "AVAILABLE",
        specialty: "Redes",
        workEmail: "ana@example.test",
      }],
      pagination,
    }));
    const controller = new AbortController();

    const result = await createOrderLookupApi().technicians(
      "  Ana  ",
      2,
      controller.signal,
    );
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const url = new URL(String(request));

    expect(url.pathname).toBe("/api/v1/technicians");
    expect(url.searchParams.get("search")).toBe("Ana");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(url.searchParams.get("includeInactive")).toBe("false");
    expect(init).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(result).toEqual({
      items: [{ id: "tech-1", code: "TEC-001", fullName: "Ana López", status: "AVAILABLE" }],
      pagination,
    });
  });
});
