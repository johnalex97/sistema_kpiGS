import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ActivityDetail } from "../../models/activity";
import { ActivityActionDialog } from "./ActivityActionDialog";

const activity: ActivityDetail = {
  id: "activity-1",
  branch: { id: "branch-1", code: "TGU-01", name: "Centro", client: { id: "client-1", code: "CLI-1", tradeName: "Cliente Demo" } },
  order: null,
  activityType: { id: "type-1", code: "SUP", name: "Soporte", description: null, displayOrder: 1 },
  status: "IN_PROGRESS",
  description: "Revisar router",
  result: null,
  responsible: null,
  startedAt: "2026-08-26T14:00:00.000Z",
  endedAt: null,
  pausedMinutes: 0,
  productiveMinutes: null,
  createdAt: "2026-08-26T13:00:00.000Z",
  updatedAt: "2026-08-26T14:00:00.000Z",
  version: 2,
  observations: null,
  team: [],
  pauses: [],
};

describe("ActivityActionDialog", () => {
  it("exige y envia el motivo al pausar", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);
    render(<ActivityActionDialog action="pause" activity={activity} pending={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Confirmar pausa" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el motivo");
    await user.type(screen.getByLabelText("Motivo"), "Esperando acceso");
    await user.click(screen.getByRole("button", { name: "Confirmar pausa" }));
    expect(onConfirm).toHaveBeenCalledWith({ type: "pause", reason: "Esperando acceso" });
  });

  it("envia resultado y observaciones al completar", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);
    render(<ActivityActionDialog action="complete" activity={activity} pending={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("Resultado"), "Enlace estable");
    await user.type(screen.getByLabelText("Observaciones"), "Se cambio el conector");
    await user.click(screen.getByRole("button", { name: "Completar actividad" }));
    expect(onConfirm).toHaveBeenCalledWith({ type: "complete", result: "Enlace estable", observations: "Se cambio el conector" });
  });

  it("mantiene el dialogo bloqueado durante el envio y muestra errores", async () => {
    const onCancel = vi.fn();
    render(<ActivityActionDialog action="resume" activity={{ ...activity, status: "PAUSED" }} pending error="La actividad cambio" onConfirm={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("alert")).toHaveTextContent("La actividad cambio");
    expect(screen.getByRole("button", { name: "Reanudar actividad" })).toBeDisabled();
    await userEvent.setup().keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
