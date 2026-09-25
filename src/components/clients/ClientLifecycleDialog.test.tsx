import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ClientDetail } from "../../models/client";
import { ClientLifecycleDialog } from "./ClientLifecycleDialog";

const client: ClientDetail = {
  id: "client-1", code: "CLI-001", tradeName: "Acme", legalName: null, taxId: null,
  phone: null, email: null, notes: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", version: 3, branches: [], contacts: [],
};

describe("ClientLifecycleDialog", () => {
  it.each(["123456789", "x".repeat(501)])("rechaza un motivo de longitud inválida", async (reason) => {
    const onSubmit = vi.fn();
    render(<ClientLifecycleDialog client={client} action="deactivate" baseVersion={3} reason={reason} pending={false} reviewPending={false} error={null} reviewError={null} conflict={null} onReasonChange={vi.fn()} onSubmit={onSubmit} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar desactivación" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("10 y 500");
  });

  it("muestra la consecuencia sin alterar el estado interno de hijos y conserva el motivo ante error", async () => {
    const onSubmit = vi.fn();
    const reason = "Cierre administrativo";
    render(<ClientLifecycleDialog client={client} action="deactivate" baseVersion={3} reason={reason} pending={false} reviewPending={false} error="El cliente tiene trabajo activo." reviewError={null} conflict={null} onReasonChange={vi.fn()} onSubmit={onSubmit} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    expect(screen.getByText(/sucursales y contactos/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Motivo" })).toHaveValue(reason);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar desactivación" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
