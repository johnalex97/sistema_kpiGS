import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiNetworkError,
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
