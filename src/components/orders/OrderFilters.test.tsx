import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrderLookupApi } from "../../api/order-lookups";
import { ApiClientError } from "../../api/http";
import type { OrderFilters as Filters } from "../../models/order";
import { OrderFilters } from "./OrderFilters";

const pagination = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };
const catalog = { serviceTypes: [{ id: "service-1", code: "S", name: "Soporte" }], materials: [] };
function lookups(): OrderLookupApi {
  return {
    catalog: vi.fn().mockResolvedValue(catalog),
    clients: vi.fn().mockResolvedValue({ items: [{ id: "client-1", code: "C", tradeName: "Cliente Central" }], pagination }),
    branches: vi.fn().mockResolvedValue([{ id: "branch-1", code: "B", name: "Sucursal Central", address: "", isEffectivelyActive: true }]),
    technicians: vi.fn().mockResolvedValue({ items: [{ id: "tech-1", code: "T", fullName: "Ana López", status: "AVAILABLE" }], pagination }),
  };
}

describe("OrderFilters", () => {
  it("aplica cliente, sucursal, técnico, servicio y periodo hondureño", async () => {
    const api = lookups(); const changed = vi.fn();
    function Harness() {
      const [filters, setFilters] = useState<Filters>({ page: 1, pageSize: 20 });
      return <OrderFilters filters={filters} catalog={catalog} lookupApi={api} canLookupClients canLookupTechnicians onClearSelection={vi.fn()} onChange={(patch) => { changed(patch); setFilters((current) => ({ ...current, ...patch })); }} />;
    }
    render(<Harness />); const user = userEvent.setup();
    await user.type(screen.getByLabelText("Filtrar cliente"), "Central");
    await user.click(await screen.findByRole("option", { name: "Cliente Central" }));
    await user.selectOptions(screen.getByLabelText("Filtrar sucursal"), (await screen.findByRole("option", { name: "Sucursal Central" })).getAttribute("value")!);
    await user.type(screen.getByLabelText("Filtrar técnico"), "Ana");
    await user.click(await screen.findByRole("option", { name: "Ana López" }));
    await user.selectOptions(screen.getByLabelText("Filtrar servicio"), "service-1");
    fireEvent.change(screen.getByLabelText("Agenda desde"), { target: { value: "2026-09-23T08:30" } });
    fireEvent.change(screen.getByLabelText("Agenda hasta"), { target: { value: "2026-09-24T17:00" } });
    expect(changed.mock.calls.map(([patch]) => patch)).toEqual([
      { clientId: "client-1", branchId: undefined }, { branchId: "branch-1" }, { technicianId: "tech-1" }, { serviceTypeId: "service-1" },
      { scheduledFrom: "2026-09-23T08:30:00.000-06:00" }, { scheduledTo: "2026-09-24T17:00:00.000-06:00" },
    ]);
  });

  it("no consulta sin permiso y descarta respuestas tardías al revocarlo", async () => {
    const api = lookups();
    let resolve!: (value: Awaited<ReturnType<OrderLookupApi["clients"]>>) => void;
    vi.mocked(api.clients).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const props = { filters: { page: 1, pageSize: 20 }, catalog, lookupApi: api, canLookupClients: false, canLookupTechnicians: false, onChange: vi.fn(), onClearSelection: vi.fn() };
    const view = render(<OrderFilters {...props} />);
    expect(screen.getByLabelText("Filtrar cliente")).toBeDisabled();
    expect(screen.getByLabelText("Filtrar técnico")).toBeDisabled();
    expect(api.clients).not.toHaveBeenCalled(); expect(api.technicians).not.toHaveBeenCalled();
    view.rerender(<OrderFilters {...props} canLookupClients />);
    await userEvent.setup().type(screen.getByLabelText("Filtrar cliente"), "Central");
    await waitFor(() => expect(api.clients).toHaveBeenCalled());
    const signal = vi.mocked(api.clients).mock.calls[0][2]!;
    view.rerender(<OrderFilters {...props} />);
    await act(async () => resolve({ items: [{ id: "c", code: "C", tradeName: "Nombre privado" }], pagination }));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("Nombre privado")).not.toBeInTheDocument();
  });

  it("distingue 403 de una lista vacía y comunica invalidación", async () => {
    const api = lookups(); const invalidated = vi.fn();
    vi.mocked(api.technicians).mockRejectedValue(new ApiClientError(403, "FORBIDDEN", "No disponible"));
    render(<OrderFilters filters={{ page: 1, pageSize: 20 }} catalog={catalog} lookupApi={api} canLookupClients canLookupTechnicians onChange={vi.fn()} onClearSelection={vi.fn()} onLookupForbidden={invalidated} />);
    await userEvent.setup().type(screen.getByLabelText("Filtrar técnico"), "Ana");
    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible consultar técnico");
    expect(screen.getByLabelText("Filtrar técnico")).toBeDisabled();
    expect(invalidated).toHaveBeenCalledWith("technicians");
  });
});
