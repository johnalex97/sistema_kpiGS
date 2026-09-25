import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ClientDetail } from "../../models/client";
import { ClientForm } from "./ClientForm";

const client: ClientDetail = {
  id: "client-1", code: "CLI-001", tradeName: "Acme", legalName: null, taxId: null,
  phone: null, email: null, notes: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", version: 3, branches: [], contacts: [],
};

describe("ClientForm", () => {
  it("conserva los campos escritos al mostrar un conflicto y sólo adopta la versión tras confirmación", async () => {
    const onChange = vi.fn();
    const onAdopt = vi.fn();
    const values = { tradeName: "Borrador", legalName: null, taxId: null, phone: null, email: null, notes: null };
    render(<ClientForm client={client} draft={{ clientId: client.id, baseVersion: 3, values, conflict: { ...client, version: 9, tradeName: "Servidor" } }} pending={false} reviewPending={false} error="El cliente cambió en el servidor." reviewError={null} fieldErrors={[]} onChange={onChange} onSubmit={vi.fn()} onClose={vi.fn()} onReview={vi.fn()} onAdopt={onAdopt} />);
    expect(screen.getByRole("textbox", { name: "Nombre comercial" })).toHaveValue("Borrador");
    expect(screen.getByText(/Versión actual: 9/)).toBeInTheDocument();
    expect(screen.getByText(/Servidor/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Adoptar versión 9" }));
    expect(onAdopt).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Nombre comercial" })).toHaveValue("Borrador");
  });

  it("valida los campos antes del envío y conserva el borrador en error de RTN", async () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const values = { tradeName: "", legalName: null, taxId: "0801", phone: null, email: null, notes: null };
    const { rerender } = render(<ClientForm client={client} draft={{ clientId: client.id, baseVersion: 3, values, conflict: null }} pending={false} reviewPending={false} error="El RTN ya pertenece a otro cliente." reviewError={null} fieldErrors={[]} onChange={onChange} onSubmit={onSubmit} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Nombre comercial es obligatorio.")).toBeInTheDocument();
    rerender(<ClientForm client={client} draft={{ clientId: client.id, baseVersion: 3, values: { ...values, tradeName: "Mi borrador" }, conflict: null }} pending={false} reviewPending={false} error="El RTN ya pertenece a otro cliente." reviewError={null} fieldErrors={[]} onChange={onChange} onSubmit={onSubmit} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Nombre comercial" })).toHaveValue("Mi borrador");
  });
});
