import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BranchListFilters, BranchPage, ClientBranch } from "../../models/client";
import type { AsyncState } from "../../hooks/useClientsWorkspace";
import { ClientBranches } from "./ClientBranches";

const branch: ClientBranch = { id: "branch-1", clientId: "client-1", code: "S-001", name: "Principal", address: "Colonia Palmira", city: "Tegucigalpa", region: "Francisco Morazán", country: "HN", lat: "14.0723", long: "-87.1921", locationReference: "Frente al parque", isActive: true, isEffectivelyActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 };
const filters: BranchListFilters = { page: 1, pageSize: 20, includeInactive: false };
const page = (items: ClientBranch[], current = 1, total = 1): BranchPage => ({ items, pagination: { page: current, pageSize: 20, totalItems: total, totalPages: total } });
const state = (data: BranchPage | null, status: AsyncState<BranchPage>["status"] = "success", error: string | null = null, stale = false): AsyncState<BranchPage> => ({ status, data, error, stale });

function show(props: Partial<Parameters<typeof ClientBranches>[0]> = {}) {
  const onChange = vi.fn();
  const onRetry = vi.fn(async () => {});
  const view = render(<ClientBranches clientActive filters={filters} branches={state(page([branch]))} onChange={onChange} onRetry={onRetry} {...props} />);
  return { onChange, onRetry, rerender: view.rerender };
}

describe("ClientBranches", () => {
  it("distingue estado interno y efectivo al desactivar el cliente", () => {
    show({ clientActive: false, branches: state(page([{ ...branch, isEffectivelyActive: false }])) });
    const card = screen.getByRole("article", { name: "Sucursal Principal" });
    expect(within(card).getByText("Estado interno: Activa")).toBeInTheDocument();
    expect(within(card).getByText("No disponible por cliente inactivo")).toBeInTheDocument();
    expect(within(card).queryByText("Estado interno: Inactiva")).not.toBeInTheDocument();
  });

  it("muestra identidad, dirección, referencia y vínculo seguro sólo con coordenadas finitas", () => {
    show({ branches: state(page([branch, { ...branch, id: "branch-2", name: "Sin mapa", lat: "NaN" }, { ...branch, id: "branch-3", name: "Incompleta", long: null }])) });
    const principal = screen.getByRole("article", { name: "Sucursal Principal" });
    expect(principal).toHaveTextContent("S-001");
    expect(principal).toHaveTextContent("Colonia Palmira");
    expect(principal).toHaveTextContent("Tegucigalpa");
    expect(principal).toHaveTextContent("Francisco Morazán");
    expect(principal).toHaveTextContent("Frente al parque");
    expect(principal).toHaveTextContent("14.0723, -87.1921");
    const link = within(principal).getByRole("link", { name: "Ver ubicación de Principal" });
    expect(link).toHaveAttribute("href", "https://www.google.com/maps?q=14.0723%2C-87.1921");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(within(screen.getByRole("article", { name: "Sucursal Sin mapa" })).queryByRole("link")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Sucursal Incompleta" })).queryByRole("link")).not.toBeInTheDocument();
  });

  it("envía búsqueda, ciudad, región, estado e inactivos por separado", async () => {
    const { onChange } = show();
    const user = userEvent.setup();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar sucursales" }), { target: { value: "Norte" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Ciudad" }), { target: { value: "Comayagua" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Región" }), { target: { value: "Central" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Estado de sucursal" }), "false");
    await user.click(screen.getByRole("checkbox", { name: "Incluir sucursales inactivas" }));
    expect(onChange).toHaveBeenCalledWith({ search: "Norte" });
    expect(onChange).toHaveBeenCalledWith({ city: "Comayagua" });
    expect(onChange).toHaveBeenCalledWith({ region: "Central" });
    expect(onChange).toHaveBeenCalledWith({ isActive: false });
    expect(onChange).toHaveBeenCalledWith({ includeInactive: true });
  });

  it("usa paginación devuelta por el servidor", async () => {
    const { onChange } = show({ branches: state(page([branch], 2, 3)) });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onChange).toHaveBeenNthCalledWith(1, { page: 1 });
    expect(onChange).toHaveBeenNthCalledWith(2, { page: 3 });
  });

  it("explica carga, vacío, error y stale con reintento", async () => {
    const { onRetry, rerender } = show({ branches: state(null, "loading") });
    expect(screen.getByRole("status")).toHaveTextContent("Cargando sucursales");
    rerender(<ClientBranches clientActive filters={filters} branches={state(page([]))} onChange={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByText("No hay sucursales para estos filtros")).toBeInTheDocument();
    rerender(<ClientBranches clientActive filters={filters} branches={state(null, "error", "Red inestable")} onChange={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Red inestable");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar sucursales" }));
    rerender(<ClientBranches clientActive filters={filters} branches={state(page([branch]), "error", "Red inestable", true)} onChange={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByRole("status")).toHaveTextContent("posiblemente desactualizadas");
    expect(screen.getByRole("article", { name: "Sucursal Principal" })).toBeInTheDocument();
  });
});
