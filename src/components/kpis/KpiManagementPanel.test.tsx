import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KpiManagementPanel } from "./KpiManagementPanel";

describe("KPI management panel", () => {
  it("stays hidden without server capabilities", () => {
    render(<KpiManagementPanel api={{} as never} periodStart="2026-08-24" capabilities={{}} onChanged={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Administrar KPI/i })).not.toBeInTheDocument();
  });

  it("validates that configuration percentages total exactly 100", async () => {
    const user = userEvent.setup();
    render(<KpiManagementPanel api={{ createConfiguration: vi.fn() } as never} periodStart="2026-08-24" capabilities={{ manageConfiguration: true }} onChanged={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /Administrar KPI/i }));
    await user.click(screen.getByRole("button", { name: /Ponderaciones/i }));
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    const quality = screen.getByLabelText("Calidad (%)");
    await user.clear(quality); await user.type(quality, "20");
    expect(screen.getByText("Total: 90%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar ponderaciones" })).toBeDisabled();
  });
});
