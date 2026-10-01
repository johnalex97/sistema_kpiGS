import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PerformanceFilters } from "./PerformanceFilters";

describe("PerformanceFilters", () => {
  it("reports the period chosen by the supervisor", () => {
    const onChange = vi.fn();
    render(<PerformanceFilters query={{ granularity: "WEEK", periodStart: "2026-05-04" }} onChange={onChange} onExport={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "MONTH" } });

    expect(onChange).toHaveBeenCalledWith({ granularity: "MONTH", periodStart: "2026-05-04" });
  });
});
