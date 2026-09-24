import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrderLookupApi } from "../../api/order-lookups";
import type { ApiFieldError } from "../../api/http";
import type { OrderCatalog, OrderDetail } from "../../models/order";
import { OrderForm } from "./OrderForm";

const catalog: OrderCatalog = {
  serviceTypes: [{ id: "service-1", code: "SUPPORT", name: "Soporte técnico" }],
  materials: [],
};

const order: OrderDetail = {
  id: "order-1", orderNumber: "OT-2026-0001",
  client: { id: "client-1", code: "CLI-1", tradeName: "Farmacia Central" },
  branch: { id: "branch-1", code: "CENTRO", name: "Sucursal Centro" },
  serviceType: catalog.serviceTypes[0], priority: "HIGH", status: "ASSIGNED",
  reportedProblem: "Sin conectividad", description: "Falla intermitente",
  scheduledFor: "2026-09-16T14:30:00.000Z", estimatedMinutes: 90,
  primaryTechnician: null, supportCount: 0, overdue: false, startedAt: null,
  endedAt: null, totalMinutes: null, createdAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z", version: 4, diagnosis: null,
  result: null, cancellationReason: null, participants: [], materials: [],
};

function lookupApi(): OrderLookupApi {
  return {
    catalog: vi.fn(async () => catalog),
    clients: vi.fn(async () => ({
      items: [{ id: "client-1", code: "CLI-1", tradeName: "Farmacia Central" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    })),
    branches: vi.fn(async () => [{
      id: "branch-1", code: "CENTRO", name: "Sucursal Centro",
      address: "Centro", isEffectivelyActive: true,
    }]),
    technicians: vi.fn(),
  } as OrderLookupApi;
}

async function completeCreateForm(api: OrderLookupApi) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("searchbox", { name: "Cliente" }), "Farmacia");
  await waitFor(() => expect(api.clients).toHaveBeenCalled());
  await user.click(await screen.findByRole("option", { name: /Farmacia Central/ }));
  await waitFor(() => expect(api.branches).toHaveBeenCalledWith("client-1", expect.any(AbortSignal)));
  await user.selectOptions(screen.getByRole("combobox", { name: "Sucursal" }), "branch-1");
  await user.selectOptions(screen.getByRole("combobox", { name: "Tipo de servicio" }), "service-1");
  await user.type(screen.getByRole("textbox", { name: "Problema reportado" }), "Enlace sin servicio");
  return user;
}

