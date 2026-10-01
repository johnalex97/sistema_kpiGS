import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./layouts/AppShell";
import type { AuthUser } from "./models/auth";
import { renderWithAuth } from "./test/auth-test-utils";

const summary = { status: "PREVIEW", period: { granularity: "WEEK", periodStart: "2026-05-04", periodEnd: "2026-05-10" }, generatedAt: "2026-05-11T12:00:00.000Z", teamAverage: 74.2, rows: [{ technicianId: "tech-1", code: "TEC-001", fullName: "Ana López", overallScore: 71.5, comparison: -2, completedJobs: 4, registeredMinutes: 210, productiveMinutes: 170, pausedMinutes: 40, attributableRecurrences: 1, recurrenceRate: 25, dimensions: { productivity: 77, compliance: 74, efficiency: 71, quality: 55 }, alerts: [{ level: "CRITICAL", code: "QUALITY_LOW", message: "Calidad crítica: 55%." }] }] };
const ownUser: AuthUser = { id: "user-ana", email: "ana@geek.test", displayName: "Ana López", mustChangePassword: false, technicianId: "tech-1", roles: ["TECHNICIAN"], permissions: ["KPI_VIEW_OWN"] };
const allUser: AuthUser = { ...ownUser, id: "user-supervisor", roles: ["SUPERVISOR"], permissions: ["KPI_VIEW_ALL"] };

function json(data: unknown, status = 200) { return new Response(JSON.stringify(status < 300 ? { data } : { error: data }), { status, headers: { "Content-Type": "application/json" } }); }

describe("recorrido integrado de análisis de rendimiento", () => {
  const requests: string[] = [];
  let rejectNextSummary = false;

  beforeEach(() => {
    requests.length = 0;
    rejectNextSummary = false;
    window.history.replaceState({}, "", "/analisis?granularity=WEEK&periodStart=2026-05-04&technicianId=other-tech");
    vi.mocked(fetch).mockReset().mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/performance-analytics/summary")) {
        if (rejectNextSummary) { rejectNextSummary = false; return json({ code: "TEMPORARY", message: "El origen aún se está actualizando." }, 503); }
        return json(summary);
      }
      if (url.pathname.endsWith("/performance-analytics/export.csv")) return new Response("tecnico,calidad\nAna López,55", { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="rendimiento.csv"' } });
      throw new Error(`Solicitud no prevista: ${url.pathname}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.mocked(fetch).mockReset();
    window.history.replaceState({}, "", "/resumen");
  });

  it("entra desde el shell, cambia los tres periodos, explica una alerta, reintenta y exporta", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn(() => "blob:rendimiento");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    renderWithAuth(<AppShell />, { user: allUser });

    expect(await screen.findByText("Ana López")).toBeInTheDocument();
    for (const period of ["MONTH", "YEAR", "WEEK"]) await user.selectOptions(screen.getByLabelText("Periodo"), period);
    await waitFor(() => expect(requests.some((path) => path.includes("granularity=year"))).toBe(true));
    expect(requests.every((path) => !path.includes("technicianId"))).toBe(true);
    expect(screen.getByText("Calidad crítica: 55%.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Ver detalle de Ana López/ }));
    expect(screen.getByRole("dialog", { name: /Detalle de Ana López/, hidden: true })).toHaveTextContent("Calidad: 55.0%");
    await user.click(screen.getByRole("button", { name: "Cerrar detalle", hidden: true }));

    rejectNextSummary = true;
    await user.selectOptions(screen.getByLabelText("Periodo"), "MONTH");
    expect(await screen.findByRole("alert")).toHaveTextContent("El origen aún se está actualizando.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Rendimiento por técnico");

    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(requests.some((path) => path.includes("/performance-analytics/export.csv"))).toBe(true));
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("muestra sólo la lectura propia y no permite usar la URL para ampliar el alcance", async () => {
    renderWithAuth(<AppShell />, { user: ownUser });
    await screen.findByText("Ana López");
    expect(screen.queryByText("Promedio del equipo")).not.toBeInTheDocument();
    expect(screen.queryByText("Comparativa autorizada")).not.toBeInTheDocument();
    expect(requests.every((path) => !path.includes("technicianId"))).toBe(true);
  });
});
