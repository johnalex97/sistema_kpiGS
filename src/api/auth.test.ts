import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./auth";
import { subscribeUnauthorized } from "./http";

const user = {
  id: "u1",
  email: "admin@geek.test",
  displayName: "Admin",
  mustChangePassword: false,
  technicianId: null,
  roles: ["ADMIN"],
  permissions: ["KPI_VIEW_ALL"],
};

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("authApi", () => {
  it("normaliza el correo y envía login con cookies", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { user } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await authApi.login({ email: " ADMIN@GEEK.TEST ", password: "secret" });

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/login"), expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email: "admin@geek.test", password: "secret" }),
    }));
  });

  it("no notifica errores 401 durante login o consulta de sesión", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "UNAUTHORIZED", message: "Sesión requerida" }],
    }), { status: 401, headers: { "Content-Type": "application/json" } }));

    await authApi.login({ email: "admin@geek.test", password: "secret" }).catch(() => undefined);
    await authApi.me().catch(() => undefined);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("envía el cambio de contraseña y devuelve el usuario", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { user } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(authApi.changePassword({ currentPassword: "old", newPassword: "new" })).resolves.toEqual(user);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/change-password"), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ currentPassword: "old", newPassword: "new" }),
    }));
  });

  it("cierra la sesión sin esperar contenido JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/logout"), expect.objectContaining({ method: "POST" }));
  });
});