describe("OrderForm", () => {
  it("conserva la sucursal al volver a elegir el cliente vigente", async () => {
    const api = lookupApi();
    render(<OrderForm mode="create" catalog={catalog} lookupApi={api} pending={false} error={null} fieldErrors={[]} onCancel={vi.fn()} onSubmit={vi.fn(async () => true)} />);
    const user = await completeCreateForm(api);
    await user.click(await screen.findByRole("option", { name: /Farmacia Central/ }));
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("branch-1");
    expect(screen.getByRole("option", { name: "Sucursal Centro" })).toBeInTheDocument();
  });
  it("exige revisar el conflicto sin sustituir el texto del borrador y conserva foco pendiente", async () => {
    const props = { mode: "edit" as const, order, catalog, lookupApi: lookupApi(), pending: false, error: null, fieldErrors: [], onCancel: vi.fn(), onSubmit: vi.fn(), onReviewConflict: vi.fn() };
    const view = render(<OrderForm {...props} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Descripción"));
    await user.type(screen.getByLabelText("Descripción"), "Mi borrador");
    view.rerender(<OrderForm {...props} conflict conflictOrder={{ ...order, version: 9, description: "Cambio ajeno" }} />);
    expect(screen.getByLabelText("Descripción")).toHaveValue("Mi borrador");
    expect(screen.getByText("Cambio ajeno")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Revisé la versión actual" }));
    expect(props.onReviewConflict).toHaveBeenCalled();
    view.rerender(<OrderForm {...props} pending />);
    await user.tab();
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement === dialog || dialog.contains(document.activeElement)).toBe(true);
  });
  it("descarta sucursales de A cuando B responde antes y cancela al perder permiso", async () => {
    const api = lookupApi();
    let resolveA!: (items: Awaited<ReturnType<OrderLookupApi["branches"]>>) => void;
    vi.mocked(api.clients).mockResolvedValue({ items: [order.client, { id: "client-2", code: "B", tradeName: "Cliente B" }], pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 } });
    vi.mocked(api.branches).mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; })).mockResolvedValue([{ id: "branch-2", code: "B", name: "Sucursal B", address: "", isEffectivelyActive: true }]);
    const cancel = vi.fn();
    const props = { mode: "create" as const, catalog, lookupApi: api, pending: false, error: null, fieldErrors: [], onCancel: cancel, onSubmit: vi.fn(async () => true) };
    const view = render(<OrderForm {...props} canLookupClients />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: "Cliente" }), "Cliente");
    await user.click(await screen.findByRole("option", { name: /Farmacia Central/ }));
    await user.clear(screen.getByRole("searchbox", { name: "Cliente" }));
    await user.type(screen.getByRole("searchbox", { name: "Cliente" }), "Cliente B");
    await user.click(await screen.findByRole("option", { name: /Cliente B/ }));
    expect(await screen.findByRole("option", { name: "Sucursal B" })).toBeInTheDocument();
    await act(async () => resolveA([{ id: "branch-1", code: "A", name: "Sucursal A", address: "", isEffectivelyActive: true }]));
    expect(screen.queryByRole("option", { name: "Sucursal A" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sucursal B" })).toBeInTheDocument();
    view.rerender(<OrderForm {...props} canLookupClients={false} />);
    expect(cancel).toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: "Sucursal B" })).not.toBeInTheDocument();
  });

  it("no consulta clientes sin permiso auxiliar", async () => {
    const api = lookupApi();
    render(<OrderForm mode="create" canLookupClients={false} catalog={catalog} lookupApi={api} pending={false} error={null} fieldErrors={[]} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole("searchbox", { name: "Cliente" })).toBeDisabled();
    expect(api.clients).not.toHaveBeenCalled();
  });
  it("resolves client branches and converts Honduras local time before create", async () => {
    const api = lookupApi();
    const onSubmit = vi.fn(async () => true);
    render(<OrderForm mode="create" catalog={catalog} lookupApi={api} pending={false} error={null} fieldErrors={[]} onCancel={vi.fn()} onSubmit={onSubmit} />);
    const user = await completeCreateForm(api);

    await user.type(screen.getByLabelText("Agenda"), "2026-09-16T08:30");
    await user.clear(screen.getByRole("spinbutton", { name: "Estimación en minutos" }));
    await user.type(screen.getByRole("spinbutton", { name: "Estimación en minutos" }), "90");
    await user.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      branchId: "branch-1", serviceTypeId: "service-1",
      scheduledFor: "2026-09-16T14:30:00.000Z", estimatedMinutes: 90,
    }));
  });

  it("clears the selected branch when the client changes", async () => {
    const api = lookupApi();
    vi.mocked(api.clients).mockResolvedValue({
      items: [
        { id: "client-1", code: "CLI-1", tradeName: "Farmacia Central" },
        { id: "client-2", code: "CLI-2", tradeName: "Clínica Norte" },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
    });
    vi.mocked(api.branches)
      .mockResolvedValueOnce([{ id: "branch-1", code: "CENTRO", name: "Sucursal Centro", address: "Centro", isEffectivelyActive: true }])
      .mockResolvedValueOnce([{ id: "branch-2", code: "NORTE", name: "Sucursal Norte", address: "Norte", isEffectivelyActive: true }]);
    render(<OrderForm mode="create" catalog={catalog} lookupApi={api} pending={false} error={null} fieldErrors={[]} onCancel={vi.fn()} onSubmit={vi.fn(async () => true)} />);
    const user = await completeCreateForm(api);

    await user.clear(screen.getByRole("searchbox", { name: "Cliente" }));
    await user.type(screen.getByRole("searchbox", { name: "Cliente" }), "Clínica");
    await user.click(await screen.findByRole("option", { name: /Clínica Norte/ }));

    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("");
    expect(api.branches).toHaveBeenLastCalledWith("client-2", expect.any(AbortSignal));
  });

  it("validates estimation and associates server errors with their field", async () => {
    const fieldErrors: ApiFieldError[] = [{ field: "reportedProblem", code: "INVALID", message: "Describe mejor el problema" }];
    const api = lookupApi();
    const onSubmit = vi.fn(async () => false);
    render(<OrderForm mode="create" catalog={catalog} lookupApi={api} pending={false} error="Revisa los datos" fieldErrors={fieldErrors} onCancel={vi.fn()} onSubmit={onSubmit} />);
    const user = await completeCreateForm(api);
    await user.clear(screen.getByRole("spinbutton", { name: "Estimación en minutos" }));
    await user.type(screen.getByRole("spinbutton", { name: "Estimación en minutos" }), "10081");
    await user.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("entre 1 y 10080");
    expect(screen.getByRole("textbox", { name: "Problema reportado" })).toHaveAttribute("aria-invalid", "true");
  });

  it("locks parent fields once an order is assigned", () => {
    render(<OrderForm mode="edit" order={order} catalog={catalog} lookupApi={lookupApi()} pending={false} error={null} fieldErrors={[]} onCancel={vi.fn()} onSubmit={vi.fn(async () => true)} />);

    expect(screen.getByRole("searchbox", { name: "Cliente" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Tipo de servicio" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Prioridad" })).toBeEnabled();
  });
});
