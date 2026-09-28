import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ClientContact, ClientDetail } from "../../models/client";
import { ClientLifecycleDialog, ContactLifecycleDialog } from "./ClientLifecycleDialog";

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

  it("muestra nombre y estado vigentes antes de adoptar versión de lifecycle", () => {
    render(<ClientLifecycleDialog client={client} action="deactivate" baseVersion={3} reason="Cierre administrativo" pending={false} reviewPending={false} error="Conflicto de versión" reviewError={null} conflict={{ ...client, tradeName: "Nombre vigente", version: 9, isActive: false }} onReasonChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    const review = within(screen.getByRole("region", { name: "Estado vigente del cliente" }));
    expect(review.getByText("Nombre vigente")).toBeInTheDocument();
    expect(review.getByText("Inactivo")).toBeInTheDocument();
    expect(review.getByText(/Versión actual: 9/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Motivo" })).toHaveValue("Cierre administrativo");
  });

  it("asocia errores locales y API al motivo", async () => {
    const props = { client, action: "deactivate" as const, baseVersion: 3, reason: "corto", pending: false, reviewPending: false, error: null, reviewError: null, conflict: null, onReasonChange: vi.fn(), onSubmit: vi.fn(), onClose: vi.fn(), onReview: vi.fn(), onAdopt: vi.fn() };
    const view = render(<ClientLifecycleDialog {...props} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar desactivación" }));
    const reason = screen.getByRole("textbox", { name: "Motivo" });
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveAttribute("aria-describedby", "client-lifecycle-reason-error");
    expect(document.getElementById("client-lifecycle-reason-error")).toHaveTextContent("10 y 500");
    view.rerender(<ClientLifecycleDialog {...props} reason="Motivo documentado" fieldErrors={[{ field: "reason", code: "VALIDATION_ERROR", message: "Motivo inválido." }]} />);
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("client-lifecycle-reason-error")).toHaveTextContent("Motivo inválido.");
  });
});

describe("ContactLifecycleDialog", () => {
  const contact = { id: "contact-1", clientId: client.id, branchId: null, branchName: null, scope: "CLIENT", fullName: "Ana", position: "Jefa", phone: "2222", email: "ana@example.com", isPrimary: true, isActive: false, isEffectivelyActive: false, createdAt: client.createdAt, updatedAt: client.updatedAt, version: 3 } as ClientContact;
  const props = { contact, action: "reactivate" as const, baseVersion: 3, reason: "corto", pending: false, error: null, fieldErrors: [], onReasonChange: vi.fn(), onSubmit: vi.fn(), onClose: vi.fn() };

  it("asocia error local y API al motivo", async () => {
    const view = render(<ContactLifecycleDialog {...props} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar" }));
    const reason = screen.getByRole("textbox", { name: "Motivo" });
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveAttribute("aria-describedby", "contact-lifecycle-reason-error");
    expect(document.getElementById("contact-lifecycle-reason-error")).toHaveTextContent("10 y 500");
    view.rerender(<ContactLifecycleDialog {...props} reason="Motivo documentado" fieldErrors={[{ field: "reason", code: "VALIDATION_ERROR", message: "Motivo rechazado" }]} />);
    expect(document.getElementById("contact-lifecycle-reason-error")).toHaveTextContent("Motivo rechazado");
  });

  it("muestra conflicto vigente, motivo intacto y recuperación explícita; explica conflicto principal", () => {
    render(<ContactLifecycleDialog {...props} reason="Motivo documentado" error="Conflicto principal" versionConflict reviewPending={false} reviewError={null} conflict={{ ...contact, version: 9, fullName: "Nombre vigente", phone: "3333", isPrimary: false }} onReview={vi.fn()} onAdopt={vi.fn()} />);
    const review = screen.getByRole("region", { name: "Estado vigente del contacto" });
    for (const value of ["Nombre vigente", "Jefa", "3333", "ana@example.com", "General", "No", "Inactivo", "9"]) expect(review).toHaveTextContent(value);
    expect(screen.getByRole("textbox", { name: "Motivo" })).toHaveValue("Motivo documentado");
    expect(screen.getByRole("button", { name: "Adoptar versión 9" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Revisar versión vigente" })).toBeVisible();
    expect(screen.getByText(/desmarc|cambi/i)).toBeVisible();
  });
});
