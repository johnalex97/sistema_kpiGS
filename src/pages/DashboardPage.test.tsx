import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

describe("KPI dashboard", () => {
  it("renders official KPI dimensions, ranking, and an accessible trend", async () => {
    const kpiApi = { getDashboard: vi.fn(async () => ({
      status: "OFFICIAL", granularity: "WEEK", warnings: [], capabilities: {},
      items: [{ technicianId: "a", code: "TEC-01", fullName: "Ana López", periodStart: "2026-08-24", periodEnd: "2026-08-30",
        completedCredits: "8.5000", appliedTarget: 10, registeredMinutes: 600, productiveMinutes: 500,
        productivityScore: "85.00", complianceScore: null, efficiencyScore: "83.33", qualityScore: "90.00", overallScore: "86.40",
        weights: { productivity: "0.2000", compliance: "0.2500", efficiency: "0.2500", quality: "0.3000" } }],
    })) };
    render(<DashboardPage onGoRecurrence={() => undefined} onGoActivities={() => undefined} onGoTechnicians={() => undefined} kpiApi={kpiApi as never} />);
    expect((await screen.findAllByText("86.40"))[0]).toBeInTheDocument();
    expect(screen.getByText("No aplica")).toBeInTheDocument();
    expect(screen.getAllByText("Ana López")[0]).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Comparación entre técnicos" })).toBeInTheDocument();
    expect(screen.getByText(/Oficial hasta/i)).toBeInTheDocument();
  });

  it("abre la semana actual de Honduras incluso antes de medianoche local del lunes UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T05:30:00Z"));
    try {
      const getDashboard = vi.fn(async () => ({ status: "PREVIEW", items: [], warnings: [], capabilities: {} }));
      render(<DashboardPage onGoRecurrence={() => undefined} onGoActivities={() => undefined} onGoTechnicians={() => undefined} kpiApi={{ getDashboard } as never} />);
      await waitFor(() => expect(getDashboard).toHaveBeenCalledWith({ periodStart: "2026-09-28", granularity: "WEEK" }, expect.any(AbortSignal)));
      expect(screen.getByText("2026-09-28")).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("permite actualizar la jornada operativa manualmente", async () => {
    const operationalApi = { getOperationalDashboard: vi.fn(async () => ({ date: "2026-09-30", generatedAt: "2026-09-30T12:00:00.000Z", capabilities: { team: false, recentActivities: false, recurrences: false }, team: [], recentActivities: [], recurrences: null })) };
    render(<DashboardPage onGoRecurrence={() => undefined} onGoActivities={() => undefined} onGoTechnicians={() => undefined} operationalApi={operationalApi as never} />);
    await screen.findByRole("button", { name: "Actualizar jornada" });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar jornada" }));
    expect(operationalApi.getOperationalDashboard).toHaveBeenCalledTimes(2);
  });
});
