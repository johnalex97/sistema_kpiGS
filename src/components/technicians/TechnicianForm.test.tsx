import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { TechnicianApi } from "../../api/technicians";
import type { CreateTechnicianInput, EligibleUserPage, Technician } from "../../models/technician";
import { EligibleUserCombobox } from "./EligibleUserCombobox";
import { TechnicianForm } from "./TechnicianForm";

const eligibleAna = { id: "user-1", displayName: "Ana López", email: "ana@geek.test" };
const eligibleBeto = { id: "user-2", displayName: "Beto Ruiz", email: "beto@geek.test" };
const pagination = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };

function api(overrides: Partial<TechnicianApi> = {}): TechnicianApi {
  return {
    list: vi.fn(), detail: vi.fn(),
    eligibleUsers: vi.fn(async () => ({ items: [eligibleAna], pagination })),
    create: vi.fn(), update: vi.fn(), changeStatus: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn(),
    ...overrides,
  } as TechnicianApi;
}

const technician: Technician = {
  id: "11111111-1111-4111-8111-111111111111", code: "TEC-001", fullName: "Ana López",
  specialty: "Redes", workPhone: "+504 9999-0000", workEmail: "ana@geek.test",
  status: "AVAILABLE", hiredOn: "2025-02-03", leftOn: null, user: eligibleAna,
  createdAt: "2025-02-03T14:00:00.000Z", updatedAt: "2026-08-27T15:30:00.000Z", version: 4,
};

afterEach(() => { vi.useRealTimers(); });

