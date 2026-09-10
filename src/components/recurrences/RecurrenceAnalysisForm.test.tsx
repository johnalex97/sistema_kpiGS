import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecurrenceCatalog, RecurrenceTechnician } from "../../models/recurrence";
import { RecurrenceAnalysisForm } from "./RecurrenceAnalysisForm";

const catalog: RecurrenceCatalog = {
  causes: [{ id: "11111111-1111-4111-8111-111111111111", code: "REWORK", name: "Retrabajo" }],
  states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
  impacts: ["LOW", "MEDIUM", "HIGH"],
  responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
  transitions: [],
};

const technicians: RecurrenceTechnician[] = [
  {
    technician: { id: "22222222-2222-4222-8222-222222222222", code: "TEC-001", fullName: "Ana López" },
    participation: "ORIGINAL_RESPONSIBLE",
    affectsQuality: false,
    justification: null,
  },
  {
    technician: { id: "33333333-3333-4333-8333-333333333333", code: "TEC-002", fullName: "Luis Rivera" },
    participation: "ORIGINAL_PARTICIPANT",
    affectsQuality: false,
    justification: null,
  },
];

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Causa"), catalog.causes[0].id);
  await user.selectOptions(screen.getByLabelText("Impacto"), "HIGH");
  await user.selectOptions(screen.getByLabelText("Responsabilidad"), "TECHNICAL_WORK");
  await user.type(screen.getByLabelText("Análisis técnico"), "  Diagnóstico de la instalación  ");
}

describe("RecurrenceAnalysisForm", () => {
  it("focuses each missing classification field and validates analysis length in form order", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    render(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByLabelText("Causa")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Causa"), catalog.causes[0].id);
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByLabelText("Impacto")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Impacto"), "LOW");
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByLabelText("Responsabilidad")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Responsabilidad"), "CLIENT");
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("al menos 3 caracteres");
    expect(screen.getByLabelText("Análisis técnico")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Análisis técnico"), { target: { value: "x".repeat(10_001) } });
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("10,000 caracteres");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits one normalized quality decision for every original technician", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    render(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText("Afecta calidad de Ana López"));
    await user.type(screen.getByLabelText("Justificación para Ana López"), "  Intervención original incompleta  ");
    await user.type(screen.getByLabelText("Costo estimado"), " 1250.50 ");
    await user.type(screen.getByLabelText("Razón del costo"), "  Reemplazo de conectores  ");
    await user.type(screen.getByLabelText("Motivo de antigüedad"), "  Caso detectado fuera del plazo  ");
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));

    expect(onSubmit).toHaveBeenCalledWith({
      causeId: catalog.causes[0].id,
      impact: "HIGH",
      responsibility: "TECHNICAL_WORK",
      analysis: "Diagnóstico de la instalación",
      qualityDecisions: [
        { technicianId: technicians[0].technician.id, affectsQuality: true, justification: "Intervención original incompleta" },
        { technicianId: technicians[1].technician.id, affectsQuality: false },
      ],
      estimatedCost: "1250.50",
      costReason: "Reemplazo de conectores",
      ageOverrideReason: "Caso detectado fuera del plazo",
    });
  });

  it("forces every decision to false without justification for non-technical responsibility", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    render(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText("Afecta calidad de Ana López"));
    await user.type(screen.getByLabelText("Justificación para Ana López"), "Trabajo incompleto");
    await user.selectOptions(screen.getByLabelText("Responsabilidad"), "EQUIPMENT");
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));

    expect(screen.getByLabelText("Afecta calidad de Ana López")).not.toBeChecked();
    expect(screen.getByLabelText("Justificación para Ana López")).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      responsibility: "EQUIPMENT",
      qualityDecisions: [
        { technicianId: technicians[0].technician.id, affectsQuality: false },
        { technicianId: technicians[1].technician.id, affectsQuality: false },
      ],
    }));
  });

  it("requires a justified affected technician for technical work and focuses the invalid field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    render(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Marca al menos un técnico");
    expect(screen.getByLabelText("Afecta calidad de Ana López")).toHaveFocus();

    await user.click(screen.getByLabelText("Afecta calidad de Ana López"));
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Justifica la afectación");
    expect(screen.getByLabelText("Justificación para Ana López")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Justificación para Ana López"), { target: { value: "x".repeat(1_001) } });
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1,000 caracteres");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validates paired decimal cost fields and optional text limits at their first invalid control", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    render(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText("Responsabilidad"), "EQUIPMENT");
    await user.type(screen.getByLabelText("Costo estimado"), "12.345");
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("formato válido");
    expect(screen.getByLabelText("Costo estimado")).toHaveFocus();

    await user.clear(screen.getByLabelText("Costo estimado"));
    await user.type(screen.getByLabelText("Costo estimado"), "12.30");
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("costo estimado y su razón");
    expect(screen.getByLabelText("Razón del costo")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Razón del costo"), { target: { value: "x".repeat(501) } });
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("razón del costo no puede superar 500 caracteres");

    await user.clear(screen.getByLabelText("Costo estimado"));
    await user.clear(screen.getByLabelText("Razón del costo"));
    fireEvent.change(screen.getByLabelText("Motivo de antigüedad"), { target: { value: "x".repeat(501) } });
    await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
    expect(screen.getByRole("alert")).toHaveTextContent("500 caracteres");
    expect(screen.getByLabelText("Motivo de antigüedad")).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks duplicate submit and keeps the dialog as a focus target while every control is pending", async () => {
    const user = userEvent.setup();
    let finish: ((value: boolean) => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const onCancel = vi.fn();
    render(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} onSubmit={onSubmit} onCancel={onCancel} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText("Afecta calidad de Ana López"));
    await user.type(screen.getByLabelText("Justificación para Ana López"), "Intervención incompleta");
    const form = screen.getByRole("dialog", { name: "Analizar caso" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(form).toHaveFocus();
    fireEvent.keyDown(form, { key: "Tab" });
    expect(form).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();

    finish?.(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar análisis" })).toBeEnabled());

    const close = screen.getByRole("button", { name: "Cerrar análisis" });
    const save = screen.getByRole("button", { name: "Guardar análisis" });
    save.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it("preserves the draft and reports a global API error without invalidating or focusing analysis", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => false);
    const rendered = render(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText("Afecta calidad de Ana López"));
    await user.type(screen.getByLabelText("Justificación para Ana López"), "Intervención incompleta");
    const save = screen.getByRole("button", { name: "Guardar análisis" });
    save.focus();

    rendered.rerender(<RecurrenceAnalysisForm catalog={catalog} originalTechnicians={technicians} apiError="El caso cambió en el servidor." submissionBlocked onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("Análisis técnico")).toHaveValue("  Diagnóstico de la instalación  ");
    expect(screen.getByLabelText("Análisis técnico")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Análisis técnico")).not.toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("El caso cambió en el servidor.");
    expect(save).toBeDisabled();
    fireEvent.submit(screen.getByRole("dialog", { name: "Analizar caso" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
