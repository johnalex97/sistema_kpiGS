import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationalTechnician } from "../../models/dashboard";
import { OperationalTeamBoard } from "./OperationalTeamBoard";

const team: OperationalTechnician[] = [
  { id: "1", code: "TEC-1", fullName: "Ana Torres", specialty: "Redes", status: "BUSY", activeActivity: { status: "IN_PROGRESS", type: "Soporte", client: "Café Central", branch: "Centro", description: "Revisar enlace", startedAt: "2026-09-30T12:00:00.000Z", pausedMinutes: 15 } },
  { id: "2", code: "TEC-2", fullName: "Luis Paz", specialty: null, status: "BUSY", activeActivity: null },
];

describe("OperationalTeamBoard", () => {
  it("muestra estado textual, actividad abierta y ausencia de actividad sin depender de color", () => {
    render(<OperationalTeamBoard team={team} generatedAt="2026-09-30T13:30:00.000Z" onGoTechnicians={vi.fn()} />);
    expect(screen.getByText("En actividad")).toBeInTheDocument();
    expect(screen.getByText("1 h 15 min")).toBeInTheDocument();
    expect(screen.getByText(/Café Central · Centro · Inicio/)).toBeInTheDocument();
    expect(screen.getByText("Sin actividad en curso")).toBeInTheDocument();
    expect(screen.getByText("Ocupado")).toBeInTheDocument();
  });
});