describe("EligibleUserCombobox", () => {
  it("espera el debounce, busca y permite seleccionar y limpiar", async () => {
    vi.useFakeTimers();
    const eligibleUsers = vi.fn(async () => ({ items: [eligibleAna], pagination }));
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<typeof eligibleAna | null>(null);
      return <EligibleUserCombobox api={api({ eligibleUsers })} value={value} onChange={(next) => { setValue(next); onChange(next); }} />;
    }
    render(<Harness />);

    await act(async () => undefined);
    expect(eligibleUsers).toHaveBeenCalledWith("", 1, undefined, expect.any(AbortSignal));
    eligibleUsers.mockClear();
    fireEvent.change(screen.getByRole("combobox", { name: "Usuario vinculado" }), { target: { value: "Ana" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(eligibleUsers).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(eligibleUsers).toHaveBeenCalledWith("Ana", 1, undefined, expect.any(AbortSignal));

    fireEvent.click(screen.getByRole("option", { name: "Ana López · ana@geek.test" }));
    expect(onChange).toHaveBeenCalledWith(eligibleAna);
    fireEvent.click(screen.getByRole("button", { name: "Quitar usuario vinculado" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("pagina sin perder resultados e incluye el técnico actual en edición", async () => {
    const eligibleUsers = vi.fn(async (_search: string, page: number): Promise<EligibleUserPage> => page === 1
      ? { items: [eligibleAna], pagination: { ...pagination, totalItems: 2, totalPages: 2 } }
      : { items: [eligibleBeto], pagination: { ...pagination, page: 2, totalItems: 2, totalPages: 2 } });
    render(<EligibleUserCombobox api={api({ eligibleUsers })} technicianId={technician.id} value={eligibleAna} onChange={vi.fn()} />);

    expect(await screen.findByRole("combobox", { name: "Usuario vinculado" })).toHaveValue("Ana López · ana@geek.test");
    fireEvent.focus(screen.getByRole("combobox", { name: "Usuario vinculado" }));
    expect(await screen.findByRole("option", { name: "Ana López · ana@geek.test" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cargar más usuarios" }));

    expect(await screen.findByRole("option", { name: "Beto Ruiz · beto@geek.test" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ana López · ana@geek.test" })).toBeInTheDocument();
    expect(eligibleUsers).toHaveBeenLastCalledWith("", 2, technician.id, expect.any(AbortSignal));
  });

  it("aborta al desmontar e ignora respuestas obsoletas", async () => {
    vi.useFakeTimers();
    const requests: Array<{ search: string; signal?: AbortSignal; resolve(value: EligibleUserPage): void }> = [];
    const eligibleUsers = vi.fn((search: string, _page: number, _technicianId?: string, signal?: AbortSignal) => new Promise<EligibleUserPage>((resolve) => requests.push({ search, signal, resolve })));
    const view = render(<EligibleUserCombobox api={api({ eligibleUsers })} value={null} onChange={vi.fn()} />);
    expect(requests[0]?.search).toBe("");
    fireEvent.change(screen.getByRole("combobox", { name: "Usuario vinculado" }), { target: { value: "Ana" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(requests[0]?.signal?.aborted).toBe(true);
    requests[1]?.resolve({ items: [eligibleAna], pagination });
    await act(async () => undefined);
    requests[0]?.resolve({ items: [eligibleBeto], pagination });
    await act(async () => undefined);
    expect(screen.queryByRole("option", { name: /Beto Ruiz/ })).not.toBeInTheDocument();

    view.unmount();
    expect(requests[1]?.signal?.aborted).toBe(true);
  });
});

describe("TechnicianForm", () => {
  it("normaliza y envía únicamente los campos laborales permitidos", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (value: CreateTechnicianInput) => Boolean(value.fullName));
    render(<TechnicianForm api={api()} onSubmit={onSubmit} onCancel={vi.fn()} now={() => new Date("2026-08-27T12:00:00-06:00")} />);

    await user.type(screen.getByLabelText("Nombre completo"), "  Ana López  ");
    await user.type(screen.getByLabelText("Correo laboral"), "ANA@GEEK.TEST");
    await user.click(screen.getByRole("button", { name: "Crear técnico" }));
    expect(onSubmit).toHaveBeenCalledWith({ fullName: "Ana López", specialty: null, workPhone: null, workEmail: "ana@geek.test", hiredOn: null, userId: null });
  });

  it.each([
    ["nombre vacío", "Nombre completo", "", "El nombre completo es obligatorio"],
    ["correo inválido", "Correo laboral", "correo", "Escribe un correo laboral válido"],
    ["fecha futura", "Fecha de ingreso", "2026-08-28", "La fecha de ingreso no puede estar en el futuro"],
  ])("rechaza %s", async (_case, label, value, message) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    render(<TechnicianForm api={api()} onSubmit={onSubmit} onCancel={vi.fn()} now={() => new Date("2026-08-27T12:00:00-06:00")} />);
    if (label !== "Nombre completo") await user.type(screen.getByLabelText("Nombre completo"), "Ana López");
    if (value) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "Crear técnico" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("declara máximos y preserva los valores al editar", async () => {
    render(<TechnicianForm variant="edit" technician={technician} api={api()} onSubmit={vi.fn(async () => true)} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Ana López");
    expect(screen.getByLabelText("Especialidad")).toHaveValue("Redes");
    expect(screen.getByLabelText("Teléfono laboral")).toHaveValue("+504 9999-0000");
    expect(screen.getByLabelText("Correo laboral")).toHaveValue("ana@geek.test");
    expect(screen.getByLabelText("Fecha de ingreso")).toHaveValue("2025-02-03");
    expect(screen.getByLabelText("Nombre completo")).toHaveAttribute("maxlength", "160");
    expect(screen.getByLabelText("Especialidad")).toHaveAttribute("maxlength", "120");
    expect(screen.getByLabelText("Teléfono laboral")).toHaveAttribute("maxlength", "30");
    expect(screen.getByLabelText("Correo laboral")).toHaveAttribute("maxlength", "254");
  });

  it("mantiene errores API, bloquea durante envío y respeta foco, Escape y trampa", async () => {
    const user = userEvent.setup();
    let finish: ((value: boolean) => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const onCancel = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const view = render(<TechnicianForm api={api()} apiError="El correo laboral ya está registrado." onSubmit={onSubmit} onCancel={onCancel} />);
    expect(screen.getByLabelText("Nombre completo")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("El correo laboral ya está registrado");
    screen.getByRole("button", { name: "Crear técnico" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cerrar formulario" })).toHaveFocus();
    await user.type(screen.getByLabelText("Nombre completo"), "Ana López");
    await user.click(screen.getByRole("button", { name: "Crear técnico" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    finish?.(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear técnico" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
