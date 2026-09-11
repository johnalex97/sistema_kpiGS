import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecurrenceCatalog, RecurrenceDetail } from "../../models/recurrence";
import { RecurrenceAdjustmentForm } from "./RecurrenceAdjustmentForm";
import { RecurrenceDetail as RecurrenceDetailPanel } from "./RecurrenceDetail";
import { RecurrenceTerminalDialog } from "./RecurrenceTerminalDialog";

const catalog: RecurrenceCatalog = {
  causes: [{ id: "cause-1", code: "REWORK", name: "Retrabajo" }, { id: "cause-2", code: "CONFIG", name: "Configuración" }],
  states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
  impacts: ["LOW", "MEDIUM", "HIGH"],
  responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
  transitions: [],
};

const recurrence: RecurrenceDetail = {
  id: "11111111-1111-4111-8111-111111111111", recurrenceNumber: "RI-2026-0001", status: "CLOSED",
  impact: "HIGH", responsibility: "TECHNICAL_WORK", detectedProblem: "La conexión volvió a fallar",
  detectedAt: "2026-09-01T10:00:00.000Z", originalOrder: { id: "order-1", orderNumber: "OT-100" },
  cause: catalog.causes[0], additionalMinutes: 30, estimatedCost: "1500.00", visitCount: 1, noteCount: 1,
  createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-10T10:00:00.000Z", version: 7,
  analysis: "Conector mal terminado", correctiveAction: "Se reemplazó el conector", preventiveAction: "Verificar ponchado",
  observations: "Servicio estable", ageOverrideReason: null, dismissalReason: null, dismissedAt: null,
  closedAt: "2026-09-10T10:00:00.000Z", visits: [], notes: [], evidences: [],
  technicians: [
    { technician: { id: "tech-1", code: "T-01", fullName: "Ana López" }, participation: "ORIGINAL_RESPONSIBLE", affectsQuality: true, justification: "Terminación deficiente" },
    { technician: { id: "tech-2", code: "T-02", fullName: "Luis Pérez" }, participation: "ORIGINAL_PARTICIPANT", affectsQuality: false, justification: null },
  ],
};

describe("acciones terminales de reincidencias", () => {
  it("exige un motivo documentado para descartar y conserva el borrador ante rechazo", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(false);
    render(<RecurrenceTerminalDialog action="dismiss" recurrenceNumber={recurrence.recurrenceNumber} apiError="El caso cambió en el servidor." onConfirm={onConfirm} onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Descartar caso" });
    expect(within(dialog).getByText(recurrence.recurrenceNumber)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Motivo del descarte"), "corto");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar descarte" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).getAllByRole("alert")[0]).toHaveTextContent("10");
    const reason = "No corresponde a una reincidencia técnica";
    await user.clear(within(dialog).getByLabelText("Motivo del descarte"));
    await user.type(within(dialog).getByLabelText("Motivo del descarte"), reason);
    await user.click(within(dialog).getByRole("button", { name: "Confirmar descarte" }));
    expect(onConfirm).toHaveBeenCalledWith(reason);
    expect(within(dialog).getByLabelText("Motivo del descarte")).toHaveValue(reason);
  });

  it("confirma el cierre sin solicitar motivo y bloquea doble envío", async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onConfirm = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    render(<RecurrenceTerminalDialog action="close" recurrenceNumber={recurrence.recurrenceNumber} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Cerrar caso" });
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Confirmar cierre" });
    await user.click(confirm);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("aria-busy", "true");
    resolve(true);
  });

  it("precarga el ajuste y envía sólo campos modificados junto con el motivo", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<RecurrenceAdjustmentForm recurrence={recurrence} catalog={catalog} onSubmit={onSubmit} onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Ajustar caso cerrado" });
    expect(within(dialog).getByLabelText("Análisis técnico")).toHaveValue(recurrence.analysis);
    expect(within(dialog).getByLabelText("Costo estimado")).toHaveValue("1500.00");
    await user.type(within(dialog).getByLabelText("Motivo del ajuste"), "Corrección posterior autorizada");
    await user.clear(within(dialog).getByLabelText("Observaciones"));
    await user.type(within(dialog).getByLabelText("Observaciones"), "Lectura validada por supervisión");
    await user.click(within(dialog).getByRole("button", { name: "Guardar ajuste" }));
    expect(onSubmit).toHaveBeenCalledWith({ reason: "Corrección posterior autorizada", observations: "Lectura validada por supervisión" });
  });

  it("envía la decisión completa de calidad cuando cambia la responsabilidad", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<RecurrenceAdjustmentForm recurrence={recurrence} catalog={catalog} onSubmit={onSubmit} onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Ajustar caso cerrado" });
    await user.type(within(dialog).getByLabelText("Motivo del ajuste"), "Clasificación corregida por auditoría");
    await user.selectOptions(within(dialog).getByLabelText("Responsabilidad"), "EQUIPMENT");
    await user.click(within(dialog).getByRole("button", { name: "Guardar ajuste" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reason: "Clasificación corregida por auditoría", responsibility: "EQUIPMENT",
      qualityDecisions: [{ technicianId: "tech-1", affectsQuality: false }, { technicianId: "tech-2", affectsQuality: false }],
    });
  });

  it("oculta por completo descarte, cierre y ajuste sin permiso de revisión", () => {
    render(<RecurrenceDetailPanel recurrence={recurrence} capabilities={{ canReport: false, canReview: false, canAddNote: false, canViewAll: false, canUploadEvidence: false, canViewEvidence: false, canManageEvidence: false, lookupCapabilities: { orders: false, technicians: false, clients: false, branches: false } }} onClose={vi.fn()} onDismiss={vi.fn()} onCloseCase={vi.fn()} onAdjust={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Descartar caso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar caso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajustar caso" })).not.toBeInTheDocument();
  });
});
