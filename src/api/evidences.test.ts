import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvidenceApi } from "./evidences";
import type { Evidence, EvidenceAccessLevel, EvidenceUploadInput } from "../models/evidence";

const validAccessLevels = ["TECHNICIAN", "INTERNAL"] as const satisfies readonly EvidenceAccessLevel[];
// @ts-expect-error CLIENT pertenece al backend y no es un nivel aceptado por el frontend.
const invalidAccessLevel: EvidenceAccessLevel = "CLIENT";
void validAccessLevels;
void invalidAccessLevel;

function jsonResponse<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
  });
}

const evidence = {
  id: "evidence-1",
  originalName: "informe.pdf",
  mimeType: "application/pdf",
  fileExtension: "pdf",
  sizeBytes: 128,
  description: "Informe de cierre",
  accessLevel: "TECHNICIAN",
  uploadedBy: { id: "user-1", displayName: "Ana López" },
  resourceType: "RECURRENCE",
  resourceId: "recurrence-1",
  checksumSha256: "private-checksum",
  version: 1,
  createdAt: "2026-08-31T13:00:00.000Z",
  updatedAt: "2026-08-31T13:00:00.000Z",
} satisfies Evidence;

afterEach(() => vi.mocked(fetch).mockReset());

describe("createEvidenceApi", () => {
  it("lista evidencias de una orden con la ruta anidada y página", async () => {
    const page = { items: [evidence], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(page));
    const controller = new AbortController();

    await expect(createEvidenceApi().listOrder("order/id", 1, controller.signal)).resolves.toEqual(page);
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(new URL(String(request)).pathname).toBe("/api/v1/orders/order%2Fid/evidences");
    expect(new URL(String(request)).search).toBe("?page=1&pageSize=20");
    expect(init).toEqual(expect.objectContaining({ signal: controller.signal, credentials: "include" }));
  });

  it("sube evidencias de orden como multipart sin Content-Type manual", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(evidence));
    const file = new File(["imagen"], "foto.png", { type: "image/png" });

    await createEvidenceApi().uploadOrder("order/id", { file, accessLevel: "TECHNICIAN" });
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(new URL(String(request)).pathname).toBe("/api/v1/orders/order%2Fid/evidences");
    expect(new Headers(init?.headers).get("Content-Type")).toBeNull();
    expect((init?.body as FormData).get("file")).toBe(file);
  });

  it("lista evidencias paginadas con ID codificado y señal de aborto", async () => {
    const page = {
      items: [evidence],
      pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 },
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(page));
    const controller = new AbortController();

    const result = await createEvidenceApi().listRecurrence("rec/id con espacio", 2, controller.signal);
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const url = new URL(String(request));

    expect(url.pathname).toBe("/api/v1/recurrences/rec%2Fid%20con%20espacio/evidences");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(init).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(result).toEqual(page);
  });

  it("sube archivo, nivel y descripción normalizada sin fijar Content-Type", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(evidence));
    const file = new File(["%PDF-1.7"], "informe.pdf", { type: "application/pdf" });
    const input = {
      file,
      accessLevel: "TECHNICIAN",
      description: "  Informe de cierre  ",
    } satisfies EvidenceUploadInput;

    await createEvidenceApi().uploadRecurrence("rec/id con espacio", input);
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    const form = init?.body as FormData;

    expect(new URL(String(request)).pathname).toBe("/api/v1/recurrences/rec%2Fid%20con%20espacio/evidences");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(headers.get("Content-Type")).toBeNull();
    expect(form.get("file")).toBe(file);
    expect(form.get("accessLevel")).toBe("TECHNICIAN");
    expect(form.get("description")).toBe("Informe de cierre");
  });

  it("omite la descripción cuando sólo contiene espacios", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(evidence));
    const file = new File(["imagen"], "foto.webp", { type: "image/webp" });

    await createEvidenceApi().uploadRecurrence("recurrence-1", {
      file,
      accessLevel: "INTERNAL",
      description: "   ",
    });
    const form = vi.mocked(fetch).mock.calls[0]?.[1]?.body as FormData;

    expect(form.has("description")).toBe(false);
    expect(form.get("accessLevel")).toBe("INTERNAL");
  });

  it("descarga una evidencia con ID codificado", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("archivo", {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"informe.pdf\"",
      },
    }));

    const result = await createEvidenceApi().download("evidence/id con espacio");

    expect(new URL(String(vi.mocked(fetch).mock.calls[0]?.[0])).pathname)
      .toBe("/api/v1/evidences/evidence%2Fid%20con%20espacio/download");
    expect(result.filename).toBe("informe.pdf");
    expect(result.blob.type).toBe("application/pdf");
  });

  it("archiva con JSON, versión y motivo sin interpolar el ID crudo", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ...evidence, version: 2 }));

    const result = await createEvidenceApi().archive("evidence/id con espacio", {
      version: 1,
      reason: "Documento reemplazado por una versión corregida",
    });
    const [request, init] = vi.mocked(fetch).mock.calls[0]!;

    expect(new URL(String(request)).pathname)
      .toBe("/api/v1/evidences/evidence%2Fid%20con%20espacio/archive");
    expect(init).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        version: 1,
        reason: "Documento reemplazado por una versión corregida",
      }),
    }));
    expect(result.version).toBe(2);
  });
});
