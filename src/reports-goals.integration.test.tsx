import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppShell } from "./layouts/AppShell";
import { adminUser, renderWithAuth } from "./test/auth-test-utils";

const row = (id: string, credits: string, target: number) => ({ technicianId: id, code: id, fullName: id === "t1" ? "Ana" : "Luis", completedCredits: credits, appliedTarget: target,
  productivityScore: "40", complianceScore: null, efficiencyScore: "60", qualityScore: null, overallScore: "50" });
const performanceRow = { technicianId: "t1", code: "GS-1", fullName: "Ana", overallScore: 50, comparison: null, completedJobs: 4,
  registeredMinutes: 100, productiveMinutes: 60, pausedMinutes: 40, attributableRecurrences: 0, recurrenceRate: 0,
  dimensions: { productivity: 40, compliance: null, efficiency: 60, quality: null }, alerts: [] };
function network(items = [row("t1", "4.0000", 10)], warnings: Array<{ code: string; technicianId?: string }> = []) {
  vi.mocked(fetch).mockImplementation(async input => {
    const path = String(input);
    if (path.includes("/kpis/weekly")) return new Response(JSON.stringify({ data: { status: "PREVIEW", items, warnings, capabilities: {} } }), { status: 200 });
    if (path.includes("/performance-analytics/export.csv")) return new Response("tecnico,trabajos\nAna,4", { status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=reportes.csv" } });
    if (path.includes("/performance-analytics/summary")) return new Response(JSON.stringify({ data: { status: "PREVIEW", period: { granularity: "WEEK", periodStart: "2026-10-05", periodEnd: "2026-10-11" }, generatedAt: "2026-10-05T12:00:00Z", teamAverage: null, rows: [performanceRow] } }), { status: 200 });
    throw new Error(`Ruta inesperada: ${path}`);
  });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.mocked(fetch).mockReset(); window.history.replaceState({}, "", "/"); });
function renderShell(own = false) {
  window.history.replaceState({}, "", "/configuracion");
  renderWithAuth(<AppShell />, { user: { ...adminUser, technicianId: own ? "t1" : null, permissions: [own ? "KPI_VIEW_OWN" : "KPI_VIEW_ALL"] } });
}

it("reemplaza cifras de demostración por el avance ponderado del equipo", async () => {
  network([row("t1", "4.0000", 10), row("t2", "2.0000", 20)]);
  renderShell();
  expect(await screen.findByText("20%")).toBeInTheDocument();
  expect(screen.getByText("6 de 30 trabajos acreditados")).toBeInTheDocument();
  expect(screen.queryByText("126 de 160 actividades")).not.toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Meta semanal" })).toHaveAttribute("aria-valuenow", "20");
});

it("un técnico solo ve su avance aunque una respuesta incluya otro técnico", async () => {
  network([row("t1", "4.0000", 10), row("t2", "100", 20)]);
  renderShell(true);
  expect(await screen.findByText("40%")).toBeInTheDocument();
  expect(screen.getByText("4 de 10 trabajos acreditados")).toBeInTheDocument();
});

it("no inventa porcentajes cuando falta una meta", async () => {
  network([], [{ code: "MISSING_TARGET", technicianId: "t1" }]);
  renderShell();
  expect(await screen.findByText("Sin meta configurada")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

it("Ver detalle abre reportes con el desglose semanal y permite consultar mes y año", async () => {
  network();
  renderShell();
  await screen.findByText("40%");
  fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
  expect(await screen.findByRole("heading", { name: "Reportes" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/reportes");
  const detail = await screen.findByRole("region", { name: "Metas de esta semana" });
  expect(within(detail).getByText("Ana")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "MONTH" } });
  await waitFor(() => expect(window.location.search).toContain("granularity=MONTH"));
  fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "YEAR" } });
  await waitFor(() => expect(window.location.search).toContain("granularity=YEAR"));
});

it("no muestra Reportes ni metas a cuentas sin permiso KPI", () => {
  network();
  window.history.replaceState({}, "", "/reportes");
  renderWithAuth(<AppShell />, { user: { ...adminUser, permissions: ["USERS_MANAGE"] } });
  expect(screen.queryByRole("button", { name: "Reportes" })).not.toBeInTheDocument();
  expect(screen.queryByText("Meta semanal")).not.toBeInTheDocument();
});

it("cuenta créditos fraccionados y limita la barra sin ocultar el sobrecumplimiento", async () => {
  network([row("t1", "12.5000", 10)]);
  renderShell();
  expect(await screen.findByText("125%")).toBeInTheDocument();
  expect(screen.getByText("12.5 de 10 trabajos acreditados")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
});

it("señala que el avance es parcial cuando hay técnicos sin meta", async () => {
  network([row("t1", "4", 10)], [{ code: "MISSING_TARGET", technicianId: "t2" }]);
  renderShell();
  expect(await screen.findByText("Avance parcial: hay técnicos sin meta.")).toBeInTheDocument();
});

it("consulta la semana de Honduras y no la semana UTC del navegador", async () => {
  vi.setSystemTime(new Date("2026-10-05T05:30:00Z"));
  network();
  renderShell();
  await screen.findByText("40%");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("periodStart=2026-09-28&granularity=WEEK"), expect.objectContaining({ credentials: "include" }));
});

it("permite exportar el periodo seleccionado con CSV real de la API", async () => {
  network();
  renderShell();
  fireEvent.click(screen.getByRole("button", { name: "Reportes" }));
  await screen.findByRole("button", { name: "Ver detalle de Ana" });
  fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "MONTH" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/performance-analytics/export.csv?granularity=month"), expect.objectContaining({ credentials: "include" })));
});

it("una falla de consulta no presenta cifras falsas y permite reintentar", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("Sin red"));
  renderShell();
  expect(await screen.findByText("No se pudo consultar la meta.")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  network();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar meta" }));
  expect(await screen.findByText("40%")).toBeInTheDocument();
});

it("distingue una configuración KPI ausente de una falla de conexión", async () => {
  network();
  const respond = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((input, init) => String(input).includes("/kpis/weekly")
    ? Promise.resolve(new Response(JSON.stringify({ message: "No existe una configuración KPI vigente para la semana", errors: [{ code: "KPI_CONFIG_MISSING", message: "No existe una configuración KPI vigente para la semana" }] }), { status: 409 }))
    : respond(input, init));
  renderShell();
  expect(await screen.findByText("Falta configuración KPI vigente.")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
  expect(await screen.findByText("No existe configuración KPI vigente para esta semana. Un administrador debe preparar la configuración inicial; no se mostrarán porcentajes hasta entonces.")).toBeInTheDocument();
});
