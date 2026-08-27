import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Technician } from "../../models/technician";
import { TechnicianActionDialog } from "./TechnicianActionDialog";

const technician: Technician = {
  id: "11111111-1111-4111-8111-111111111111", code: "TEC-001", fullName: "Ana López",
  specialty: "Redes", workPhone: null, workEmail: "ana@geek.test", status: "AVAILABLE",
  hiredOn: "2025-02-03", leftOn: null, user: null, createdAt: "2025-02-03T14:00:00.000Z",
  updatedAt: "2026-08-27T15:30:00.000Z", version: 4,
};

describe("TechnicianActionDialog", () => {
  it("enfoca el primer campo y restaura el foco al cerrar", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const view = render(<TechnicianActionDialog action={{ kind: "status", technician }} onCancel={vi.fn()} onConfirm={vi.fn(async () => true)} />);
    expect(screen.getByLabelText("Nuevo estado")).toHaveFocus();
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("valida y confirma un nuevo estado operativo", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => true);
    render(<TechnicianActionDialog action={{ kind: "status", technician }} onCancel={vi.fn()} onConfirm={onConfirm} />);

    await user.selectOptions(screen.getByLabelText("Nuevo estado"), "ON_ROUTE");
    await user.click(screen.getByRole("button", { name: "Guardar estado" }));
    expect(onConfirm).toHaveBeenCalledWith({ status: "ON_ROUTE" });
  });

  it("valida razón, límites y fecha de retiro", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => true);
    render(<TechnicianActionDialog action={{ kind: "deactivate", technician }} now={() => new Date("2026-08-27T12:00:00-06:00")} onCancel={vi.fn()} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText("Motivo"), "Muy breve");
    await user.type(screen.getByLabelText("Fecha de retiro"), "2026-08-28");
    await user.click(screen.getByRole("button", { name: "Desactivar técnico" }));
    expect(screen.getByRole("alert")).toHaveTextContent("al menos 10 caracteres");
    expect(onConfirm).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Motivo"));
    await user.type(screen.getByLabelText("Motivo"), "Finalización del contrato laboral");
    await user.click(screen.getByRole("button", { name: "Desactivar técnico" }));
    expect(screen.getByRole("alert")).toHaveTextContent("no puede estar en el futuro");

    await user.clear(screen.getByLabelText("Fecha de retiro"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "x".repeat(501) } });
    await user.click(screen.getByRole("button", { name: "Desactivar técnico" }));
    expect(screen.getByRole("alert")).toHaveTextContent("no puede exceder 500 caracteres");

    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Finalización del contrato laboral" } });
    await user.type(screen.getByLabelText("Fecha de retiro"), "2026-08-27");
    await user.click(screen.getByRole("button", { name: "Desactivar técnico" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Finalización del contrato laboral", leftOn: "2026-08-27" });
  });

  it("conserva la entrada tras error y bloquea Escape durante el envío", async () => {
    const user = userEvent.setup();
    let finish: ((value: boolean) => void) | undefined;
    const onConfirm = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const onCancel = vi.fn();
    const view = render(<TechnicianActionDialog action={{ kind: "reactivate", technician: { ...technician, status: "INACTIVE" } }} onCancel={onCancel} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText("Motivo"), "Retorno aprobado por operaciones");
    await user.click(screen.getByRole("button", { name: "Reactivar técnico" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Retorno aprobado por operaciones" });
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    finish?.(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reactivar técnico" })).toBeEnabled());
    expect(screen.getByLabelText("Motivo")).toHaveValue("Retorno aprobado por operaciones");
    view.rerender(<TechnicianActionDialog action={{ kind: "reactivate", technician: { ...technician, status: "INACTIVE", version: 5 } }} error="El registro cambió; revisa la versión actual." onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByRole("alert")).toHaveTextContent("registro cambió");
    expect(screen.getByText("Ficha v5")).toBeInTheDocument();
  });

  it("bloquea Escape desde el mismo instante en que comienza el envío", async () => {
    const onCancel = vi.fn();
    let finish: ((value: boolean) => void) | undefined;
    const onConfirm = vi.fn(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      return new Promise<boolean>((resolve) => { finish = resolve; });
    });
    render(<TechnicianActionDialog action={{ kind: "status", technician }} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText("Nuevo estado"), { target: { value: "BUSY" } });
    fireEvent.submit(screen.getByRole("dialog", { name: "Cambiar estado" }));
    expect(onCancel).not.toHaveBeenCalled();
    finish?.(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar estado" })).toBeEnabled());
  });
});
