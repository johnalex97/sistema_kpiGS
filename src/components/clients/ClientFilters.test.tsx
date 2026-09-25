import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientListFilters } from "../../models/client";
import { ClientFilters } from "./ClientFilters";

const defaults: ClientListFilters = { page: 3, pageSize: 20, includeInactive: false };

afterEach(() => vi.useRealTimers());

describe("ClientFilters", () => {
  it("al elegir inactivos solicita su inclusión y vuelve a la primera página", async () => {
    const onChange = vi.fn();
    render(<ClientFilters filters={defaults} onChange={onChange} onClear={vi.fn()} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Estado del cliente"), "inactive");
    expect(onChange).toHaveBeenCalledWith({ isActive: false, includeInactive: true, page: 1 });
  });

  it("al cambiar inclusión vuelve a la primera página", async () => {
    const onChange = vi.fn();
    render(<ClientFilters filters={defaults} onChange={onChange} onClear={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Incluir inactivos" }));
    expect(onChange).toHaveBeenCalledWith({ includeInactive: true, page: 1 });
  });

  it("espera 300 ms desde la última edición de búsqueda y limpia el temporizador al desmontar", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { unmount } = render(<ClientFilters filters={defaults} onChange={onChange} onClear={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "Buscar clientes" });
    fireEvent.change(input, { target: { value: "A" } });
    act(() => vi.advanceTimersByTime(299));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Acme" } });
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(299));
    expect(onChange).toHaveBeenCalledWith({ search: "Acme", page: 1 });
    fireEvent.change(input, { target: { value: "Acme Norte" } });
    unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("limpiar filtros invoca la acción integrada", async () => {
    const onClear = vi.fn();
    render(<ClientFilters filters={{ ...defaults, search: "Acme" }} onChange={vi.fn()} onClear={onClear} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("una búsqueda restaurada desde fuera reemplaza el texto local pendiente", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<ClientFilters filters={defaults} onChange={onChange} onClear={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar clientes" }), { target: { value: "Temporal" } });
    view.rerender(<ClientFilters filters={{ ...defaults, search: "Histórica" }} onChange={onChange} onClear={vi.fn()} />);
    expect(screen.getByRole("searchbox", { name: "Buscar clientes" })).toHaveValue("Histórica");
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("limpiar antes de 300 ms descarta la búsqueda local pendiente", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<ClientFilters filters={defaults} onChange={onChange} onClear={onClear} />);
    const input = screen.getByRole("searchbox", { name: "Buscar clientes" });
    fireEvent.change(input, { target: { value: "Temporal" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClear).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("una navegación histórica con la misma búsqueda confirmada descarta la edición pendiente", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<ClientFilters filters={defaults} onChange={onChange} onClear={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "Buscar clientes" });
    fireEvent.change(input, { target: { value: "Temporal" } });
    view.rerender(<ClientFilters filters={{ ...defaults, page: 1, isActive: true }} onChange={onChange} onClear={vi.fn()} />);
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("un rerender sin cambios escalares conserva el debounce pendiente", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<ClientFilters filters={defaults} onChange={onChange} onClear={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar clientes" }), { target: { value: "Acme" } });
    view.rerender(<ClientFilters filters={{ ...defaults }} onChange={onChange} onClear={vi.fn()} />);
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ search: "Acme", page: 1 });
  });
});
