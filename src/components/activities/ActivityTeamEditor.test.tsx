import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityTeamInput, TechnicianOption } from "../../models/activity";
import { ActivityTeamEditor } from "./ActivityTeamEditor";

const technicians: TechnicianOption[] = [
  { id: "tech-1", code: "TEC-001", fullName: "Ana López", status: "AVAILABLE" },
  { id: "tech-2", code: "TEC-002", fullName: "Luis Gómez", status: "BUSY" },
];

const twoMembersAt40: ActivityTeamInput[] = [
  { technicianId: "tech-1", role: "RESPONSIBLE", participationPercentage: "40.00" },
  { technicianId: "tech-2", role: "PARTICIPANT", participationPercentage: "40.00" },
];

describe("ActivityTeamEditor", () => {
  it("exige exactamente 100.00 de participación", () => {
    render(<ActivityTeamEditor members={twoMembersAt40} technicians={technicians} onChange={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("La participación suma 80.00%; debe sumar 100.00%.");
    expect(screen.getByRole("button", { name: "Confirmar equipo" })).toBeDisabled();
  });

  it("impide técnicos repetidos y más de un responsable", () => {
    const members: ActivityTeamInput[] = [
      { technicianId: "tech-1", role: "RESPONSIBLE", participationPercentage: "50.00" },
      { technicianId: "tech-1", role: "RESPONSIBLE", participationPercentage: "50.00" },
    ];
    render(<ActivityTeamEditor members={members} technicians={technicians} onChange={vi.fn()} />);

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain("Un técnico no puede repetirse");
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain("exactamente un responsable");
  });

  it("confirma un equipo válido y comunica cambios controlados", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    const members: ActivityTeamInput[] = [{ technicianId: "tech-1", role: "RESPONSIBLE", participationPercentage: "100.00" }];
    function Harness() {
      const [current, setCurrent] = useState(members);
      return <ActivityTeamEditor members={current} technicians={technicians} onChange={(next) => { onChange(next); setCurrent(next); }} onConfirm={onConfirm} />;
    }
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText("Técnico 1"), "tech-2");
    const changed = [{ ...members[0], technicianId: "tech-2" }];
    expect(onChange).toHaveBeenLastCalledWith(changed);
    await user.click(screen.getByRole("button", { name: "Confirmar equipo" }));
    expect(onConfirm).toHaveBeenCalledWith(changed);
  });
});
