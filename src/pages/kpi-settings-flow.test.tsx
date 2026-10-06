import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { adminUser, renderWithAuth } from "../test/auth-test-utils";

afterEach(() => { cleanup(); vi.mocked(fetch).mockReset(); vi.useRealTimers(); });
function setup(targets: unknown[] = []) {
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const path = String(input);
    if (init?.method === "POST" || init?.method === "PATCH") {
      writes.push({ path, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }
    const data = path.includes("/configurations") ? [] : path.includes("/targets") ? targets : { items: [{ id: "11111111-1111-4111-8111-111111111111", fullName: "Ana Técnica", code: "GS-001", status: "AVAILABLE" }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  renderWithAuth(<SettingsPage />, { user: { ...adminUser, permissions: ["KPI_MANAGE_TARGETS", "KPI_MANAGE_CONFIGURATION", "TECHNICIANS_VIEW"] } });
  return writes;
}
it("permite preparar KPI sin resultados ni permiso para administrar usuarios", async () => {
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  const writes = setup();
  expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "KPI" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ponderaciones" }));
  await screen.findByText(/Sin configuración KPI/);
  fireEvent.click(screen.getByRole("button", { name: "Guardar ponderaciones" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].body).toMatchObject({ initialize: true, validFrom: "2026-10-05", productivityWeight: "0.2000", complianceWeight: "0.2500", efficiencyWeight: "0.2500", qualityWeight: "0.3000" });
});
it("asigna metas buscando un nombre y no solicita UUID al administrador", async () => {
  const writes = setup();
  fireEvent.click(screen.getByRole("button", { name: "KPI" }));
  fireEvent.change(await screen.findByLabelText("Buscar técnico"), { target: { value: "Ana" } });
  fireEvent.click(await screen.findByRole("button", { name: "Ana Técnica · GS-001" }));
  fireEvent.change(screen.getByLabelText("Trabajos objetivo"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Minutos productivos"), { target: { value: "1800" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar meta semanal" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].body).toMatchObject({ technicianId: "11111111-1111-4111-8111-111111111111", targetJobs: 10, targetProductiveMinutes: 1800 });
  expect(screen.queryByText("ID del técnico")).not.toBeInTheDocument();
});
it("consulta y edita una meta existente sin crear un duplicado", async () => {
  const writes = setup([{ id: "meta-1", tecnicoId: "t1", tecnico: { fullName: "Ana Técnica", code: "GS-001" }, targetJobs: 10, targetProductiveMinutes: 1800, observation: "" }]);
  fireEvent.click(screen.getByRole("button", { name: "KPI" }));
  fireEvent.click(await screen.findByRole("button", { name: "Editar meta de Ana Técnica" }));
  fireEvent.change(screen.getByLabelText("Trabajos objetivo"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios de meta" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].path).toContain("/targets/meta-1");
  expect(writes[0].body).toMatchObject({ targetJobs: 12, targetProductiveMinutes: 1800 });
});
it("oculta KPI a quien solo administra usuarios", () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { items: [], pagination: { page: 1, totalPages: 1 } } })));
  renderWithAuth(<SettingsPage />, { user: { ...adminUser, permissions: ["USERS_MANAGE"] } });
  expect(screen.queryByRole("button", { name: "KPI" })).not.toBeInTheDocument();
});

it("conserva el borrador cuando el servidor bloquea una semana cerrada", async () => {
  setup([{ id: "closed", tecnicoId: "t1", tecnico: { fullName: "Ana Técnica", code: "GS-001" }, targetJobs: 10, targetProductiveMinutes: 1800, observation: "" }]);
  const respond = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((input, init) => init?.method === "PATCH" ? Promise.resolve(new Response(JSON.stringify({ errors: [{ code: "KPI_WEEK_CLOSED", message: "La semana ya fue cerrada; requiere recálculo" }] }), { status: 409 })) : respond(input, init));
  fireEvent.click(screen.getByRole("button", { name: "KPI" }));
  fireEvent.click(await screen.findByRole("button", { name: "Editar meta de Ana Técnica" }));
  fireEvent.change(screen.getByLabelText("Trabajos objetivo"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios de meta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("requiere recálculo");
  expect(screen.getByLabelText("Trabajos objetivo")).toHaveValue(12);
  expect(screen.getByRole("button", { name: "Guardar cambios de meta" })).toBeEnabled();
});

it("mantiene el formulario al pulsar de nuevo la pestaña activa", async () => {
  setup();
  await screen.findByLabelText("Buscar técnico");
  fireEvent.click(screen.getByRole("button", { name: "Metas semanales" }));
  expect(screen.getByLabelText("Buscar técnico")).toBeInTheDocument();
});

it("bloquea ambas navegaciones mientras guarda ponderaciones y conserva el error", async () => {
  setup();
  const respond = vi.mocked(fetch).getMockImplementation()!;
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation((input, init) => init?.method === "POST" ? new Promise(resolve => { finish = resolve; }) : respond(input, init));
  fireEvent.click(screen.getByRole("button", { name: "Ponderaciones" }));
  await screen.findByRole("button", { name: "Guardar ponderaciones" });
  fireEvent.click(screen.getByRole("button", { name: "Guardar ponderaciones" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "KPI" })).toBeDisabled());
  expect(screen.getByRole("button", { name: "Metas semanales" })).toBeDisabled();
  finish(new Response(JSON.stringify({ errors: [{ code: "KPI_INITIALIZATION_NOT_ALLOWED", message: "Ya existe configuración" }] }), { status: 409 }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe configuración");
  expect(screen.getByLabelText("Calidad (%)")).toHaveValue(30);
  expect(screen.getByRole("button", { name: "KPI" })).toBeEnabled();
});
