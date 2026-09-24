import { act, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrdersWorkspace } from "../hooks/useOrdersWorkspace";
import type { OrderDetail } from "../models/order";
import { OrdersPage } from "./OrdersPage";

function mobileDeclaration(selector: string): CSSStyleDeclaration {
  const mediaRules = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((candidate): candidate is CSSMediaRule => (
      "conditionText" in candidate && candidate.conditionText === "(max-width: 1023px)"
    ));
  const styleRule = mediaRules
    .flatMap((rule) => Array.from(rule.cssRules))
    .find((candidate): candidate is CSSStyleRule => (
      candidate instanceof CSSStyleRule
      && candidate.selectorText.split(",").map((item) => item.trim()).includes(selector)
    ));
  if (!styleRule) throw new Error(`No se encontró el selector móvil ${selector}`);
  return styleRule.style;
}

function mediaDeclaration(condition: string, selector: string): CSSStyleDeclaration {
  const mediaRule = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .find((candidate): candidate is CSSMediaRule => (
      "conditionText" in candidate && candidate.conditionText === condition
    ));
  const styleRule = mediaRule && Array.from(mediaRule.cssRules)
    .find((candidate): candidate is CSSStyleRule => (
      candidate instanceof CSSStyleRule && candidate.selectorText === selector
    ));
  if (!styleRule) throw new Error(`No se encontró ${selector} dentro de ${condition}`);
  return styleRule.style;
}

