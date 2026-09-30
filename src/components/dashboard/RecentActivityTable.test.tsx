import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationalActivity } from "../../models/dashboard";
import { RecentActivityTable } from "./RecentActivityTable";

const activity: OperationalActivity = { id: "act-1", type: "Instalación", description: "Instalar equipo", orderNumber: "OT-100", client: "Cliente Demo", branch: "Centro", responsible: "Ana Torres", status: "COMPLETED", startedAt: "2026-09-30T12:00:00.000Z", endedAt: "2026-09-30T13:00:00.000Z", pausedMinutes: 0, productiveMinutes: 60, updatedAt: "2026-09-30T13:00:00.000Z", isRecurrenceRelated: false };

describe("RecentActivityTable", () => {
  it("presenta actividad real y navega al modulo fuente", () => {
    const onGoActivities = vi.fn();
    render(<RecentActivityTable activities={[activity]} onGoActivities={onGoActivities} />);
    expect(screen.getByText("Instalación")).toBeInTheDocument();
    expect(screen.getByText("Ana Torres")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver actividades" }));
    expect(onGoActivities).toHaveBeenCalledOnce();
  });

  it("explica cuando no hay actividad reciente", () => {
    render(<RecentActivityTable activities={[]} onGoActivities={vi.fn()} />);
    expect(screen.getByText("No hay actividad reciente para esta fecha.")).toBeInTheDocument();
  });
});
