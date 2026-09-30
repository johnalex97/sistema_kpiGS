import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecurrenceFocus } from "../../models/dashboard";
import { RecurrenceFocusPanel } from "./RecurrenceFocusPanel";

describe("RecurrenceFocusPanel", () => {
  it("muestra el caso prioritario y permite abrir reincidencias", () => {
    const onGoRecurrences = vi.fn();
    const focus: RecurrenceFocus = { openCases: 2, highImpactOpenCases: 1, averageVisits: 2, priorityCase: { id: "r-1", number: "RI-100", problem: "Falla intermitente", client: "Cliente Demo", visits: 3, impact: "HIGH", status: "OPEN", technicians: ["Ana Torres"] } };
    render(<RecurrenceFocusPanel focus={focus} onGoRecurrences={onGoRecurrences} />);
    expect(screen.getByText("RI-100 · ALTO")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analizar reincidencias" }));
    expect(onGoRecurrences).toHaveBeenCalledOnce();
  });

  it("muestra el foco cero y no renderiza un bloque no autorizado", () => {
    const { rerender } = render(<RecurrenceFocusPanel focus={{ openCases: 0, highImpactOpenCases: 0, averageVisits: 0, priorityCase: null }} onGoRecurrences={vi.fn()} />);
    expect(screen.getByText("Sin reincidencias abiertas")).toBeInTheDocument();
    rerender(<RecurrenceFocusPanel focus={null} onGoRecurrences={vi.fn()} />);
    expect(screen.queryByLabelText("Foco de reincidencias")).not.toBeInTheDocument();
  });
});
