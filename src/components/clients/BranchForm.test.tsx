import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BranchForm } from "./BranchForm";

const props = { mode: "create" as const, draft: { clientId: "client-1", baseVersion: null, branchId: null, values: { name: "Norte", address: "Centro", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null }, conflict: null }, pending: false, reviewPending: false, error: null, reviewError: null, versionConflict: false, fieldErrors: [], onChange: vi.fn(), onSubmit: vi.fn(), onClose: vi.fn(), onReview: vi.fn(), onAdopt: vi.fn() };

describe("BranchForm", () => {
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
