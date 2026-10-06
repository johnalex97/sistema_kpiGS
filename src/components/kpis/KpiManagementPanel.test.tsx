import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KpiManagementPanel } from "./KpiManagementPanel";

describe("KPI management panel", () => {
  it("directs target management to the name-based settings flow", async () => {
    const user = userEvent.setup();
    render(<KpiManagementPanel api={{} as never} periodStart="2026-10-05" capabilities={{ manageTargets: true }} onChanged={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /Administrar KPI/i }));
    expect(screen.getByRole("link", { name: "Gestionar metas en Configuración" })).toHaveAttribute("href", "/configuracion?section=kpi");
    expect(screen.queryByText("ID del técnico")).not.toBeInTheDocument();
  });
  it("stays hidden without server capabilities", () => {
    render(<KpiManagementPanel api={{} as never} periodStart="2026-08-24" capabilities={{}} onChanged={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Administrar KPI/i })).not.toBeInTheDocument();
  });

  it("validates that configuration percentages total exactly 100", async () => {
    const user = userEvent.setup();
    render(<KpiManagementPanel api={{ createConfiguration: vi.fn() } as never} periodStart="2026-08-24" capabilities={{ manageConfiguration: true }} onChanged={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /Administrar KPI/i }));
    await user.click(screen.getByRole("button", { name: "Ponderaciones" }));
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    const quality = screen.getByLabelText("Calidad (%)");
    await user.clear(quality); await user.type(quality, "20");
    expect(screen.getByText("Total: 90%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar ponderaciones" })).toBeDisabled();
  });

  it("shows default alert limits and serializes them with two decimals", async () => {
    const user = userEvent.setup(); const createConfiguration = vi.fn(async () => ({}));
    render(<KpiManagementPanel api={{ createConfiguration } as never} periodStart="2026-08-24" capabilities={{ manageConfiguration: true }} onChanged={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /Administrar KPI/i })); await user.click(screen.getByRole("button", { name: "Ponderaciones" }));
    expect(screen.getByLabelText("Calidad mínima (%)")).toHaveValue(60);
    expect(screen.getByLabelText("Reincidencia máxima (%)")).toHaveValue(10);
    await user.click(screen.getByRole("button", { name: "Guardar ponderaciones" }));
    expect(createConfiguration).toHaveBeenCalledWith(expect.objectContaining({ qualityCriticalThreshold: "60.00", recurrenceCriticalThreshold: "10.00", productivityAttentionThreshold: "70.00", complianceAttentionThreshold: "70.00", efficiencyAttentionThreshold: "70.00" }));
  });
});
