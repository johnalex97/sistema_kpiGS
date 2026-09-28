import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ClientBranch, ClientContact } from "../../models/client";
import { ContactForm, toContactInput } from "./ContactForm";

const branch = { id: "branch-1", clientId: "client-a", name: "Centro", isActive: true } as ClientBranch;
const values = { scope: "CLIENT" as const, branchId: "branch-1", fullName: " Ada ", position: " ", phone: "", email: " ", isPrimary: true };

describe("ContactForm", () => {
  it("omite branchId para CLIENT y normaliza textos", () => {
    expect(toContactInput(values)).toEqual({ scope: "CLIENT", fullName: "Ada", position: null, phone: null, email: null, isPrimary: true });
  });
  it("exige sucursal activa y del cliente para BRANCH", () => {
    expect(() => toContactInput({ ...values, scope: "BRANCH", branchId: "" }, [branch], "client-a")).toThrow();
    expect(() => toContactInput({ ...values, scope: "BRANCH", branchId: "branch-1" }, [{ ...branch, isActive: false }], "client-a")).toThrow();
    expect(() => toContactInput({ ...values, scope: "BRANCH", branchId: "branch-1" }, [branch], "client-b")).toThrow();
    expect(toContactInput({ ...values, scope: "BRANCH" }, [branch], "client-a")).toMatchObject({ scope: "BRANCH", branchId: "branch-1" });
  });
  it("advierte que principal reemplaza sólo al principal activo del ámbito", () => {
    render(<ContactForm mode="create" values={values} branches={[branch]} clientId="client-a" pending={false} error={null} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Este contacto reemplazará al principal activo del mismo ámbito.")).toBeVisible();
  });

  it.each([
    ["nombre vacío", { fullName: " " }, "Nombre completo"],
    ["nombre largo", { fullName: "a".repeat(161) }, "Nombre completo"],
    ["cargo largo", { position: "x".repeat(121) }, "Cargo"],
    ["teléfono largo", { phone: "1".repeat(31) }, "Teléfono"],
    ["correo largo", { email: `${"a".repeat(250)}@x.co` }, "Correo"],
    ["correo inválido", { email: "sin-arroba" }, "Correo"],
    ["ámbito inválido", { scope: "OTHER" as "CLIENT" }, "Ámbito"],
    ["sucursal inexistente", { scope: "BRANCH" as const, branchId: "other" }, "Sucursal"],
  ])("bloquea %s antes del envío y asocia error al campo", async (_name, patch, field) => {
    const onSubmit = vi.fn();
    render(<ContactForm mode="create" values={{ ...values, ...patch }} branches={[branch]} clientId="client-a" pending={false} error={null} onChange={vi.fn()} onSubmit={onSubmit} onClose={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar contacto" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const control = screen.getByLabelText(field);
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(control.getAttribute("aria-describedby")!)).toHaveAttribute("role", "alert");
  });

  it("asocia errores API a controles y muestra datos vigentes completos sin cambiar el borrador", () => {
    const current = { id: "contact-1", clientId: "client-a", branchId: branch.id, branchName: branch.name, scope: "BRANCH", fullName: "Nombre vigente", position: "Jefa", phone: "2222", email: "actual@example.com", isPrimary: false, isActive: false, version: 9 } as ClientContact;
    render(<ContactForm mode="edit" values={values} branches={[branch]} clientId="client-a" baseVersion={3} pending={false} error="Conflicto" fieldErrors={[{ field: "email", code: "VALIDATION_ERROR", message: "Correo rechazado" }]} conflict={current} versionConflict reviewPending={false} reviewError={null} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} onReview={vi.fn()} onAdopt={vi.fn()} />);
    const email = screen.getByLabelText("Correo");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(email.getAttribute("aria-describedby")!)).toHaveTextContent("Correo rechazado");
    const review = screen.getByRole("region", { name: "Estado vigente del contacto" });
    for (const value of ["Nombre vigente", "Jefa", "2222", "actual@example.com", "Sucursal", "Centro", "Inactivo", "No", "9"]) expect(review).toHaveTextContent(value);
    expect(screen.getByLabelText("Nombre completo")).toHaveValue(" Ada ");
    expect(screen.getByRole("button", { name: "Adoptar versión 9" })).toBeVisible();
  });
});
