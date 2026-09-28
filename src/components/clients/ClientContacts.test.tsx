import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ClientBranch, ClientContact, ContactPage } from "../../models/client";
import { ClientContacts } from "./ClientContacts";

const branch: ClientBranch = { id: "branch-1", clientId: "client-a", code: "S-1", name: "Sucursal Principal", address: "Centro", city: null, region: null, country: "HN", lat: null, long: null, locationReference: null, isActive: true, isEffectivelyActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1 };
const base: ClientContact = { id: "contact-1", clientId: "client-a", branchId: null, scope: "CLIENT", branchName: null, fullName: "Ana General", position: "Gerente", phone: "+504 2222-3333", email: "ana@example.com", isPrimary: true, isActive: true, isEffectivelyActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1 };
const page = (items: ClientContact[]): ContactPage => ({ items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 } });
const filters = { page: 1, pageSize: 20, includeInactive: false };

describe("ClientContacts", () => {
  it("agrupa visualmente sin alterar el orden de cada grupo, expone principalidad y estado efectivo", () => {
    const items = [
      { ...base, id: "b1", scope: "BRANCH" as const, branchId: branch.id, branchName: branch.name, fullName: "Bea Primera", isPrimary: true },
      base,
      { ...base, id: "b2", scope: "BRANCH" as const, branchId: branch.id, branchName: branch.name, fullName: "Cora Segunda", isPrimary: false, phone: "javascript:alert(1)", email: "bad\n@example.com" },
    ];
    render(<ClientContacts clientActive={false} branches={[branch]} filters={filters} contacts={{ status: "success", data: page(items), error: null, stale: false }} onChange={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Contactos generales" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sucursal Principal" })).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Contacto Ana General" })).getByText("Principal general")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Contacto Bea Primera" })).getByText("Principal de sucursal")).toBeVisible();
    expect(screen.getAllByText("No disponible por cliente inactivo")).toHaveLength(3);
    expect(within(screen.getByRole("article", { name: "Contacto Ana General" })).getByText("Gerente")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Contacto Ana General" })).getByRole("link", { name: "ana@example.com" })).toHaveAttribute("href", "mailto:ana@example.com");
    expect(within(screen.getByRole("article", { name: "Contacto Ana General" })).getByRole("link", { name: "+504 2222-3333" })).toHaveAttribute("href", "tel:+50422223333");
    expect(screen.getByText("bad", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /javascript|bad/i })).not.toBeInTheDocument();
    const branchCards = within(screen.getByRole("region", { name: "Sucursal Principal" })).getAllByRole("article");
    expect(branchCards.map((card) => card.getAttribute("aria-label"))).toEqual(["Contacto Bea Primera", "Contacto Cora Segunda"]);
    expect(items.map((item) => item.id)).toEqual(["b1", "contact-1", "b2"]);
  });

  it("muestra carga, vacío, error, stale y reintento; filtros y paginación", async () => {
    const onChange = vi.fn();
    const onRetry = vi.fn();
    const props = { clientActive: true, branches: [branch], filters, onChange, onRetry };
    const view = render(<ClientContacts {...props} contacts={{ status: "loading", data: null, error: null, stale: false }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando contactos");
    view.rerender(<ClientContacts {...props} contacts={{ status: "success", data: page([]), error: null, stale: false }} />);
    expect(screen.getByText(/No hay contactos/)).toBeVisible();
    view.rerender(<ClientContacts {...props} contacts={{ status: "error", data: null, error: "Sin red", stale: false }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sin red");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar contactos" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const paged: ContactPage = { ...page([base]), pagination: { page: 2, pageSize: 20, totalItems: 41, totalPages: 3 } };
    view.rerender(<ClientContacts {...props} contacts={{ status: "error", data: paged, error: "Red inestable", stale: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent("posiblemente desactualizados");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Ámbito"), "BRANCH");
    await user.selectOptions(screen.getByLabelText("Sucursal"), branch.id);
    await user.type(screen.getByLabelText("Buscar contactos"), "Ana");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onChange).toHaveBeenCalledWith({ scope: "BRANCH" });
    expect(onChange).toHaveBeenCalledWith({ branchId: branch.id });
    expect(onChange).toHaveBeenCalledWith({ page: 3 });
  });

  it("prioriza estados actuales de cliente y sucursal frente al snapshot efectivo del contacto", () => {
    const item = { ...base, scope: "BRANCH" as const, branchId: branch.id, branchName: branch.name, isEffectivelyActive: false, email: "ana?bcc=x@example.com" };
    const view = render(<ClientContacts clientActive={true} branches={[{ ...branch, isEffectivelyActive: false }]} filters={filters} contacts={{ status: "success", data: page([item]), error: null, stale: false }} onChange={vi.fn()} onRetry={vi.fn()} />);
    const card = screen.getByRole("article", { name: "Contacto Ana General" });
    expect(within(card).getByText("Disponible")).toBeVisible();
    expect(within(card).queryByRole("link", { name: "ana?bcc=x@example.com" })).not.toBeInTheDocument();
    view.rerender(<ClientContacts clientActive={true} branches={[{ ...branch, isActive: false }]} filters={filters} contacts={{ status: "success", data: page([{ ...item, isEffectivelyActive: true }]), error: null, stale: false }} onChange={vi.fn()} onRetry={vi.fn()} />);
    expect(within(card).getByText("No disponible por sucursal inactiva")).toBeVisible();
  });
});
