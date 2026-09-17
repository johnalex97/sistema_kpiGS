import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrdersWorkspace } from "../hooks/useOrdersWorkspace";
import type { OrderDetail } from "../models/order";
import { OrdersPage } from "./OrdersPage";

const detail: OrderDetail = {
  id: "order-1",
  orderNumber: "OT-2026-0042",
  client: { id: "client-1", code: "CLI-1", tradeName: "Farmacia Central" },
  branch: { id: "branch-1", code: "TGU", name: "Sucursal Centro" },
  serviceType: { id: "service-1", code: "SUPPORT", name: "Soporte técnico" },
  priority: "HIGH",
  status: "IN_PROGRESS",
  reportedProblem: "Pérdida intermitente de conexión",
  scheduledFor: "2026-09-16T14:00:00.000Z",
  primaryTechnician: { id: "tech-1", code: "TEC-1", fullName: "Ana López" },
  supportCount: 1,
  overdue: true,
  startedAt: "2026-09-16T15:00:00.000Z",
  endedAt: null,
  estimatedMinutes: 90,
  totalMinutes: null,
  createdAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T15:00:00.000Z",
  version: 3,
  description: "Revisar enlace principal",
  diagnosis: null,
  result: null,
  cancellationReason: null,
  participants: [],
  materials: [],
};

function workspace(
  overrides: Partial<OrdersWorkspace> = {},
): OrdersWorkspace {
  return {
    filters: { page: 1, pageSize: 20 },
    selectedOrderId: null,
    capabilities: {
      canView: true,
      canViewAll: true,
      canManage: true,
      canOperateOwn: false,
      canLookupClients: true,
      canLookupTechnicians: true,
      canViewEvidence: true,
      canUploadEvidence: true,
      canManageEvidence: true,
    },
    currentTechnicianId: null,
    list: {
      status: "success",
      data: {
        items: [detail],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      error: null,
      stale: false,
    },
    detail: { status: "idle", data: null, error: null, stale: false },
    catalog: { status: "success", data: { serviceTypes: [], materials: [] }, error: null, stale: false },
    history: { status: "idle", data: null, error: null, stale: false },
    form: null,
    assignment: { pending: false, error: null },
    material: { pending: false, error: null },
    action: { pending: false, error: null, dialog: null, targetOrderId: null, targetVersion: null },
    setFilters: vi.fn(),
    setPage: vi.fn(),
    selectOrder: vi.fn(),
    closeDetail: vi.fn(),
    refreshList: vi.fn(),
    refreshDetail: vi.fn(),
    refresh: vi.fn(),
    loadHistory: vi.fn(),
    openCreate: vi.fn(),
    openEdit: vi.fn(),
    closeForm: vi.fn(),
    submitOrder: vi.fn(),
    assignTechnician: vi.fn(),
    unassignTechnician: vi.fn(),
    addMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    removeMaterial: vi.fn(),
    openOrderAction: vi.fn(),
    closeOrderAction: vi.fn(),
    executeOrderAction: vi.fn(),
    ...overrides,
  };
}

describe("OrdersPage", () => {
  it("opens creation only through the management capability", async () => {
    const state = workspace();
    const user = userEvent.setup();
    render(<OrdersPage search="" workspace={state} />);
    await user.click(screen.getByRole("button", { name: "Nueva orden" }));
    expect(state.openCreate).toHaveBeenCalledOnce();
  });

  it("does not expose team management without ORDERS_MANAGE", () => {
    render(<OrdersPage search="" workspace={workspace({
      capabilities: { ...workspace().capabilities, canManage: false },
      selectedOrderId: detail.id,
      detail: { status: "success", data: detail, error: null, stale: false },
    })} />);
    expect(screen.queryByRole("region", { name: "Administrar equipo" })).not.toBeInTheDocument();
  });
  it("shows only valid owned operations and opens their specific dialog", async () => {
    const state = workspace({
      capabilities: { ...workspace().capabilities, canManage: false, canOperateOwn: true },
      currentTechnicianId: "tech-1",
      selectedOrderId: detail.id,
      detail: { status: "success", data: detail, error: null, stale: false },
    });
    const user = userEvent.setup();
    render(<OrdersPage search="" workspace={state} />);
    expect(screen.getByRole("button", { name: "Finalizar orden" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar trabajo" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar orden" }));
    expect(state.openOrderAction).toHaveBeenCalledWith("complete");
  });

  it("renders the requested action dialog with the current order", () => {
    render(<OrdersPage search="" workspace={workspace({
      currentTechnicianId: "tech-1",
      selectedOrderId: detail.id,
      detail: { status: "success", data: detail, error: null, stale: false },
      action: { pending: false, error: null, dialog: "complete", targetOrderId: detail.id, targetVersion: detail.version },
    })} />);
    expect(screen.getByRole("dialog", { name: "Finalizar orden" })).toBeInTheDocument();
  });
  it("shows errors from direct operational actions without requiring a dialog", () => {
    render(<OrdersPage search="" workspace={workspace({
      capabilities: { ...workspace().capabilities, canManage: false, canOperateOwn: true },
      currentTechnicianId: "tech-1",
      selectedOrderId: detail.id,
      detail: { status: "success", data: detail, error: null, stale: false },
      action: { pending: false, error: "No fue posible iniciar el trabajo", dialog: null, targetOrderId: null, targetVersion: null },
    })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No fue posible iniciar el trabajo");
  });
  it("renders the dense list, mobile cards and an explicit overdue signal", () => {
    render(<OrdersPage search="" workspace={workspace()} />);

    expect(screen.getByRole("table", { name: "Órdenes de trabajo" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Órdenes de trabajo en móvil", {
      selector: "[role='list']",
    }))
      .toBeInTheDocument();
    expect(screen.getAllByText("OT-2026-0042")).toHaveLength(2);
    expect(screen.getAllByText("Atrasada").length).toBeGreaterThan(0);
  });

  it("applies status filters and opens an order from the real row control", async () => {
    const state = workspace();
    const user = userEvent.setup();
    render(<OrdersPage search="" workspace={state} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "PAUSED");
    await user.click(screen.getByRole("button", { name: "Abrir OT-2026-0042" }));

    expect(state.setFilters).toHaveBeenCalledWith({ statuses: ["PAUSED"] });
    expect(state.selectOrder).toHaveBeenCalledWith("order-1");
  });

  it("shows the operational route and selected detail", () => {
    render(<OrdersPage search="" workspace={workspace({
      selectedOrderId: detail.id,
      detail: { status: "success", data: detail, error: null, stale: false },
    })} />);

    expect(screen.getByRole("heading", { name: "OT-2026-0042" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Ruta operativa de la orden"))
      .toBeInTheDocument();
    expect(screen.getByText("En progreso", { selector: "[aria-current='step']" }))
      .toBeInTheDocument();
    expect(screen.getByText("Versión 3")).toBeInTheDocument();
  });

  it("gives actionable empty and error states", async () => {
    const retry = vi.fn();
    const state = workspace({
      list: { status: "error", data: null, error: "Servidor no disponible", stale: false },
      refreshList: retry,
    });
    const user = userEvent.setup();
    const view = render(<OrdersPage search="" workspace={state} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Servidor no disponible");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);

    view.rerender(<OrdersPage search="" workspace={workspace({
      list: {
        status: "success",
        data: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } },
        error: null,
        stale: false,
      },
    })} />);
    expect(screen.getByText("No hay órdenes para estos filtros")).toBeInTheDocument();
  });
});
