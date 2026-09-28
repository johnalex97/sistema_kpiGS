import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BranchForm } from "./BranchForm";

const props = { mode: "create" as const, draft: { clientId: "client-1", baseVersion: null, branchId: null, values: { name: "Norte", address: "Centro", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null }, conflict: null }, pending: false, reviewPending: false, error: null, reviewError: null, versionConflict: false, fieldErrors: [], onChange: vi.fn(), onSubmit: vi.fn(), onClose: vi.fn(), onReview: vi.fn(), onAdopt: vi.fn() };

describe("BranchForm", () => {
  it("muestra todos los datos vigentes antes de adoptar sin sustituir el borrador", async () => {
    const conflict = {
      id: "branch-1", clientId: "client-1", code: "MAIN", name: "Servidor", address: "Avenida Central",
      city: "Comayagua", region: "Centro", country: "HN", lat: "14.5", long: "-87.6",
      locationReference: "Frente al parque", isActive: false, isEffectivelyActive: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", version: 9,
    };
    const onAdopt = vi.fn();
    render(<BranchForm {...props} mode="edit" draft={{ ...props.draft, branchId: conflict.id, baseVersion: 1,
      values: { ...props.draft.values, name: "Mi borrador", address: "Mi dirección" }, conflict }} onAdopt={onAdopt} />);
    const vigente = within(screen.getByRole("region", { name: "Estado vigente de la sucursal" }));
    for (const [label, value] of [
      ["Nombre", "Servidor"], ["Dirección", "Avenida Central"], ["Ciudad", "Comayagua"],
      ["Región", "Centro"], ["País", "HN"], ["Latitud", "14.5"], ["Longitud", "-87.6"],
      ["Referencia de ubicación", "Frente al parque"], ["Estado", "Inactiva"], ["Versión", "9"],
    ]) {
      expect(vigente.getByText(label)).toBeInTheDocument();
      expect(vigente.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Mi borrador");
    expect(screen.getByRole("textbox", { name: "Dirección" })).toHaveValue("Mi dirección");
    await userEvent.setup().click(vigente.getByRole("button", { name: "Adoptar versión 9" }));
    expect(onAdopt).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Mi borrador");
  });
  it("exige par de coordenadas y país HN antes de enviar", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const view = render(<BranchForm {...props} draft={{ ...props.draft, values: { ...props.draft.values, lat: "14.1" } }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Guardar sucursal" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Latitud y longitud deben registrarse juntas");
    expect(onSubmit).not.toHaveBeenCalled();
    view.rerender(<BranchForm {...props} draft={{ ...props.draft, values: { ...props.draft.values, country: "US" } }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Guardar sucursal" }));
    expect(screen.getByRole("alert")).toHaveTextContent("País debe ser HN");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
