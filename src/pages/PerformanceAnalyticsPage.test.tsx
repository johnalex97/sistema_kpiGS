import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import type { PerformanceAnalyticsApi } from "../api/performance-analytics";
import { PerformanceAnalyticsPage } from "./PerformanceAnalyticsPage";

const summary = {
  status: "PREVIEW" as const,
  period: { granularity: "WEEK", periodStart: "2026-05-04", periodEnd: "2026-05-10" },
  generatedAt: "2026-05-11T12:00:00.000Z",
  teamAverage: 78.4,
  rows: [{ technicianId: "tech-1", code: "TEC-01", fullName: "Ana López", overallScore: 76.5, comparison: 2.5, completedJobs: 3, registeredMinutes: 120, productiveMinutes: 90, pausedMinutes: 30, attributableRecurrences: 1, recurrenceRate: 33.33, dimensions: { productivity: 80, compliance: 90, efficiency: 75, quality: 61 }, alerts: [{ level: "CRITICAL" as const, code: "QUALITY_LOW", message: "Calidad crítica: 61%." }] }],
};

function authValue(permissions: string[]): AuthContextValue {
  return { status: "authenticated", user: { id: "user-1", email: "user@geek.test", displayName: "Usuario", mustChangePassword: false, technicianId: "tech-1", roles: ["TECHNICIAN"], permissions }, notice: null, returnPath: null, login: vi.fn(), changePassword: vi.fn(), logout: vi.fn(), retry: vi.fn(), hasPermission: (...required) => required.some((permission) => permissions.includes(permission)) };
}

function api(rows = summary.rows): PerformanceAnalyticsApi {
  return { getSummary: vi.fn().mockResolvedValue({ ...summary, rows }), exportCsv: vi.fn().mockResolvedValue({ blob: new Blob(["codigo"], { type: "text/csv" }), filename: "rendimiento.csv" }) };
}

describe("PerformanceAnalyticsPage", () => {
  it("persists selected period in the URL and lets an authorized user download the CSV", async () => {
    window.history.replaceState({}, "", "/analisis?granularity=WEEK&periodStart=2026-05-04");
    const current = api();
    const user = userEvent.setup();
    render(<AuthContext.Provider value={authValue(["KPI_VIEW_ALL"])}><PerformanceAnalyticsPage api={current} /></AuthContext.Provider>);

    await screen.findByText("Ana López");
    await user.selectOptions(screen.getByLabelText("Periodo"), "MONTH");
    await waitFor(() => expect(window.location.search).toContain("granularity=MONTH"));
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(current.exportCsv).toHaveBeenCalled());
  });

  it("does not expose team ranking or average to an own-scope reader and opens a technician detail", async () => {
    const user = userEvent.setup();
    render(<AuthContext.Provider value={authValue(["KPI_VIEW_OWN"])}><PerformanceAnalyticsPage api={api()} /></AuthContext.Provider>);

    await screen.findByText("Ana López");
    expect(screen.queryByText("Promedio del equipo")).not.toBeInTheDocument();
    expect(screen.queryByText("Comparativa de técnicos")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ver detalle de Ana López/ }));
    expect(screen.getByRole("dialog", { name: /Detalle de Ana López/, hidden: true })).toBeInTheDocument();
  });

  it("guides the user when the authorized period has no data", async () => {
    render(<AuthContext.Provider value={authValue(["KPI_VIEW_OWN"])}><PerformanceAnalyticsPage api={api([])} /></AuthContext.Provider>);
    expect(await screen.findByRole("status", { name: "Sin datos de rendimiento" })).toHaveTextContent("No hay trabajo registrado");
  });
});
