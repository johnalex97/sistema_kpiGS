import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
import type { OrderLookup } from "../../models/order-lookup";
import { RecurrenceCorrectionForm } from "./RecurrenceCorrectionForm";
import { RecurrenceNoteForm } from "./RecurrenceNoteForm";
import { RecurrenceVisitForm } from "./RecurrenceVisitForm";
import "../../styles.css";

const original: OrderLookup = {
  id: "order-original",
  orderNumber: "OT-100",
  clientName: "Hospital Norte",
  branchName: "Central",
  status: "COMPLETED",
};
const existingVisit: OrderLookup = {
  id: "order-existing",
  orderNumber: "OT-200",
  clientName: "Hospital Norte",
  branchName: "Central",
  status: "COMPLETED",
};
const availableVisit: OrderLookup = {
  id: "order-available",
  orderNumber: "OT-300",
  clientName: "Hospital Norte",
  branchName: "Central",
  status: "COMPLETED",
};

function lookupApi(): RecurrenceLookupApi {
  return {
    orders: vi.fn().mockResolvedValue({
      items: [original, existingVisit, availableVisit],
      pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 },
    }),
    technicians: vi.fn(),
    clients: vi.fn(),
    branches: vi.fn(),
  };
}

describe("formularios del flujo de reincidencias", () => {
  it("normaliza acciones y exige enviar costo con su razón", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<RecurrenceCorrectionForm apiError={null} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Acción correctiva"), "  Reemplazar conector y certificar enlace  ");
    await user.type(screen.getByLabelText("Acción preventiva"), "  Verificar conectores en mantenimiento  ");
    await user.type(screen.getByLabelText("Costo estimado"), "1250.50");
    await user.click(screen.getByRole("button", { name: "Iniciar corrección" }));

    expect(screen.getByRole("alert")).toHaveTextContent("costo estimado y su razón");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Razón del costo"), "  Repuesto y traslado extraordinario  ");
    await user.click(screen.getByRole("button", { name: "Iniciar corrección" }));

    expect(onSubmit).toHaveBeenCalledWith({
      correctiveAction: "Reemplazar conector y certificar enlace",
      preventiveAction: "Verificar conectores en mantenimiento",
      estimatedCost: "1250.50",
      costReason: "Repuesto y traslado extraordinario",
    });
  });

  it("excluye la orden original y visitas existentes, y omite una observación vacía", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<RecurrenceVisitForm
      lookupApi={lookupApi()}
      excludedOrderIds={[original.id, existingVisit.id]}
      apiError={null}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />);

    await user.click(screen.getByRole("combobox", { name: "Orden de la visita" }));
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    expect(within(options[0]).getByText("OT-300")).toBeInTheDocument();
    await user.click(options[0]);
    await user.type(screen.getByLabelText("Observación"), "   ");
    await user.click(screen.getByRole("button", { name: "Agregar visita" }));

    expect(onSubmit).toHaveBeenCalledWith({ orderId: availableVisit.id });
  });

  it("permite limpiar campos opcionales al actualizar una corrección existente", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<RecurrenceCorrectionForm
      updating
      initialValue={{ correctiveAction: "Reemplazar conector", preventiveAction: "Inspección mensual", observations: "Monitorear" }}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />);

    await user.clear(screen.getByLabelText("Acción preventiva"));
    await user.clear(screen.getByLabelText("Observaciones"));
    await user.click(screen.getByRole("button", { name: "Actualizar corrección" }));

    expect(onSubmit).toHaveBeenCalledWith({
      correctiveAction: "Reemplazar conector",
      preventiveAction: null,
      observations: null,
    });
  });

  it("limpia una orden que pasa a estar excluida después de refrescar el detalle", async () => {
    const user = userEvent.setup();
    const props = { lookupApi: lookupApi(), apiError: null, onCancel: vi.fn(), onSubmit: vi.fn().mockResolvedValue(true) };
    const rendered = render(<RecurrenceVisitForm {...props} excludedOrderIds={[original.id, existingVisit.id]} />);
    const combobox = screen.getByRole("combobox", { name: "Orden de la visita" });
    await user.click(combobox);
    await user.click(await screen.findByRole("option", { name: /OT-300/ }));
    expect(combobox).toHaveValue("OT-300 · Hospital Norte · Central");

    await act(async () => {
      rendered.rerender(<RecurrenceVisitForm {...props} excludedOrderIds={[original.id, existingVisit.id, availableVisit.id]} />);
      await Promise.resolve();
    });

    await waitFor(() => expect(combobox).toHaveValue(""));
  });

  it("agrega una nota normalizada sin inventar versión y bloquea el doble envío", async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onSubmit = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    render(<RecurrenceNoteForm apiError={null} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Nota"), "  Cliente confirma estabilidad durante 24 horas  ");
    const submit = screen.getByRole("button", { name: "Agregar nota" });
    await user.click(submit);
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ content: "Cliente confirma estabilidad durante 24 horas" });
    await act(async () => resolve(true));
  });

  it("mantiene el diálogo desplazable y los controles táctiles dentro del lenguaje visual operativo", () => {
    render(<RecurrenceCorrectionForm apiError={null} onCancel={vi.fn()} onSubmit={vi.fn().mockResolvedValue(true)} />);

    const dialog = screen.getByRole("dialog", { name: "Iniciar corrección" });
    expect(getComputedStyle(dialog).scrollPaddingBlock).toBe("96px 76px");
    expect(getComputedStyle(screen.getByRole("button", { name: "Cancelar" })).minHeight).toBe("44px");
    expect(getComputedStyle(screen.getByLabelText("Acción correctiva")).minHeight).toBe("44px");
  });
});
