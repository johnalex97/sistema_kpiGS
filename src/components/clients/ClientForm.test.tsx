import { render, screen, within } from "@testing-library/react";
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

  it("muestra todos los datos vigentes separados del borrador antes de adoptar", () => {
    const current = { ...client, version: 9, tradeName: "Servidor", legalName: "Legal vigente", taxId: "08011999123456", phone: "2222-3333", email: "actual@empresa.test", notes: "Notas vigentes" };
    const values = { tradeName: "Borrador", legalName: "Legal borrador", taxId: "999", phone: null, email: null, notes: "Mis notas" };
    render(<ClientForm client={client} draft={{ clientId: client.id, baseVersion: 3, values, conflict: current }} pending={false} reviewPending={false} error="Conflicto de versión" reviewError={null} fieldErrors={[]} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    const review = within(screen.getByRole("region", { name: "Datos vigentes del cliente" }));
    expect(review.getByText("Servidor")).toBeInTheDocument();
    expect(review.getByText("Legal vigente")).toBeInTheDocument();
    expect(review.getByText("08011999123456")).toBeInTheDocument();
    expect(review.getByText("2222-3333")).toBeInTheDocument();
    expect(review.getByText("actual@empresa.test")).toBeInTheDocument();
    expect(review.getByText("Notas vigentes")).toBeInTheDocument();
    expect(review.getByText(/Versión actual: 9/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nombre comercial" })).toHaveValue("Borrador");
  });

  it("conserva la acción de revisar tras limpiar el resumen al escribir de nuevo", () => {
    render(<ClientForm client={client} draft={{ clientId: client.id, baseVersion: 3, values: { tradeName: "Borrador" }, conflict: null }} pending={false} reviewPending={false} versionConflict={true} error={null} reviewError={null} fieldErrors={[]} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Revisar versión vigente" })).toBeInTheDocument();
  });

  it("asocia validación local y API al campo editado", async () => {
    const base = { clientId: client.id, baseVersion: 3, values: { tradeName: "", taxId: "0801" }, conflict: null };
    const props = { client, draft: base, pending: false, reviewPending: false, error: null, reviewError: null, fieldErrors: [], onChange: vi.fn(), onSubmit: vi.fn(), onClose: vi.fn(), onReview: vi.fn(), onAdopt: vi.fn() };
    const view = render(<ClientForm {...props} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar cambios" }));
    const tradeName = screen.getByRole("textbox", { name: "Nombre comercial" });
    expect(tradeName).toHaveAttribute("aria-invalid", "true");
    expect(tradeName).toHaveAttribute("aria-describedby", "client-edit-tradeName-error");
    expect(document.getElementById("client-edit-tradeName-error")).toHaveTextContent("obligatorio");
    view.rerender(<ClientForm {...props} draft={{ ...base, values: { tradeName: "Borrador", taxId: "0801" } }} fieldErrors={[{ field: "taxId", code: "TAX_ID_ALREADY_EXISTS", message: "El RTN ya existe." }]} />);
    const taxId = screen.getByRole("textbox", { name: "RTN" });
    expect(taxId).toHaveAttribute("aria-invalid", "true");
    expect(taxId).toHaveAttribute("aria-describedby", "client-edit-taxId-error");
    expect(document.getElementById("client-edit-taxId-error")).toHaveTextContent("El RTN ya existe.");
  });
});
