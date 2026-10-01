import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PerformanceTable } from "./PerformanceTable";
import type { PerformanceTechnicianRow } from "../../models/performance-analytics";

const row: PerformanceTechnicianRow = { technicianId: "tech", code: "TEC-01", fullName: "Ana López", overallScore: 76.5, comparison: 2.5, completedJobs: 3, registeredMinutes: 120, productiveMinutes: 90, pausedMinutes: 30, attributableRecurrences: 1, recurrenceRate: 33.33, dimensions: { productivity: 80, compliance: 90, efficiency: 75, quality: 61 }, alerts: [{ level: "CRITICAL", code: "QUALITY_LOW", message: "Calidad crítica: 61%." }] };

describe("PerformanceTable", () => {
  it("shows four dimensions and opens the selected technician from keyboard", () => {
    const select = vi.fn();
    render(<PerformanceTable rows={[row]} showTeam onSelect={select} />);
    expect(screen.getByText("Productividad 80.0%")).toBeInTheDocument();
    expect(screen.getByText("Calidad 61.0%")).toBeInTheDocument();
    expect(screen.getByText("Calidad crítica: 61%.")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /Ana López/ }), { key: "Enter" });
    expect(select).toHaveBeenCalledWith(row);
  });

  it("orders the team by the selected performance signal", async () => {
    const user = userEvent.setup();
    const highScore = { ...row, technicianId: "tech-2", code: "TEC-02", fullName: "Beto", overallScore: 90, dimensions: { ...row.dimensions, quality: 55 } };
    render(<PerformanceTable rows={[row, highScore]} showTeam onSelect={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: /Ver detalle/ })[0]).toHaveAccessibleName(/Beto/);
    await user.selectOptions(screen.getByLabelText("Ordenar comparativa por"), "quality");
    expect(screen.getAllByRole("button", { name: /Ver detalle/ })[0]).toHaveAccessibleName(/Ana/);
  });
});
