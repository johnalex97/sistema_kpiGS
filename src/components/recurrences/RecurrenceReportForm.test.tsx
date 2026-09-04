import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
import type { OrderLookup, OrderLookupPage, OrderStatus } from "../../models/order-lookup";
import { OrderLookupCombobox } from "./OrderLookupCombobox";
import { RecurrenceReportForm } from "./RecurrenceReportForm";
import "../../styles.css";

const original: OrderLookup = {
  id: "order-original",
  orderNumber: "OT-100",
  clientName: "Hospital Norte",
  branchName: "Sede central",
  status: "COMPLETED",
};
const correction: OrderLookup = {
  id: "order-correction",
  orderNumber: "OT-205",
  clientName: "Hospital Norte",
  branchName: "Sede central",
  status: "IN_PROGRESS",
};

const emptyPagination = { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };

function page(items: OrderLookup[], currentPage = 1, totalPages = 1): OrderLookupPage {
  return { items, pagination: { page: currentPage, pageSize: 20, totalItems: items.length, totalPages } };
}

function lookupApi(orders = vi.fn().mockResolvedValue(page([original, correction]))): RecurrenceLookupApi {
  return {
    orders,
    technicians: vi.fn().mockResolvedValue({ items: [], pagination: emptyPagination }),
    clients: vi.fn().mockResolvedValue({ items: [], pagination: emptyPagination }),
    branches: vi.fn().mockResolvedValue({ items: [], pagination: emptyPagination }),
  };
}

afterEach(() => vi.useRealTimers());

