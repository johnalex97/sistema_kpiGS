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

  it("reinicia la misma búsqueda si una edición intermedia abortó su solicitud", async () => {
    vi.useFakeTimers();
    const requests: Array<{ search: string; signal?: AbortSignal; resolve(value: EligibleUserPage): void }> = [];
    const eligibleUsers = vi.fn((search: string, _page: number, _technicianId?: string, signal?: AbortSignal) => new Promise<EligibleUserPage>((resolve) => requests.push({ search, signal, resolve })));
    render(<EligibleUserCombobox api={api({ eligibleUsers })} value={null} onChange={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Usuario vinculado" }), { target: { value: "Ana" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(requests[requests.length - 1]?.search).toBe("Ana");
    fireEvent.change(screen.getByRole("combobox", { name: "Usuario vinculado" }), { target: { value: "Ana x" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Usuario vinculado" }), { target: { value: "Ana" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(eligibleUsers).toHaveBeenCalledTimes(3);
    expect(requests[requests.length - 1]?.search).toBe("Ana");
    requests[requests.length - 1]?.resolve({ items: [], pagination: { ...pagination, totalItems: 0, totalPages: 0 } });
    await act(async () => undefined);
    expect(screen.getByText("No hay usuarios elegibles para esta búsqueda.")).toBeInTheDocument();
  });

  it("vuelve a cargar al limpiar una selección durante la primera solicitud", async () => {
    vi.useFakeTimers();
    const requests: Array<{ signal?: AbortSignal; resolve(value: EligibleUserPage): void }> = [];
    const eligibleUsers = vi.fn((_search: string, _page: number, _technicianId?: string, signal?: AbortSignal) => new Promise<EligibleUserPage>((resolve) => requests.push({ signal, resolve })));
    function Harness() {
      const [value, setValue] = useState<typeof eligibleAna | null>(eligibleAna);
      return <EligibleUserCombobox api={api({ eligibleUsers })} value={value} onChange={setValue} />;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Quitar usuario vinculado" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(eligibleUsers).toHaveBeenCalledTimes(2);
    requests[1]?.resolve({ items: [], pagination: { ...pagination, totalItems: 0, totalPages: 0 } });
    await act(async () => undefined);
    expect(screen.getByText("No hay usuarios elegibles para esta búsqueda.")).toBeInTheDocument();
  });

  it("distingue el error de carga del resultado vacío y permite reintentar sin exponer detalles", async () => {
    const eligibleUsers = vi.fn()
      .mockRejectedValueOnce(new Error("SQLSTATE 08006 conexión privada"))
      .mockResolvedValueOnce({ items: [eligibleAna], pagination });
    render(<EligibleUserCombobox api={api({ eligibleUsers })} value={null} onChange={vi.fn()} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Usuario vinculado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible cargar los usuarios elegibles.");
    expect(screen.queryByText(/SQLSTATE/)).not.toBeInTheDocument();
    expect(screen.queryByText("No hay usuarios elegibles para esta búsqueda.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar usuarios elegibles" }));
    expect(await screen.findByRole("option", { name: "Ana López · ana@geek.test" })).toBeInTheDocument();
  });

  it("conserva la página acumulada y reintenta la misma página tras un error", async () => {
    const eligibleUsers = vi.fn()
      .mockResolvedValueOnce({ items: [eligibleAna], pagination: { ...pagination, totalItems: 2, totalPages: 2 } })
      .mockRejectedValueOnce(new Error("fallo interno página 2"))
      .mockResolvedValueOnce({ items: [eligibleBeto], pagination: { ...pagination, page: 2, totalItems: 2, totalPages: 2 } });
    render(<EligibleUserCombobox api={api({ eligibleUsers })} value={null} onChange={vi.fn()} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Usuario vinculado" }));
    expect(await screen.findByRole("option", { name: "Ana López · ana@geek.test" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cargar más usuarios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible cargar los usuarios elegibles.");
    expect(screen.getByRole("option", { name: "Ana López · ana@geek.test" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar usuarios elegibles" }));

    expect(await screen.findByRole("option", { name: "Beto Ruiz · beto@geek.test" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ana López · ana@geek.test" })).toBeInTheDocument();
    expect(eligibleUsers.mock.calls.map((call) => call[1])).toEqual([1, 2, 2]);
  });

  it("secuencia tres páginas sin avanzar durante carga ni error", async () => {
    const user = userEvent.setup();
    let rejectPage2: ((error: unknown) => void) | undefined;
    let resolvePage2Retry: ((value: EligibleUserPage) => void) | undefined;
    let page2Attempts = 0;
    const eligibleUsers = vi.fn((_search: string, requestedPage: number): Promise<EligibleUserPage> => {
      if (requestedPage === 1) return Promise.resolve({ items: [eligibleAna], pagination: { ...pagination, totalItems: 3, totalPages: 3 } });
      if (requestedPage === 2 && page2Attempts++ === 0) {
        return new Promise((_resolve, reject) => { rejectPage2 = reject; });
      }
      if (requestedPage === 2) {
        return new Promise((resolve) => { resolvePage2Retry = resolve; });
      }
      return Promise.resolve({ items: [{ id: "user-3", displayName: "Carla Paz", email: "carla@geek.test" }], pagination: { ...pagination, page: 3, totalItems: 3, totalPages: 3 } });
    });
    render(<EligibleUserCombobox api={api({ eligibleUsers })} value={null} onChange={vi.fn()} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Usuario vinculado" }));
    expect(await screen.findByRole("option", { name: "Ana López · ana@geek.test" })).toBeInTheDocument();

    await user.dblClick(screen.getByRole("button", { name: "Cargar más usuarios" }));
    expect(eligibleUsers.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    expect(screen.queryByRole("button", { name: "Cargar más usuarios" })).not.toBeInTheDocument();

    await act(async () => { rejectPage2?.(new Error("fallo temporal de página 2")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("No fue posible cargar los usuarios elegibles.");
    expect(screen.queryByRole("button", { name: "Cargar más usuarios" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar usuarios elegibles" }));
    expect(eligibleUsers.mock.calls.map((call) => call[1])).toEqual([1, 2, 2]);

    await act(async () => { resolvePage2Retry?.({ items: [eligibleBeto], pagination: { ...pagination, page: 2, totalItems: 3, totalPages: 3 } }); });
    expect(await screen.findByRole("option", { name: "Beto Ruiz · beto@geek.test" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar más usuarios" }));
    expect(await screen.findByRole("option", { name: "Carla Paz · carla@geek.test" })).toBeInTheDocument();
    expect(eligibleUsers.mock.calls.map((call) => call[1])).toEqual([1, 2, 2, 3]);
  });
});

describe("TechnicianForm", () => {
  it("selecciona un usuario elegible con teclado sin enviar el formulario", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    const eligibleUsers = vi.fn(async () => ({ items: [eligibleAna, eligibleBeto], pagination: { ...pagination, totalItems: 2 } }));
    render(<TechnicianForm api={api({ eligibleUsers })} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const combobox = screen.getByRole("combobox", { name: "Usuario vinculado" });
    await user.click(combobox);
    const firstOption = await screen.findByRole("option", { name: /Ana L/ });
    await user.keyboard("{ArrowDown}");
    expect(combobox).toHaveAttribute("aria-activedescendant", firstOption.id);
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");

    expect(combobox).toHaveValue("Ana López · ana@geek.test");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}");
    expect(combobox).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
  });

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

  it.each([
    ["El correo laboral ya está registrado.", "Correo laboral"],
    ["El usuario seleccionado no es elegible como técnico.", "Usuario vinculado"],
    ["El usuario seleccionado ya está vinculado a otro técnico.", "Usuario vinculado"],
  ])("asocia el error API %s con su campo", (apiError, fieldLabel) => {
    const pendingApi = api({ eligibleUsers: vi.fn(() => new Promise<EligibleUserPage>(() => undefined)) });
    render(<TechnicianForm api={pendingApi} apiError={apiError} onSubmit={vi.fn(async () => false)} onCancel={vi.fn()} />);
    const field = screen.getByRole(fieldLabel === "Usuario vinculado" ? "combobox" : "textbox", { name: fieldLabel });
    const alert = screen.getByRole("alert");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
  });

  it("bloquea Escape desde el mismo instante en que comienza el envío", async () => {
    const onCancel = vi.fn();
    let finish: ((value: boolean) => void) | undefined;
    const onSubmit = vi.fn(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      return new Promise<boolean>((resolve) => { finish = resolve; });
    });
    const pendingApi = api({ eligibleUsers: vi.fn(() => new Promise<EligibleUserPage>(() => undefined)) });
    render(<TechnicianForm api={pendingApi} onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Ana López" } });
    fireEvent.submit(screen.getByRole("dialog", { name: "Nuevo técnico" }));
    expect(onCancel).not.toHaveBeenCalled();
    finish?.(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear técnico" })).toBeEnabled());
  });
});
