import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./layouts/AppShell";
import { renderWithAuth } from "./test/auth-test-utils";

const technicianId = "11111111-1111-4111-8111-111111111111";

function technician(version: number, status: "AVAILABLE" | "ON_ROUTE" | "INACTIVE" = "AVAILABLE") {
  return {
    id: technicianId,
    code: "TEC-009",
    fullName: "Carla Mejía",
    specialty: "Redes",
    workPhone: null,
    workEmail: "carla@geek.test",
    status,
    hiredOn: "2025-02-03",
    leftOn: status === "INACTIVE" ? "2026-08-27" : null,
    user: null,
    createdAt: "2025-02-03T14:00:00.000Z",
    updatedAt: "2026-08-27T15:30:00.000Z",
    version,
  };
}

function json(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("recorrido integrado de técnicos", () => {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];
  let current: ReturnType<typeof technician> | null;

  beforeEach(() => {
    current = null;
    requests.length = 0;
    window.history.replaceState({}, "", "/tecnicos");
    vi.mocked(fetch).mockReset().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      requests.push({ method, path: `${url.pathname}${url.search}`, body });

      if (url.pathname.endsWith("/kpis/dashboard")) return json({ status: "PREVIEW", items: [], warnings: [], capabilities: {} });
      if (url.pathname.endsWith("/technicians/eligible-users")) return json({
        items: [{ id: "user-eligible", email: "carla.usuario@geek.test", displayName: "Carla Usuario" }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
      if (url.pathname.endsWith("/technicians") && method === "GET") {
        const includeInactive = url.searchParams.get("includeInactive") === "true";
        const items = current && (current.status !== "INACTIVE" || includeInactive) ? [current] : [];
        return json({ items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 } });
      }
      if (url.pathname.endsWith("/technicians") && method === "POST") {
        current = technician(1);
        return json(current);
      }
      if (url.pathname.endsWith(`/technicians/${technicianId}`) && method === "GET") return json(current);
      if (url.pathname.endsWith(`/technicians/${technicianId}`) && method === "PATCH") {
        current = technician(2);
        return json(current);
      }
      if (url.pathname.endsWith(`/technicians/${technicianId}/status`) && method === "PATCH") {
        current = technician(3, "ON_ROUTE");
        return json(current);
      }
      if (url.pathname.endsWith(`/technicians/${technicianId}`) && method === "DELETE") {
        current = technician(4, "INACTIVE");
        return json(current);
      }
      if (url.pathname.endsWith(`/technicians/${technicianId}/reactivate`) && method === "POST") {
        current = technician(5, "AVAILABLE");
        return json(current);
      }
      throw new Error(`Solicitud no prevista: ${method} ${url.pathname}`);
    });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/resumen");
  });

  it("recorre la administración desde el shell, conserva versiones y consulta usuarios elegibles", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AppShell />);

    await user.type(screen.getByRole("textbox", { name: "Buscar orden, cliente o técnico" }), "Carla");
    await waitFor(() => expect(requests.some(({ path }) => path.includes("/technicians?search=Carla"))).toBe(true));

    await user.click(screen.getByRole("button", { name: "Nuevo técnico" }));
    await waitFor(() => expect(requests.some(({ path }) => path.includes("/technicians/eligible-users"))).toBe(true));
    await user.click(screen.getByRole("combobox", { name: "Usuario vinculado" }));
    await user.click(await screen.findByRole("option", { name: "Carla Usuario · carla.usuario@geek.test" }));
    await user.type(screen.getByLabelText("Nombre completo"), "Carla Mejía");
    await user.click(screen.getByRole("button", { name: "Crear técnico" }));
    await screen.findByRole("button", { name: "Ver técnico Carla Mejía" });

    await user.click(screen.getByRole("button", { name: "Ver técnico Carla Mejía" }));
    await screen.findByRole("dialog", { name: "Detalle del técnico" });
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Especialidad"));
    await user.type(screen.getByLabelText("Especialidad"), "Cableado");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await user.click(await screen.findByRole("button", { name: "Cambiar estado" }));
    await user.selectOptions(screen.getByLabelText("Nuevo estado"), "ON_ROUTE");
    await user.click(screen.getByRole("button", { name: "Guardar estado" }));

    await user.click(await screen.findByRole("button", { name: "Desactivar" }));
    await user.type(screen.getByLabelText("Motivo"), "Finalización autorizada por operaciones");
    await user.click(screen.getByRole("button", { name: "Desactivar técnico" }));
    await user.click(screen.getByLabelText("Incluir técnicos inactivos"));
    await user.click(await screen.findByRole("button", { name: "Reactivar" }));
    await user.type(screen.getByLabelText("Motivo"), "Retorno autorizado por operaciones");
    await user.click(screen.getByRole("button", { name: "Reactivar técnico" }));

    await waitFor(() => expect(requests.some(({ method, path }) => method === "POST" && path.endsWith(`/technicians/${technicianId}/reactivate`))).toBe(true));
    expect(requests.filter(({ method, path }) => method !== "GET" && path.includes("/technicians")).map(({ method, path, body }) => ({ method, path, version: body?.version }))).toEqual([
      { method: "POST", path: "/api/v1/technicians", version: undefined },
      { method: "PATCH", path: `/api/v1/technicians/${technicianId}`, version: 1 },
      { method: "PATCH", path: `/api/v1/technicians/${technicianId}/status`, version: 2 },
      { method: "DELETE", path: `/api/v1/technicians/${technicianId}`, version: 3 },
      { method: "POST", path: `/api/v1/technicians/${technicianId}/reactivate`, version: 4 },
    ]);
    expect(requests.find(({ method, path }) => method === "POST" && path.endsWith("/technicians"))?.body).toMatchObject({
      fullName: "Carla Mejía",
      userId: "user-eligible",
    });
    expect(requests.some(({ path }) => path.includes("/technicians/eligible-users?page=1&pageSize=20"))).toBe(true);
  });
});