describe("OrderLookupCombobox", () => {
  it("debounces search, aborts the obsolete request and ignores its late response", async () => {
    vi.useFakeTimers();
    const requests: Array<{
      search: string;
      statuses: OrderStatus[];
      signal?: AbortSignal;
      resolve(value: OrderLookupPage): void;
    }> = [];
    const orders = vi.fn((search: string, statuses: OrderStatus[], _page: number, signal?: AbortSignal) =>
      new Promise<OrderLookupPage>((resolve) => requests.push({ search, statuses, signal, resolve })));
    render(<OrderLookupCombobox label="Orden original" name="originalOrderId" api={lookupApi(orders)} statuses={["COMPLETED"]} value={null} onChange={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "Orden original" });
    fireEvent.focus(input);
    await act(async () => undefined);
    expect(orders).toHaveBeenCalledWith("", ["COMPLETED"], 1, expect.any(AbortSignal));
    expect(screen.getByRole("status", { name: "Buscando órdenes" })).toHaveAttribute("aria-live", "polite");
    fireEvent.change(input, { target: { value: "OT-2" } });
    expect(requests[0]?.signal?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(orders).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(orders).toHaveBeenCalledTimes(2);
    expect(requests[1]?.search).toBe("OT-2");

    await act(async () => { requests[0]?.resolve(page([original])); await Promise.resolve(); });
    expect(screen.queryByRole("option", { name: /OT-100/ })).not.toBeInTheDocument();
    await act(async () => { requests[1]?.resolve(page([{ ...correction, status: "COMPLETED" }])); await Promise.resolve(); });
    expect(screen.getByRole("option", { name: /OT-205/ })).toBeInTheDocument();
  });

  it("never requests or publishes the previous search when returning from page 2 to page 1", async () => {
    vi.useFakeTimers();
    const requests: Array<{ search: string; page: number; resolve(value: OrderLookupPage): void }> = [];
    const orders = vi.fn((search: string, _statuses: OrderStatus[], requestedPage: number) =>
      new Promise<OrderLookupPage>((resolve) => requests.push({ search, page: requestedPage, resolve })));
    render(<OrderLookupCombobox label="Orden correctiva" name="correctionOrderId" api={lookupApi(orders)} statuses={["IN_PROGRESS"]} value={null} onChange={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "Orden correctiva" });
    fireEvent.focus(input);
    await act(async () => undefined);
    await act(async () => { requests[0]?.resolve(page([correction], 1, 2)); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Cargar más órdenes" }));
    expect(requests[1]).toMatchObject({ search: "", page: 2 });

    fireEvent.change(input, { target: { value: "OT-9" } });
    await act(async () => undefined);
    expect(requests).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(requests[2]).toMatchObject({ search: "OT-9", page: 1 });

    await act(async () => { requests[1]?.resolve(page([{ ...correction, id: "stale", orderNumber: "OT-OLD" }], 2, 2)); await Promise.resolve(); });
    expect(screen.queryByRole("option", { name: /OT-OLD/ })).not.toBeInTheDocument();
    await act(async () => { requests[2]?.resolve(page([{ ...correction, id: "fresh", orderNumber: "OT-900" }])); await Promise.resolve(); });
    expect(screen.getByRole("option", { name: /OT-900/ })).toBeInTheDocument();
  });

  it("supports paginated options and keyboard selection without submitting its parent", async () => {
    const user = userEvent.setup();
    const orders = vi.fn()
      .mockResolvedValueOnce(page([correction], 1, 2))
      .mockResolvedValueOnce(page([{ ...correction, id: "order-third", orderNumber: "OT-300" }], 2, 2));
    const onChange = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={onSubmit}><OrderLookupCombobox label="Orden correctiva" name="correctionOrderId" api={lookupApi(orders)} statuses={["IN_PROGRESS"]} value={null} onChange={onChange} /></form>);

    const input = screen.getByRole("combobox", { name: "Orden correctiva" });
    await user.click(input);
    const first = await screen.findByRole("option", { name: /OT-205/ });
    const listbox = screen.getByRole("listbox", { name: "Opciones de Orden correctiva" });
    expect(first.tagName).toBe("DIV");
    expect(first).toHaveAttribute("tabindex", "-1");
    expect(within(listbox).queryByRole("button", { name: "Cargar más órdenes" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");

    expect(onChange).toHaveBeenCalledWith(correction);
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(input);
    await user.click(screen.getByRole("button", { name: "Cargar más órdenes" }));
    expect(await screen.findByRole("option", { name: /OT-300/ })).toBeInTheDocument();
    expect(orders.mock.calls.map((call) => call[2])).toEqual([1, 2]);
  });

  it("consumes Escape while open and excludes an unavailable order", async () => {
    const user = userEvent.setup();
    const parentEscape = vi.fn();
    render(<div onKeyDown={(event) => { if (event.key === "Escape") parentEscape(); }}>
      <OrderLookupCombobox label="Orden correctiva" name="correctionOrderId" api={lookupApi()} statuses={["IN_PROGRESS"]} value={null} excludeId={original.id} onChange={vi.fn()} />
    </div>);

    const input = screen.getByRole("combobox", { name: "Orden correctiva" });
    await user.click(input);
    await screen.findByRole("option", { name: /OT-205/ });
    expect(screen.queryByRole("option", { name: /OT-100/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(parentEscape).not.toHaveBeenCalled();
  });
});

describe("RecurrenceReportForm", () => {
  it("uses the allowed scopes, resets correction when original changes and reports normalized input", async () => {
    const user = userEvent.setup();
    const orders = vi.fn(async (_search: string, statuses: OrderStatus[]) => page(
      statuses.length === 1 && statuses[0] === "COMPLETED" ? [original] : [correction],
    ));
    const onSubmit = vi.fn(async () => true);
    render(<RecurrenceReportForm lookupApi={lookupApi(orders)} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const originalInput = screen.getByRole("combobox", { name: "Orden original" });
    expect(originalInput).toHaveAttribute("name", "originalOrderId");
    expect(originalInput).toHaveAttribute("placeholder", expect.stringMatching(/^Ej\.: OT-/u));
    await user.click(originalInput);
    await user.click(await screen.findByRole("option", { name: /OT-100/ }));
    const correctionInput = screen.getByRole("combobox", { name: "Orden correctiva" });
    expect(correctionInput).toHaveAttribute("name", "correctionOrderId");
    await user.click(correctionInput);
    await user.click(await screen.findByRole("option", { name: /OT-205/ }));
    await user.type(screen.getByLabelText("Problema detectado"), "  La conexión volvió a fallar  ");
    await user.click(screen.getByRole("button", { name: "Reportar reincidencia" }));

    expect(orders.mock.calls[0]?.[1]).toEqual(["COMPLETED"]);
    expect(orders.mock.calls[1]?.[1]).toEqual(["PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED", "COMPLETED"]);
    expect(onSubmit).toHaveBeenCalledWith({
      originalOrderId: original.id,
      correctionOrderId: correction.id,
      detectedProblem: "La conexión volvió a fallar",
    });

    await user.click(originalInput);
    await user.clear(originalInput);
    expect(correctionInput).toHaveValue("");
  });

  it("keeps Escape inside an open order popup and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RecurrenceReportForm lookupApi={lookupApi()} onSubmit={vi.fn(async () => true)} onCancel={onCancel} />);

    const originalInput = screen.getByRole("combobox", { name: "Orden original" });
    await screen.findByRole("option", { name: /OT-100/ });
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(originalInput);
    await user.click(screen.getByRole("option", { name: /OT-100/ }));
    await user.click(screen.getByRole("button", { name: "Reportar reincidencia" }));
    expect(screen.getByRole("combobox", { name: "Orden correctiva" })).toHaveFocus();

    await user.click(screen.getByRole("combobox", { name: "Orden correctiva" }));
    await user.click(await screen.findByRole("option", { name: /OT-205/ }));
    await user.click(screen.getByRole("button", { name: "Reportar reincidencia" }));
    expect(screen.getByLabelText("Problema detectado")).toHaveFocus();
  });

  it("clears a pending corrective search when the original order changes", async () => {
    const user = userEvent.setup();
    const anotherOriginal = { ...original, id: "order-original-2", orderNumber: "OT-101" };
    const orders = vi.fn(async (_search: string, statuses: OrderStatus[]) => page(
      statuses.length === 1 && statuses[0] === "COMPLETED" ? [original, anotherOriginal] : [correction],
    ));
    render(<RecurrenceReportForm lookupApi={lookupApi(orders)} onSubmit={vi.fn(async () => true)} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Orden original" }));
    await user.click(await screen.findByRole("option", { name: /OT-100/ }));
    const correctionInput = screen.getByRole("combobox", { name: "Orden correctiva" });
    await user.type(correctionInput, "OT-9");
    expect(correctionInput).toHaveValue("OT-9");
    await user.click(screen.getByRole("button", { name: "Quitar orden original" }));

    expect(screen.getByRole("combobox", { name: "Orden correctiva" })).toHaveValue("");
  });

  it("keeps the selected-order removal control at least 44 by 44 CSS pixels", () => {
    render(<OrderLookupCombobox label="Orden original" name="originalOrderId" api={lookupApi()} statuses={["COMPLETED"]} value={original} onChange={vi.fn()} />);
    const remove = screen.getByRole("button", { name: "Quitar orden original" });
    expect(getComputedStyle(remove).width).toBe("44px");
    expect(getComputedStyle(remove).minHeight).toBe("44px");
  });

  it("rejects out-of-scope results and preserves values after an API conflict", async () => {
    const user = userEvent.setup();
    const cancelled = { ...correction, id: "cancelled", status: "CANCELLED" as const };
    const onSubmit = vi.fn(async () => false);
    const api = lookupApi(vi.fn(async (_search: string, statuses: OrderStatus[]) => page(
      statuses.length === 1 ? [original] : [original, correction, cancelled],
    )));
    const { rerender } = render(<RecurrenceReportForm lookupApi={api} apiError={null} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Orden original" }));
    await user.click(await screen.findByRole("option", { name: /OT-100/ }));
    const correctionInput = screen.getByRole("combobox", { name: "Orden correctiva" });
    await user.click(correctionInput);
    const correctionOption = await screen.findByRole("option", { name: /OT-205/ });
    expect(screen.queryByRole("option", { name: /OT-100/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /cancelled/i })).not.toBeInTheDocument();
    await user.click(correctionOption);
    await user.type(screen.getByLabelText("Problema detectado"), "Falla repetida");
    await user.click(screen.getByRole("button", { name: "Reportar reincidencia" }));
    rerender(<RecurrenceReportForm lookupApi={api} apiError="Ya existe una reincidencia para estas órdenes." onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ya existe una reincidencia");
    expect(screen.getByLabelText("Problema detectado")).toHaveValue("Falla repetida");
  });

  it("blocks duplicate submission and keeps Escape disabled while pending", async () => {
    const user = userEvent.setup();
    let finish: ((value: boolean) => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const onCancel = vi.fn();
    render(<RecurrenceReportForm lookupApi={lookupApi()} onSubmit={onSubmit} onCancel={onCancel} />);

    await user.click(screen.getByRole("combobox", { name: "Orden original" }));
    await user.click(await screen.findByRole("option", { name: /OT-100/ }));
    await user.click(screen.getByRole("combobox", { name: "Orden correctiva" }));
    await user.click(await screen.findByRole("option", { name: /OT-205/ }));
    await user.type(screen.getByLabelText("Problema detectado"), "Falla repetida");
    const form = screen.getByRole("dialog", { name: "Reportar reincidencia" });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Reportando…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    finish?.(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reportar reincidencia" })).toBeEnabled());
  });
});