function applyMobileCascade(): HTMLStyleElement {
  const cssText = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((candidate): candidate is CSSMediaRule => (
      "conditionText" in candidate && candidate.conditionText === "(max-width: 1023px)"
    ))
    .flatMap((rule) => Array.from(rule.cssRules).map((nested) => nested.cssText))
    .join("\n");
  const style = document.createElement("style");
  style.dataset.testMobileCascade = "true";
  style.textContent = cssText;
  document.head.append(style);
  return style;
}

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
  it("residual A: Escape durante retiro pendiente conserva los dos diálogos y el foco", async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    let finishRemoval!: (result: boolean) => void;
    const removal = new Promise<boolean>((resolve) => { finishRemoval = resolve; });
    const closeDetail = vi.fn();
    function PendingRemovalPage() {
      const [pending, setPending] = useState(false);
      const [selected, setSelected] = useState(true);
      return <OrdersPage workspace={workspace({
        selectedOrderId: selected ? detail.id : null,
        detail: { status: "success", error: null, stale: false, data: { ...detail, materials: [{ id: "m1", material: { id: "m", code: "M", name: "Cable", unit: "m" }, quantity: "1", historicalUnitCost: "1", observation: null, createdAt: detail.createdAt }] } },
        material: { pending, error: null },
        closeDetail: () => { closeDetail(); setSelected(false); },
        removeMaterial: async () => { setPending(true); const result = await removal; setPending(false); return result; },
      })} />;
    }
    try {
      render(<PendingRemovalPage />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Materiales" }));
      const detailDialog = screen.getByRole("dialog", { name: /Detalle de/ });
      const trigger = screen.getByRole("button", { name: "Retirar Cable" });
      await user.click(trigger);
      await user.click(screen.getByRole("button", { name: "Confirmar retiro", hidden: true }));
      const dialog = screen.getByRole("dialog", { name: "Retirar material", hidden: true });
      expect(screen.getByRole("button", { name: "Confirmar retiro", hidden: true })).toBeDisabled();
      await user.keyboard("{Escape}");
      expect(closeDetail).not.toHaveBeenCalled();
      expect(detailDialog).toBeInTheDocument();
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveFocus();
      await user.tab();
      expect(dialog).toHaveFocus();
      await user.tab({ shift: true });
      expect(dialog).toHaveFocus();
      await act(async () => { finishRemoval(false); await removal; });
      await user.keyboard("{Escape}");
      expect(dialog).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(closeDetail).not.toHaveBeenCalled();
      await user.keyboard("{Escape}");
      expect(detailDialog).not.toBeInTheDocument();
      expect(closeDetail).toHaveBeenCalledOnce();
    } finally { Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth }); }
  });
  it("Escape en retiro de material móvil no cierra el detalle subyacente", async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      const state = workspace({ selectedOrderId: detail.id, detail: { status: "success", error: null, stale: false, data: { ...detail, materials: [{ id: "m1", material: { id: "m", code: "M", name: "Cable", unit: "m" }, quantity: "1", historicalUnitCost: "1", observation: null, createdAt: detail.createdAt }] } } });
      render(<OrdersPage workspace={state} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Materiales" }));
      await user.click(screen.getByRole("button", { name: "Retirar Cable" }));
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Retirar material" })).not.toBeInTheDocument();
      expect(state.closeDetail).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Retirar Cable" })).toHaveFocus();
    } finally { Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth }); }
  });
  it("muestra equipo histórico y resumen completo de una orden cerrada a lectores", async () => {
    const closed = { ...detail, status: "CANCELLED" as const, diagnosis: "Cable dañado", result: "Enlace restaurado", cancellationReason: "Cancelación solicitada", endedAt: "2026-09-16T16:00:00Z", totalMinutes: 60, participants: [{ id: "tech-old", code: "T0", fullName: "Técnico histórico", role: "SUPPORT" as const, active: false, assignedAt: "2026-09-16T12:00:00Z", unassignedAt: "2026-09-16T14:00:00Z" }] };
    render(<OrdersPage workspace={workspace({ capabilities: { ...workspace().capabilities, canManage: false }, selectedOrderId: closed.id, detail: { status: "success", data: closed, error: null, stale: false } })} />);
    expect(screen.getByText("Cable dañado")).toBeInTheDocument();
    expect(screen.getByText("Enlace restaurado")).toBeInTheDocument();
    expect(screen.getByText("Cancelación solicitada")).toBeInTheDocument();
    expect(screen.getByText("60 min reales")).toBeInTheDocument();
    expect(screen.getByText(/9:00/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Equipo" }));
    expect(screen.getByText("Técnico histórico")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retirar/ })).not.toBeInTheDocument();
  });

  it("muestra el error de catálogo y ofrece recuperación sin Nueva orden invisible", async () => {
    const state = workspace({ catalog: { status: "error", data: null, error: "Sin conexión", stale: false } });
    render(<OrdersPage workspace={state} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/catálogo/);
    expect(screen.getByRole("button", { name: "Nueva orden" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar catálogo" }));
    expect(state.refresh).toHaveBeenCalled();
  });

  it("representa filtros múltiples y limpia búsqueda y selección", async () => {
    const state = workspace({ filters: { page: 2, pageSize: 20, search: "OT", statuses: ["ASSIGNED", "PAUSED"], priorities: ["HIGH", "CRITICAL"] } });
    render(<OrdersPage workspace={state} />);
    expect(screen.getByLabelText("Estado")).toHaveValue(["ASSIGNED", "PAUSED"]);
    expect(screen.getByLabelText("Prioridad")).toHaveValue(["HIGH", "CRITICAL"]);
    for (const label of ["Filtrar cliente", "Filtrar sucursal", "Filtrar técnico", "Filtrar servicio", "Agenda desde", "Agenda hasta"]) expect(screen.getByLabelText(label)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Limpiar" }));
    expect(state.setFilters).toHaveBeenCalledWith(expect.objectContaining({ search: undefined, statuses: undefined, priorities: undefined }));
    expect(state.closeDetail).toHaveBeenCalled();
  });

  it("en móvil enfoca el detalle, aísla el fondo y restaura foco al cerrar", async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const state = workspace();
    const view = render(<OrdersPage workspace={state} />);
    const trigger = screen.getAllByRole("button", { name: /OT-2026-0042/ })[0];
    trigger.focus();
    view.rerender(<OrdersPage workspace={{ ...state, selectedOrderId: detail.id, detail: { status: "success", data: detail, error: null, stale: false } }} />);
    const dialog = screen.getByRole("dialog", { name: /Detalle/ });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(trigger.closest("[inert]")).not.toBeNull();
    await userEvent.setup().keyboard("{Escape}");
    expect(state.closeDetail).toHaveBeenCalled();
    view.rerender(<OrdersPage workspace={state} />);
    expect(trigger).toHaveFocus();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
  });
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

    await user.selectOptions(screen.getByRole("listbox", { name: "Estado" }), "PAUSED");
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

  it("keeps detail and assignments reachable in the mobile full-screen scroller", () => {
    render(<OrdersPage search="" workspace={workspace({
      selectedOrderId: detail.id,
      detail: { status: "success", data: detail, error: null, stale: false },
    })} />);

    const assignments = screen.getByRole("region", { name: "Administrar equipo" });
    const scroller = assignments.closest(".orders-register__detail");
    expect(scroller).toContainElement(assignments);

    const scrollerStyle = mobileDeclaration(".orders-register--detail .orders-register__detail");
    expect(scrollerStyle.position).toBe("fixed");
    expect(scrollerStyle.overflowY).toBe("auto");
    expect(scrollerStyle.overscrollBehaviorY).toBe("contain");

    const detailStyle = mobileDeclaration(".orders-register--detail .order-detail");
    expect(detailStyle.height).toBe("auto");
  });

  it("stacks the operational route and material usage without horizontal scrolling on mobile", async () => {
    const mobileStyle = applyMobileCascade();
    const user = userEvent.setup();
    const detailWithMaterial: OrderDetail = {
      ...detail,
      materials: [{
        id: "usage-1",
        material: { id: "material-1", code: "MAT-001", name: "Cable UTP", unit: "metro" },
        quantity: "2.125",
        historicalUnitCost: "18.75",
        observation: "Tramo reemplazado",
        createdAt: "2026-09-16T15:30:00.000Z",
      }],
    };

    try {
      render(<OrdersPage search="" workspace={workspace({
        selectedOrderId: detail.id,
        detail: { status: "success", data: detailWithMaterial, error: null, stale: false },
        catalog: {
          status: "success",
          data: {
            serviceTypes: [],
            materials: [{ id: "material-1", code: "MAT-001", name: "Cable UTP", unit: "metro", referenceCost: "18.75" }],
          },
          error: null,
          stale: false,
        },
      })} />);

      const route = screen.getByLabelText("Ruta operativa de la orden");
      const routeList = route.querySelector("ol") as HTMLOListElement;
      expect(getComputedStyle(route).overflowX).toBe("visible");
      expect(getComputedStyle(routeList).minWidth).toBe("0px");
      expect(getComputedStyle(routeList).gridTemplateColumns).toBe("1fr");

      await user.click(screen.getByRole("tab", { name: "Materiales" }));
      const table = screen.getByRole("table", { name: "Materiales registrados" });
      const wrapper = table.parentElement as HTMLElement;
      expect(getComputedStyle(wrapper).overflowX).toBe("visible");
      expect(getComputedStyle(table).minWidth).toBe("0px");
      expect(getComputedStyle(table).display).toBe("block");
      expect(within(table).getByRole("cell", { name: /Cable UTP/ })).toHaveAttribute("data-label", "Material");
      expect(within(table).getByRole("cell", { name: "2.125" })).toHaveAttribute("data-label", "Cantidad");
    } finally {
      mobileStyle.remove();
    }
  });

  it("stops the loading animation when reduced motion is requested", () => {
    expect(mediaDeclaration("(prefers-reduced-motion: reduce)", ".orders-state > span").animation).toBe("none");
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

  it("offers a manual retry when detail loading fails", async () => {
    const refreshDetail = vi.fn(async () => undefined);
    const state = workspace({
      selectedOrderId: detail.id,
      detail: { status: "error", data: null, error: "Servidor no disponible", stale: false },
      refreshDetail,
    });
    const user = userEvent.setup();
    render(<OrdersPage search="" workspace={state} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Servidor no disponible");
    await user.click(screen.getByRole("button", { name: "Reintentar detalle" }));

    expect(refreshDetail).toHaveBeenCalledOnce();
    expect(state.closeDetail).not.toHaveBeenCalled();
  });
});
