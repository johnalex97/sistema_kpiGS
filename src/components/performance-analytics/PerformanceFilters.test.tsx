import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PerformanceFilters } from "./PerformanceFilters";

describe("PerformanceFilters", () => {
  it("reports the period chosen by the supervisor", () => {
    const onChange = vi.fn();
    render(<PerformanceFilters query={{ granularity: "WEEK", periodStart: "2026-05-04" }} onChange={onChange} onExport={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "MONTH" } });

    expect(onChange).toHaveBeenCalledWith({ granularity: "MONTH", periodStart: "2026-05-01" });
  });

  it("keeps period controls available while export is disabled", () => {
    render(<PerformanceFilters query={{ granularity: "WEEK", periodStart: "2026-05-04" }} onChange={vi.fn()} onExport={vi.fn()} exportDisabled />);

    expect(screen.getByLabelText("Periodo")).not.toBeDisabled();
    expect(screen.getByLabelText("Fecha de inicio")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
  });

  it("selects a client from the operational lookup", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const lookupApi = {
      catalog: vi.fn().mockResolvedValue({ serviceTypes: [{ id: "service-1", code: "INST", name: "Instalación" }], materials: [] }),
      clients: vi.fn().mockResolvedValue({ items: [{ id: "client-1", code: "CLI-01", tradeName: "Cliente Demo" }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }),
      branches: vi.fn().mockResolvedValue([]), technicians: vi.fn(),
    };
    render(<PerformanceFilters query={{ granularity: "WEEK", periodStart: "2026-05-04" }} onChange={onChange} onExport={vi.fn()} lookupApi={lookupApi} />);

    await user.click(screen.getByRole("button", { name: "Más filtros" }));
    await user.type(screen.getByLabelText("Cliente"), "Demo");
    await user.click(await screen.findByRole("option", { name: "Cliente Demo · CLI-01" }));

    expect(onChange).toHaveBeenCalledWith({ granularity: "WEEK", periodStart: "2026-05-04", clientId: "client-1", branchId: undefined });
  });
});
