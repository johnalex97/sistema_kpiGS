import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTechnicianApi } from "./technicians";
import type {
  CreateTechnicianInput,
  DeactivateTechnicianInput,
  EligibleUserPage,
  ReactivateTechnicianInput,
  Technician,
  TechnicianPage,
  UpdateTechnicianInput,
} from "../models/technician";

function jsonResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const technician: Technician = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "TEC-001",
  fullName: "Ana López",
  specialty: "Redes",
  workPhone: "+504 9999-0000",
  workEmail: "ana@example.com",
  status: "AVAILABLE",
  hiredOn: "2025-01-01",
  leftOn: null,
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    email: "ana@example.com",
    displayName: "Ana López",
  },
  createdAt: "2026-08-26T13:00:00.000Z",
  updatedAt: "2026-08-26T13:00:00.000Z",
  version: 3,
};

const technicianPage: TechnicianPage = {
  items: [technician],
  pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 },
};

const eligibleUserPage: EligibleUserPage = {
  items: [{ id: "33333333-3333-4333-8333-333333333333", email: "nuevo@example.com", displayName: "Nuevo usuario" }],
  pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 },
};

beforeEach(() => vi.mocked(fetch).mockReset());
afterEach(() => vi.mocked(fetch).mockReset());

describe("createTechnicianApi", () => {
  it("serializa filtros de lista, devuelve la página y propaga credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(technicianPage));

    const result = await createTechnicianApi().list({
      search: "Ana López",
      status: "AVAILABLE",
      includeInactive: true,
      page: 2,
      pageSize: 20,
    });

    expect(result).toEqual(technicianPage);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/technicians?search=Ana+L%C3%B3pez&status=AVAILABLE&includeInactive=true&page=2&pageSize=20"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("consulta detalle y usuarios elegibles con IDs codificados y señal de aborto", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(technician))
      .mockResolvedValueOnce(jsonResponse(eligibleUserPage));
    const controller = new AbortController();
    const api = createTechnicianApi();

    await expect(api.detail("tech/id con espacio", controller.signal)).resolves.toEqual(technician);
    await expect(api.eligibleUsers("Ana López", 2, "tech/id con espacio", controller.signal)).resolves.toEqual(eligibleUserPage);

    const [detailRequest, detailInit] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(detailRequest)).toContain("/technicians/tech%2Fid%20con%20espacio");
    expect(detailInit).toEqual(expect.objectContaining({ credentials: "include", signal: controller.signal }));

    const [eligibleRequest, eligibleInit] = vi.mocked(fetch).mock.calls[1]!;
    expect(String(eligibleRequest)).toContain("/technicians/eligible-users?search=Ana+L%C3%B3pez&page=2&pageSize=20&technicianId=tech%2Fid+con+espacio");
    expect(eligibleInit).toEqual(expect.objectContaining({ credentials: "include", signal: controller.signal }));
  });

  it.each<{
    name: string;
    path: string;
    method: string;
    body: unknown;
    invoke: () => Promise<Technician>;
  }>([
    {
      name: "crear",
      path: "/technicians",
      method: "POST",
      body: { fullName: "Ana López", specialty: "Redes" } satisfies CreateTechnicianInput,
      invoke: () => createTechnicianApi().create({ fullName: "Ana López", specialty: "Redes" }),
    },
    {
      name: "editar",
      path: `/technicians/${technician.id}`,
      method: "PATCH",
      body: { version: 3, fullName: "Ana López García" } satisfies UpdateTechnicianInput,
      invoke: () => createTechnicianApi().update(technician.id, { version: 3, fullName: "Ana López García" }),
    },
    {
      name: "cambiar estado",
      path: `/technicians/${technician.id}/status`,
      method: "PATCH",
      body: { version: 3, status: "ON_ROUTE" },
      invoke: () => createTechnicianApi().changeStatus(technician.id, { version: 3, status: "ON_ROUTE" }),
    },
    {
      name: "desactivar",
      path: `/technicians/${technician.id}`,
      method: "DELETE",
      body: { version: 3, leftOn: "2026-08-27", reason: "Fin de relación laboral" } satisfies DeactivateTechnicianInput,
      invoke: () => createTechnicianApi().deactivate(technician.id, { version: 3, leftOn: "2026-08-27", reason: "Fin de relación laboral" }),
    },
    {
      name: "reactivar",
      path: `/technicians/${technician.id}/reactivate`,
      method: "POST",
      body: { version: 3, reason: "Regresa a operaciones" } satisfies ReactivateTechnicianInput,
      invoke: () => createTechnicianApi().reactivate(technician.id, { version: 3, reason: "Regresa a operaciones" }),
    },
  ])("envía método, ruta y cuerpo exactos al $name", async ({ path, method, body, invoke }) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(technician));

    await expect(invoke()).resolves.toEqual(technician);

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.objectContaining({
      method,
      credentials: "include",
      body: JSON.stringify(body),
    }));
  });
});
