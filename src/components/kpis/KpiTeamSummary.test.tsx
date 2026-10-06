import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiScoreCards } from "./KpiScoreCards";
import { KpiTrend } from "./KpiTrend";
import type { KpiDashboardItem } from "../../models/kpi";

const items: KpiDashboardItem[] = [
  { technicianId: "a", code: "TEC-01", fullName: "Ana López", completedCredits: "3", productivityScore: "80.00", complianceScore: null, efficiencyScore: "60.00", qualityScore: "90.00", overallScore: "70.00" },
  { technicianId: "b", code: "TEC-02", fullName: "Luis Pérez", completedCredits: "2", productivityScore: "40.00", complianceScore: "50.00", efficiencyScore: "80.00", qualityScore: null, overallScore: "50.00" },
];

describe("Resumen del equipo", () => {
  it("promedia todos los técnicos y excluye No aplica en cada dimensión", () => {
    render(<KpiScoreCards items={items} status="PREVIEW" />);
    const summary = screen.getByRole("region", { name: "Indicadores principales del equipo" });
    expect(within(summary).getAllByText("60.00")).toHaveLength(2);
    expect(within(summary).getByText("50.00")).toBeInTheDocument();
    expect(within(summary).getByText("70.00")).toBeInTheDocument();
    expect(within(summary).getByText("90.00")).toBeInTheDocument();
    expect(within(summary).getAllByText("2 técnicos con indicador")).toHaveLength(3);
    expect(within(summary).getAllByText("1 técnico con indicador")).toHaveLength(2);
    expect(within(summary).getAllByText(/indicadores preliminares/i)).toHaveLength(5);
    expect(within(summary).queryByText(/indicadores oficiales/i)).not.toBeInTheDocument();
  });

  it("no convierte ausencia de datos en cero", () => {
    render(<KpiScoreCards items={[]} status="OFFICIAL" />);
    expect(screen.getAllByText("No aplica")).toHaveLength(5);
    expect(screen.getAllByText("0 técnicos con indicador")).toHaveLength(5);
    expect(screen.getAllByText(/indicadores oficiales/i)).toHaveLength(5);
  });

  it("compara técnicos identificados con barras, sin presentarlos como tendencia temporal", () => {
    render(<KpiTrend items={items} />);
    const comparison = screen.getByRole("region", { name: "Comparación entre técnicos" });
    expect(within(comparison).getByText("Ana López")).toBeInTheDocument();
    expect(within(comparison).getByText("Luis Pérez")).toBeInTheDocument();
    expect(within(comparison).getByRole("meter", { name: /Ana López/ })).toHaveAttribute("value", "70");
    expect(within(comparison).getByRole("meter", { name: /Luis Pérez/ })).toHaveAttribute("value", "50");
    expect(within(comparison).queryByRole("img", { name: /tendencia/i })).not.toBeInTheDocument();
  });
});
