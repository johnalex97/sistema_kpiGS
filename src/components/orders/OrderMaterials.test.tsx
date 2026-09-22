import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrderCatalog, OrderDetail } from "../../models/order";
import { OrderMaterials } from "./OrderMaterials";
import ordersCss from "./orders.css?raw";

const catalog: OrderCatalog = {
  serviceTypes: [],
  materials: [
    { id: "material-1", code: "MAT-001", name: "Cable UTP", unit: "metro", referenceCost: "18.75" },
    { id: "material-2", code: "MAT-002", name: "Conector RJ45", unit: "unidad", referenceCost: "6.5" },
  ],
};

const order: OrderDetail = {
  id: "order-1", orderNumber: "OT-2026-0001",
  client: { id: "client-1", code: "CLI-1", tradeName: "Acme" },
  branch: { id: "branch-1", code: "MAIN", name: "Principal" },
  serviceType: { id: "service-1", code: "SUPPORT", name: "Soporte" },
  priority: "HIGH", status: "IN_PROGRESS", reportedProblem: "Sin red",
  scheduledFor: null, primaryTechnician: null, supportCount: 0, overdue: false,
  startedAt: null, endedAt: null, estimatedMinutes: 60, totalMinutes: null,
  createdAt: "2026-09-16T12:00:00.000Z", updatedAt: "2026-09-16T12:00:00.000Z",
  version: 4, description: null, diagnosis: null, result: null, cancellationReason: null,
  participants: [],
  materials: [{
    id: "usage-1", material: { id: "material-1", code: "MAT-001", name: "Cable UTP", unit: "metro" },
    quantity: "2.125", historicalUnitCost: "18.75", observation: "Tramo de reemplazo",
    createdAt: "2026-09-16T12:30:00.000Z",
  }],
};

function renderMaterials(overrides: Partial<ComponentProps<typeof OrderMaterials>> = {}) {
  const props: ComponentProps<typeof OrderMaterials> = {
    order,
    catalog,
    canManage: true,
    pending: false,
    error: null,
    onAdd: vi.fn(async () => true),
    onUpdate: vi.fn(async () => true),
    onRemove: vi.fn(async () => true),
    ...overrides,
  };
  return { ...render(<div className="orders-workspace"><OrderMaterials {...props} /></div>), props };
}

describe("OrderMaterials", () => {
  it("adds a positive quantity with up to three decimals and keeps the historical unit cost read-only", async () => {
    const onAdd = vi.fn(async () => true);
    const user = userEvent.setup();
    renderMaterials({ onAdd });

    expect(screen.getByText("L 18.75")).toBeInTheDocument();
    expect(screen.queryByText("L 39.84")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Material" }), "material-2");
    await user.type(screen.getByRole("textbox", { name: "Cantidad" }), "2.125");
    await user.type(screen.getAllByRole("textbox")[1]!, "Conector instalado");
    await user.click(screen.getByRole("button", { name: "Registrar material" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({
      materialId: "material-2", quantity: "2.125", observation: "Conector instalado",
    }));
  });

  it("edits a usage and sends removal only after confirmation", async () => {
    const onUpdate = vi.fn(async () => true);
    const onRemove = vi.fn(async () => true);
    const user = userEvent.setup();
    renderMaterials({ onUpdate, onRemove });

    await user.click(screen.getByRole("button", { name: "Editar Cable UTP" }));
    const editor = screen.getByRole("form", { name: "Editar material" });
    await user.clear(within(editor).getByRole("textbox", { name: "Cantidad" }));
    await user.type(within(editor).getByRole("textbox", { name: "Cantidad" }), "3.000");
    await user.clear(within(editor).getAllByRole("textbox")[1]!);
    await user.click(within(editor).getByRole("button", { name: "Guardar material" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("usage-1", {
      quantity: "3.000", observation: null,
    }));

    await user.click(screen.getByRole("button", { name: "Retirar Cable UTP" }));
    const dialog = screen.getByRole("dialog", { name: "Retirar material" });
    expect(onRemove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Confirmar retiro" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("usage-1"));
  });

  it("moves focus to the persistent materials heading after a successful removal", async () => {
    const user = userEvent.setup();
    const view = renderMaterials();

    await user.click(screen.getByRole("button", { name: "Retirar Cable UTP" }));
    await user.click(within(screen.getByRole("dialog", { name: "Retirar material" })).getByRole("button", { name: "Confirmar retiro" }));
    view.rerender(<div className="orders-workspace"><OrderMaterials
      {...view.props}
      order={{ ...order, materials: [] }}
    /></div>);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retirar material" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Materiales utilizados" })).toHaveFocus();
  });

  it("keeps keyboard focus inside the removal dialog while its controls are pending", async () => {
    const user = userEvent.setup();
    const view = renderMaterials();

    await user.click(screen.getByRole("button", { name: "Retirar Cable UTP" }));
    view.rerender(<div className="orders-workspace"><OrderMaterials {...view.props} pending /></div>);
    const dialog = screen.getByRole("dialog", { name: "Retirar material" });
    expect(within(dialog).getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(true);

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).toBeInTheDocument();

    view.rerender(<div className="orders-workspace"><OrderMaterials {...view.props} pending={false} /></div>);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Retirar Cable UTP" })).toHaveFocus();
  });

  it("keeps every rendered material control at least 44 CSS pixels tall", () => {
    renderMaterials();

    const controls = screen.getAllByRole("button").concat(
      screen.getAllByRole("combobox"),
      screen.getAllByRole("textbox"),
    );
    const style = document.createElement("style");
    style.textContent = ordersCss;
    document.head.append(style);
    try {
      for (const control of controls) {
        expect(Number.parseFloat(getComputedStyle(control).minHeight), control.getAttribute("aria-label") ?? control.textContent ?? control.tagName).toBeGreaterThanOrEqual(44);
      }
    } finally {
      style.remove();
    }
  });

  it("keeps closed orders and revoked material permission read-only", () => {
    const { rerender } = renderMaterials({ canManage: false });
    expect(screen.queryByRole("button", { name: "Registrar material" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar Cable UTP" })).not.toBeInTheDocument();

    rerender(<OrderMaterials
      order={{ ...order, status: "COMPLETED" }} catalog={catalog} canManage pending={false} error={null}
      onAdd={vi.fn(async () => true)} onUpdate={vi.fn(async () => true)} onRemove={vi.fn(async () => true)}
    />);
    expect(screen.queryByRole("button", { name: "Registrar material" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar Cable UTP" })).not.toBeInTheDocument();
  });
});
