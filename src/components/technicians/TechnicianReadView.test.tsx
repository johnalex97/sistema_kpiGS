import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KpiDashboardItem } from "../../models/kpi";
import type { Technician } from "../../models/technician";
import { TechnicianDetail } from "./TechnicianDetail";
import { TechnicianSummary } from "./TechnicianSummary";
import { TechnicianTable } from "./TechnicianTable";

const ana: Technician = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "TEC-001",
  fullName: "Ana López",
  specialty: "Redes",
  workPhone: "+504 9999-0001",
  workEmail: "ana@geek.test",
  status: "AVAILABLE",
  hiredOn: "2025-02-03",
  leftOn: null,
  user: { id: "user-1", email: "ana.user@geek.test", displayName: "Ana L." },
  createdAt: "2025-02-03T14:00:00.000Z",
  updatedAt: "2026-08-27T15:30:00.000Z",
  version: 4,
};

const kpi: KpiDashboardItem = {
  technicianId: ana.id,
  code: ana.code,
  fullName: ana.fullName,
  completedCredits: "8.5",
  appliedTarget: 10,
  registeredMinutes: 420,
  productiveMinutes: 365,
  productivityScore: "92.00",
  complianceScore: null,
  efficiencyScore: "86.90",
  qualityScore: "91.10",
  overallScore: "91.25",
};

describe("lectura de técnicos", () => {
  it("resume únicamente los resultados visibles y promedia KPI disponibles", () => {
    const technicians: Technician[] = [
      ana,
      { ...ana, id: "tech-2", fullName: "Bruno Díaz", status: "BUSY" },
      { ...ana, id: "tech-3", fullName: "Carla Paz", status: "ON_ROUTE" },
      { ...ana, id: "tech-4", fullName: "Diego Solís", status: "INACTIVE" },
    ];
    const kpis = new Map([[ana.id, kpi], ["tech-2", { ...kpi, technicianId: "tech-2", overallScore: "88.75" }]]);

    render(<TechnicianSummary technicians={technicians} kpis={kpis} showKpi />);

    const summary = screen.getByLabelText("Resultados visibles");
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(within(summary).getByText("1")).toBeInTheDocument();
    expect(within(summary).getByText("2")).toBeInTheDocument();
    expect(within(summary).getByText("90.00")).toBeInTheDocument();
    expect(within(summary).getByText("KPI semanal promedio")).toBeInTheDocument();
  });

  it("presenta el catálogo, traduce estados y entrega la selección", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<TechnicianTable technicians={[ana]} kpis={new Map([[ana.id, kpi]])} showKpi onSelect={onSelect} />);

    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("91.25")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Calidad real" })).toBeInTheDocument();
    expect(screen.getByText("91.10")).toBeInTheDocument();
    expect(screen.getByText("8.5 / 10")).toBeInTheDocument();
    expect(screen.getByText("6 h 05 min")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver técnico Ana López" }));
    expect(onSelect).toHaveBeenCalledWith(ana.id);
  });

  it("no revela encabezados ni datos KPI cuando no están autorizados", () => {
    render(<TechnicianTable technicians={[ana]} kpis={new Map([[ana.id, kpi]])} showKpi={false} onSelect={vi.fn()} />);

    expect(screen.queryByRole("columnheader", { name: "KPI semanal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Calidad real" })).not.toBeInTheDocument();
    expect(screen.queryByText("91.25")).not.toBeInTheDocument();
    expect(screen.queryByText("91.10")).not.toBeInTheDocument();
    expect(screen.queryByText("Productividad")).not.toBeInTheDocument();
  });

  it("enfoca el detalle, muestra datos operativos y cierra con Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAction = vi.fn();

    render(
      <TechnicianDetail
        technician={ana}
        kpi={kpi}
        showKpi
        actions={["edit"]}
        onClose={onClose}
        onAction={onAction}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Detalle del técnico" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByText("ana@geek.test")).toBeInTheDocument();
    expect(within(dialog).getByText("No aplica")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Editar" }));
    expect(onAction).toHaveBeenCalledWith("edit");
    await act(async () => { await user.keyboard("{Escape}"); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
