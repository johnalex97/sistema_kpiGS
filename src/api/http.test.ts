import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  ApiNetworkError,
  requestBlob,
  requestFormData,
  requestJson,
  subscribeUnauthorized,
} from "./http";

afterEach(() => vi.mocked(fetch).mockReset());

describe("requestJson", () => {
  it("acepta respuestas 204 sin decodificar JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(requestJson<void>("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("distingue una falla de red", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(requestJson("/auth/me")).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it("conserva errores por campo", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      message: "Datos inválidos",
      errors: [{ field: "email", code: "VALIDATION_ERROR", message: "Correo inválido" }],
    }), { status: 400, headers: { "Content-Type": "application/json" } }));

    await expect(requestJson("/auth/login", { method: "POST" })).rejects.toMatchObject({
      status: 400,
      fieldErrors: [{ field: "email", message: "Correo inválido" }],
    });
  });

  it("notifica 401 salvo que se desactive explícitamente", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "UNAUTHORIZED", message: "Sesión requerida" }],
    }), { status: 401, headers: { "Content-Type": "application/json" } }));

    await requestJson("/private").catch(() => undefined);
    await requestJson("/auth/me", {}, { notifyUnauthorized: false }).catch(() => undefined);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("requestFormData", () => {
  it("envía el formulario con cookies y elimina un Content-Type recibido", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      data: { id: "evidence-1" },
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const form = new FormData();
    form.set("file", new File(["%PDF-1.7"], "prueba.pdf", { type: "application/pdf" }));

    await requestFormData<{ id: string }>("/recurrences/r-1/evidences", form, {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=manual",
        "X-Request-Source": "recurrences",
      },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(init).toEqual(expect.objectContaining({
      method: "POST",
      body: form,
      credentials: "include",
    }));
    expect(headers.get("Content-Type")).toBeNull();
    expect(headers.get("X-Request-Source")).toBe("recurrences");
  });

  it("comparte la traducción de errores y la notificación 401", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ field: "file", code: "UNAUTHORIZED", message: "Sesión requerida" }],
    }), { status: 401, headers: { "Content-Type": "application/json" } }));

    const request = requestFormData("/recurrences/r-1/evidences", new FormData(), { method: "POST" });

    await expect(request).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
      fieldErrors: [{ field: "file", message: "Sesión requerida" }],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("distingue una falla de red", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(requestFormData("/recurrences/r-1/evidences", new FormData()))
      .rejects.toBeInstanceOf(ApiNetworkError);
  });
});

describe("requestBlob", () => {
  it("descarga con cookies, conserva el MIME y prefiere el nombre UTF-8", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("archivo", {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"reporte.pdf\"; filename*=UTF-8''reporte%20t%C3%A9cnico.pdf",
      },
    }));
    const controller = new AbortController();

    const result = await requestBlob("/evidences/e-1/download", controller.signal);

    expect(result.filename).toBe("reporte técnico.pdf");
    expect(result.blob.type).toBe("application/pdf");
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      credentials: "include",
      signal: controller.signal,
    }));
  });

  it("reduce nombres con rutas a un nombre de archivo seguro", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("archivo", {
      headers: { "Content-Disposition": "attachment; filename=\"../../reporte.pdf\"" },
    }));

    await expect(requestBlob("/evidences/e-1/download")).resolves.toMatchObject({
      filename: "reporte.pdf",
    });
  });

  it("devuelve null ante un nombre extendido malformado", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("archivo", {
      headers: { "Content-Disposition": "attachment; filename*=UTF-8''%E0%A4%A" },
    }));

    await expect(requestBlob("/evidences/e-1/download")).resolves.toMatchObject({ filename: null });
  });

  it("usa filename como respaldo cuando filename* está malformado", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("archivo", {
      headers: {
        "Content-Disposition": "attachment; filename=\"reporte-valido.pdf\"; filename*=UTF-8''%E0%A4%A",
      },
    }));

    await expect(requestBlob("/evidences/e-1/download")).resolves.toMatchObject({
      filename: "reporte-valido.pdf",
    });
  });

  it("distingue una falla de red al descargar", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(requestBlob("/evidences/e-1/download")).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it("traduce errores JSON y notifica 401 antes de leer el binario", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "UNAUTHORIZED", message: "Sesión requerida" }],
    }), { status: 401, headers: { "Content-Type": "application/json" } }));

    const request = requestBlob("/evidences/e-1/download");

    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
