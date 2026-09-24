import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderLookupApi } from "../../api/order-lookups";
import type { OrderDetail } from "../../models/order";
import { OrderAssignments } from "./OrderAssignments";

const order: OrderDetail = {
  id: "order-1", orderNumber: "OT-2026-0001",
  client: { id: "client-1", code: "CLI-1", tradeName: "Cliente" },
  branch: { id: "branch-1", code: "MAIN", name: "Principal" },
  serviceType: { id: "service-1", code: "SUPPORT", name: "Soporte" },
  priority: "HIGH", status: "ASSIGNED", reportedProblem: "Sin red",
  scheduledFor: null, primaryTechnician: { id: "tech-1", code: "TEC-1", fullName: "Ana López" },
  supportCount: 1, overdue: false, startedAt: null, endedAt: null,
  estimatedMinutes: 60, totalMinutes: null, createdAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z", version: 3, description: null,
  diagnosis: null, result: null, cancellationReason: null, materials: [],
  participants: [
    { id: "tech-old", code: "TEC-0", fullName: "Carlos Histórico", role: "SUPPORT", assignedAt: "2026-09-15T12:00:00.000Z", unassignedAt: "2026-09-15T14:00:00.000Z", active: false },
    { id: "tech-2", code: "TEC-2", fullName: "Beatriz Apoyo", role: "SUPPORT", assignedAt: "2026-09-16T12:00:00.000Z", unassignedAt: null, active: true },
    { id: "tech-1", code: "TEC-1", fullName: "Ana López", role: "PRIMARY", assignedAt: "2026-09-16T11:00:00.000Z", unassignedAt: null, active: true },
  ],
};

function lookupApi(): OrderLookupApi {
  return {
    catalog: vi.fn(), clients: vi.fn(), branches: vi.fn(),
    technicians: vi.fn(async () => ({
      items: [{ id: "tech-3", code: "TEC-3", fullName: "Diego Ruiz", status: "AVAILABLE" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    })),
  } as OrderLookupApi;
}

afterEach(() => vi.useRealTimers());

describe("OrderAssignments", () => {
  it("restaura foco al encabezado persistente después de retirar al técnico", async () => {
    let resolve!: (saved: boolean) => void;
    const props = { order, lookupApi: lookupApi(), pending: false, error: null, onAssign: vi.fn(), onUnassign: vi.fn(() => new Promise<boolean>((done) => { resolve = done; })) };
    const view = render(<OrderAssignments {...props} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retirar a Beatriz Apoyo" }));
    await user.type(screen.getByLabelText("Motivo"), "Cambio de turno autorizado");
    await user.click(screen.getByRole("button", { name: "Confirmar retiro" }));
    view.rerender(<OrderAssignments {...props} order={{ ...order, participants: order.participants.filter((item) => item.id !== "tech-2") }} />);
    await act(async () => resolve(true));
    expect(screen.getByRole("heading", { name: "Asignaciones" })).toHaveFocus();
  });
  it("atrapa foco de retiro incluso pendiente y lo restaura con Escape", async () => {
    const props = { order, lookupApi: lookupApi(), pending: false, error: null, onAssign: vi.fn(), onUnassign: vi.fn() };
    const view = render(<OrderAssignments {...props} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Retirar a Beatriz Apoyo" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    within(dialog).getByRole("button", { name: "Confirmar retiro" }).focus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Cerrar retiro" })).toHaveFocus();
    view.rerender(<OrderAssignments {...props} pending />);
    await user.tab();
    expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true);
    view.rerender(<OrderAssignments {...props} />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("no consulta técnicos sin permiso y borra resultados al revocarlo", async () => {
    const api = lookupApi();
    const props = { order, lookupApi: api, pending: false, error: null, onAssign: vi.fn(), onUnassign: vi.fn() };
    const view = render(<OrderAssignments {...props} canLookupTechnicians={false} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(api.technicians).not.toHaveBeenCalled();
    view.rerender(<OrderAssignments {...props} canLookupTechnicians />);
    await userEvent.setup().type(screen.getByRole("searchbox"), "Diego");
    expect(await screen.findByRole("option", { name: /Diego/ })).toBeInTheDocument();
    view.rerender(<OrderAssignments {...props} canLookupTechnicians={false} />);
    expect(screen.queryByRole("option", { name: /Diego/ })).not.toBeInTheDocument();
  });
  it("shows active participants before historical participation", () => {
    render(<OrderAssignments order={order} lookupApi={lookupApi()} pending={false} error={null} onAssign={vi.fn()} onUnassign={vi.fn()} />);
    const items = within(screen.getByRole("list", { name: "Equipo de la orden" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Ana López"),
      expect.stringContaining("Beatriz Apoyo"),
      expect.stringContaining("Carlos Histórico"),
    ]);
  });

  it("aborts an obsolete technician search and assigns the selected role", async () => {
    vi.useFakeTimers();
    const first = new Promise<never>(() => undefined);
    const api = lookupApi();
    vi.mocked(api.technicians).mockImplementationOnce(() => first);
    const onAssign = vi.fn(async () => true);
    render(<OrderAssignments order={order} lookupApi={api} pending={false} error={null} onAssign={onAssign} onUnassign={vi.fn()} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar técnico" }), { target: { value: "Diego" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    const firstSignal = vi.mocked(api.technicians).mock.calls[0]?.[2] as AbortSignal;
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar técnico" }), { target: { value: "Ruiz" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(firstSignal.aborted).toBe(true);
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole("option", { name: /Diego Ruiz/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Rol" }), { target: { value: "SUPPORT" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar técnico" }));
    await act(async () => { await Promise.resolve(); });
    expect(onAssign).toHaveBeenCalledWith("tech-3", "SUPPORT");
  });

  it("requires a reason before removing an active participant", async () => {
    const onUnassign = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<OrderAssignments order={order} lookupApi={lookupApi()} pending={false} error={null} onAssign={vi.fn()} onUnassign={onUnassign} />);
    await user.click(screen.getByRole("button", { name: "Retirar a Beatriz Apoyo" }));
    const dialog = screen.getByRole("dialog", { name: "Retirar técnico" });
    await user.type(within(dialog).getByRole("textbox", { name: "Motivo" }), "breve");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar retiro" }));
    expect(onUnassign).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("10 caracteres");

    await user.clear(within(dialog).getByRole("textbox", { name: "Motivo" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Motivo" }), "Cambio de turno autorizado");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar retiro" }));
    await waitFor(() => expect(onUnassign).toHaveBeenCalledWith("tech-2", "Cambio de turno autorizado"));
  });
});
