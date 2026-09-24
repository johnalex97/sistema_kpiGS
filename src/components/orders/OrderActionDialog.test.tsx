import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrderDetail } from "../../models/order";
import { OrderActionDialog } from "./OrderActionDialog";

const order: OrderDetail = {
  id: "order-1", orderNumber: "OT-2026-0001",
  client: { id: "client-1", code: "CLI-1", tradeName: "Cliente" },
  branch: { id: "branch-1", code: "MAIN", name: "Principal" },
  serviceType: { id: "service-1", code: "SUPPORT", name: "Soporte" },
  priority: "HIGH", status: "IN_PROGRESS", reportedProblem: "Sin red",
  scheduledFor: "2026-09-17T14:00:00.000Z", primaryTechnician: { id: "tech-1", code: "TEC-1", fullName: "Ana" },
  supportCount: 0, overdue: false, startedAt: "2026-09-17T15:00:00.000Z",
  endedAt: null, estimatedMinutes: 60, totalMinutes: null,
  createdAt: "2026-09-17T12:00:00.000Z", updatedAt: "2026-09-17T15:00:00.000Z",
  version: 3, description: "Descripción original", diagnosis: null, result: null,
  cancellationReason: null, participants: [], materials: [],
};

describe("OrderActionDialog", () => {
  it("mantiene foco contenido cuando todos los controles están pendientes", async () => {
    const props = { action: "pause" as const, order, pending: false, error: null, onCancel: vi.fn(), onSubmit: vi.fn() };
    const view = render(<><button>Fondo</button><OrderActionDialog {...props} /></>);
    view.rerender(<><button>Fondo</button><OrderActionDialog {...props} pending /></>);
    const dialog = screen.getByRole("dialog");
    await userEvent.setup().tab();
    expect(document.activeElement === dialog || dialog.contains(document.activeElement)).toBe(true);
  });
  it("requires a ten-character comment before pausing", async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<OrderActionDialog action="pause" order={order} pending={false} error={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog", { name: "Pausar orden" });
    await user.type(within(dialog).getByRole("textbox", { name: "Comentario" }), "breve");
    await user.click(within(dialog).getByRole("button", { name: "Pausar orden" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("10 caracteres");
  });

  it("submits diagnosis and result to complete an order", async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<OrderActionDialog action="complete" order={order} pending={false} error={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox", { name: "Diagnóstico" }), "Conector dañado");
    await user.type(screen.getByRole("textbox", { name: "Resultado" }), "Enlace restablecido");
    await user.click(screen.getByRole("button", { name: "Finalizar orden" }));
    expect(onSubmit).toHaveBeenCalledWith({ diagnosis: "Conector dañado", result: "Enlace restablecido" });
  });

  it("requires explicit cancellation reason", async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<OrderActionDialog action="cancel" order={order} pending={false} error={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox", { name: "Motivo de cancelación" }), "Cliente solicita reprogramar visita");
    await user.click(screen.getByRole("button", { name: "Cancelar definitivamente" }));
    expect(onSubmit).toHaveBeenCalledWith({ cancellationReason: "Cliente solicita reprogramar visita" });
  });

  it("requires a reason and at least one real adjustment", async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<OrderActionDialog action="adjust" order={{ ...order, status: "COMPLETED" }} pending={false} error={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox", { name: "Motivo del ajuste" }), "Corrección autorizada por supervisor");
    await user.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("al menos un dato");

    await user.clear(screen.getByRole("textbox", { name: "Descripción" }));
    await user.type(screen.getByRole("textbox", { name: "Descripción" }), "Descripción corregida");
    await user.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reason: "Corrección autorizada por supervisor",
      description: "Descripción corregida",
    });
  });

  it("does not round an untouched timestamp when another field changes", async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<OrderActionDialog action="adjust" order={{ ...order, status: "COMPLETED", startedAt: "2026-09-17T15:23:47.531Z" }} pending={false} error={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox", { name: "Motivo del ajuste" }), "Corrección autorizada por supervisor");
    await user.clear(screen.getByRole("textbox", { name: "Descripción" }));
    await user.type(screen.getByRole("textbox", { name: "Descripción" }), "Descripción corregida");
    await user.click(screen.getByRole("button", { name: "Guardar ajuste" }));

    expect(onSubmit).toHaveBeenCalledWith({
      reason: "Corrección autorizada por supervisor",
      description: "Descripción corregida",
    });
  });

  it("preserves seconds when a date is edited and restored to its original visible value", async () => {
    const onSubmit = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<OrderActionDialog action="adjust" order={{ ...order, status: "COMPLETED", startedAt: "2026-09-17T15:23:47.531Z" }} pending={false} error={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
    const startedAt = screen.getByLabelText("Inicio real");
    await user.clear(startedAt);
    await user.type(startedAt, "2026-09-17T09:24");
    await user.clear(startedAt);
    await user.type(startedAt, "2026-09-17T09:23");
    await user.type(screen.getByRole("textbox", { name: "Motivo del ajuste" }), "Corrección autorizada por supervisor");
    await user.clear(screen.getByRole("textbox", { name: "Descripción" }));
    await user.type(screen.getByRole("textbox", { name: "Descripción" }), "Descripción corregida");
    await user.click(screen.getByRole("button", { name: "Guardar ajuste" }));

    expect(onSubmit).toHaveBeenCalledWith({
      reason: "Corrección autorizada por supervisor",
      description: "Descripción corregida",
    });
  });
});
