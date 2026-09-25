import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientWizard } from "./ClientWizard";

const setup = (overrides: Partial<React.ComponentProps<typeof ClientWizard>> = {}) => {
  const onSubmit = vi.fn(async () => {});
  const onClose = vi.fn();
  const user = userEvent.setup();
  const view = render(<ClientWizard pending={false} error={null} fieldErrors={[]} onSubmit={onSubmit} onClose={onClose} {...overrides} />);
  return { user, onSubmit, onClose, ...view };
};

async function reachBranch(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: /Nombre comercial/ }), " Acme ");
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
}

async function reachContact(user: ReturnType<typeof userEvent.setup>) {
  await reachBranch(user);
  await user.type(screen.getByRole("textbox", { name: /Nombre de la sucursal/ }), "Principal");
  await user.type(screen.getByRole("textbox", { name: /Dirección/ }), "Colonia Palmira");
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
}

describe("ClientWizard", () => {
  it("retiene el borrador entre pasos y no envía al navegar", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nombre comercial");
    await reachBranch(user);
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toContain("Nombre de la sucursal");
    await user.type(screen.getByRole("textbox", { name: /Nombre de la sucursal/ }), "Principal");
    await user.type(screen.getByRole("textbox", { name: /Dirección/ }), "Colonia Palmira");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByRole("textbox", { name: /Dirección/ })).toHaveValue("Colonia Palmira");
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByRole("textbox", { name: /Nombre comercial/ })).toHaveValue(" Acme ");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("envía un único payload atómico con normalización y contacto de sucursal", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByRole("textbox", { name: /Nombre comercial/ }), " Acme ");
    await user.type(screen.getByRole("textbox", { name: /Razón social/ }), "Acme Honduras");
    await user.type(screen.getByRole("textbox", { name: /RTN/ }), "0801-1999-000001");
    await user.type(screen.getByRole("textbox", { name: /Correo institucional/ }), "contacto@acme.test");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.type(screen.getByRole("textbox", { name: /Ciudad/ }), "Tegucigalpa");
    await user.type(screen.getByRole("textbox", { name: /Región/ }), "Francisco Morazán");
    await user.type(screen.getByRole("textbox", { name: /Latitud/ }), "14.0723");
    await user.type(screen.getByRole("textbox", { name: /Longitud/ }), "-87.1921");
    await user.type(screen.getByRole("textbox", { name: /Nombre de la sucursal/ }), "Principal");
    await user.type(screen.getByRole("textbox", { name: /Dirección/ }), "Colonia Palmira");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("checkbox", { name: /Agregar contacto principal/ }));
    await user.type(screen.getByRole("textbox", { name: /Nombre del contacto/ }), "Ada Reyes");
    await user.selectOptions(screen.getByRole("combobox", { name: /Ámbito/ }), "MAIN_BRANCH");
    await user.type(screen.getByRole("textbox", { name: /Cargo/ }), "Gerencia");
    await user.type(screen.getByRole("textbox", { name: /Teléfono del contacto/ }), "9999-0000");
    await user.type(screen.getByRole("textbox", { name: /Correo del contacto/ }), "ada@acme.test");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      tradeName: "Acme", legalName: "Acme Honduras", taxId: "0801-1999-000001", phone: null, email: "contacto@acme.test", notes: null,
      mainBranch: { name: "Principal", address: "Colonia Palmira", city: "Tegucigalpa", region: "Francisco Morazán", country: "HN", lat: "14.0723", long: "-87.1921", locationReference: null },
      primaryContact: { scope: "MAIN_BRANCH", fullName: "Ada Reyes", position: "Gerencia", phone: "9999-0000", email: "ada@acme.test" },
    });
  });

  it("omite contacto opcional y rechaza coordenadas incompletas o fuera de rango", async () => {
    const { user, onSubmit } = setup();
    await reachBranch(user);
    await user.type(screen.getByRole("textbox", { name: /Nombre de la sucursal/ }), "Principal");
    await user.type(screen.getByRole("textbox", { name: /Dirección/ }), "Palmira");
    await user.type(screen.getByRole("textbox", { name: /Latitud/ }), "91");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Latitud/);
    await user.clear(screen.getByRole("textbox", { name: "Latitud" }));
    await user.type(screen.getByRole("textbox", { name: /Longitud/ }), "-181");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Longitud/);
    await user.clear(screen.getByRole("textbox", { name: "Longitud" }));
    await user.type(screen.getByRole("textbox", { name: "Latitud" }), "14");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Latitud y longitud/);
    await user.clear(screen.getByRole("textbox", { name: "Latitud" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ primaryContact: undefined, mainBranch: expect.objectContaining({ lat: null, long: null, country: "HN" }) }));
  });

  it("exige datos y ámbito del contacto activado y admite ámbito general", async () => {
    const { user, onSubmit } = setup();
    await reachContact(user);
    await user.click(screen.getByRole("checkbox", { name: /Agregar contacto principal/ }));
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toContain("Nombre del contacto");
    await user.type(screen.getByRole("textbox", { name: /Nombre del contacto/ }), "Ana López");
    await user.selectOptions(screen.getByRole("combobox", { name: /Ámbito/ }), "CLIENT");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ primaryContact: expect.objectContaining({ scope: "CLIENT", fullName: "Ana López" }) }));
  });

  it("respeta límites públicos y valida correos de empresa y contacto", async () => {
    const { user, onSubmit } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre comercial/ }), { target: { value: "A".repeat(181) } });
    fireEvent.change(screen.getByRole("textbox", { name: /Correo institucional/ }), { target: { value: "sin-arroba" } });
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toMatch(/180 caracteres.*Correo institucional no tiene un formato válido/s);
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre comercial/ }), { target: { value: "A".repeat(180) } });
    fireEvent.change(screen.getByRole("textbox", { name: /Correo institucional/ }), { target: { value: "contacto@acme.test" } });
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre de la sucursal/ }), { target: { value: "B".repeat(161) } });
    await user.type(screen.getByRole("textbox", { name: /Dirección/ }), "Palmira");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("alert")).toHaveTextContent("160 caracteres");
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre de la sucursal/ }), { target: { value: "B".repeat(160) } });
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("checkbox", { name: /Agregar contacto principal/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre del contacto/ }), { target: { value: "C".repeat(161) } });
    await user.selectOptions(screen.getByRole("combobox", { name: /Ámbito/ }), "CLIENT");
    fireEvent.change(screen.getByRole("textbox", { name: /Correo del contacto/ }), { target: { value: "inválido" } });
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toMatch(/160 caracteres.*Correo del contacto no tiene un formato válido/s);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("bloquea navegación y doble envío durante pending; error de campo abre paso correspondiente sin borrar datos", async () => {
    const { user, onSubmit, onClose, rerender } = setup();
    await reachContact(user);
    rerender(<ClientWizard pending error={null} fieldErrors={[]} onSubmit={onSubmit} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Atrás" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Creando cliente…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    rerender(<ClientWizard pending={false} error="Corrige la sucursal" fieldErrors={[{ field: "mainBranch.address", code: "INVALID", message: "Dirección inválida" }]} onSubmit={onSubmit} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Sucursal principal" })).toBeInTheDocument();
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toContain("Dirección inválida");
    expect(within(screen.getByRole("form")).getByRole("textbox", { name: /Dirección/ })).toHaveValue("Colonia Palmira");
  });
});
