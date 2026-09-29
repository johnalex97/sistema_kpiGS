import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientWizard } from "./ClientWizard";
import { ClientDialogFrame } from "./ClientDialogFrame";

describe("marco de diálogos de Clientes", () => {
  it("montaje simultáneo anidado mantiene el hijo como único destino de Escape", () => {
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    render(<ClientDialogFrame open label="Padre" onClose={closeParent}>
      <button>Fondo del padre</button>
      <ClientDialogFrame open label="Hijo" onClose={closeChild}><button>Acción del hijo</button></ClientDialogFrame>
    </ClientDialogFrame>);
    expect(screen.getByRole("button", { name: "Acción del hijo" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(closeChild).toHaveBeenCalledOnce();
    expect(closeParent).not.toHaveBeenCalled();
  });
  it("pone foco inicial, aísla el fondo, contiene Tab y restaura al cerrar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Abrir";
    document.body.append(trigger);
    trigger.focus();
    const view = render(<ClientWizard pending={false} error={null} fieldErrors={[]} onSubmit={async () => {}} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Nuevo cliente" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(trigger).toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-hidden", "true");
    const first = within(dialog).getByLabelText("Nombre comercial *");
    const last = within(dialog).getByRole("button", { name: "Siguiente" });
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAttribute("inert");
    expect(trigger).not.toHaveAttribute("aria-hidden");
    trigger.remove();
  });

  it("pending mantiene un destino enfocable y consume Escape", () => {
    const onClose = vi.fn();
    render(<ClientWizard pending error={null} fieldErrors={[]} onSubmit={async () => {}} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Nuevo cliente" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });
});
