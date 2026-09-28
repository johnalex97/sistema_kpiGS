import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientBranch } from "../../models/client";
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
});
