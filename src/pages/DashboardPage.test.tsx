import { render, screen } from "@testing-library/react";
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
    render(<DashboardPage works={[]} onGoRecurrence={() => undefined} kpiApi={kpiApi as never} />);
    expect((await screen.findAllByText("86.40"))[0]).toBeInTheDocument();
    expect(screen.getByText("No aplica")).toBeInTheDocument();
    expect(screen.getAllByText("Ana López")[0]).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /tendencia KPI/i })).toBeInTheDocument();
    expect(screen.getByText(/Oficial hasta/i)).toBeInTheDocument();
  });
});
