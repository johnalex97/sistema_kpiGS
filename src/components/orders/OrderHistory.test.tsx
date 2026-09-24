import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrdersApi } from "../../api/orders";
import { OrderHistory } from "./OrderHistory";

const entry = { id: "h-1", previousStatus: "ASSIGNED" as const, newStatus: "IN_PROGRESS" as const, action: "START", comment: "Inicio", occurredAt: "2026-09-16T12:00:00Z", user: { id: "u-1", displayName: "Ana" }, metadata: null };
const page = { items: [entry], pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 2 } };

describe("OrderHistory", () => {
  it("muestra hora hondureña aunque el dispositivo tenga otra zona", async () => {
    const original = Date.prototype.toLocaleString;
    const spy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date, locales, options) {
      return original.call(this, locales, { timeZone: "Asia/Tokyo", ...options });
    });
    render(<OrderHistory orderId="order-1" api={{ history: vi.fn().mockResolvedValue(page) }} canView />);
    expect(await screen.findByText(/6:00:00/)).toBeInTheDocument();
    spy.mockRestore();
  });
  it("loads history only when the history area is rendered and owns its pagination", async () => {
    const history = vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce({ ...page, items: [{ ...entry, id: "h-2", action: "PAUSE" }], pagination: { ...page.pagination, page: 2 } });
    const user = userEvent.setup();
    render(<OrderHistory orderId="order-1" api={{ history } as Pick<OrdersApi, "history">} canView />);
    expect(await screen.findByText("Inicio")).toBeInTheDocument();
    expect(history).toHaveBeenCalledWith("order-1", 1, expect.any(AbortSignal));
    await user.click(screen.getByRole("button", { name: "Siguiente página del historial" }));
    expect(await screen.findByText("PAUSE")).toBeInTheDocument();
    expect(history).toHaveBeenNthCalledWith(2, "order-1", 2, expect.any(AbortSignal));
  });

  it("does not request history without view permission", () => {
    const history = vi.fn();
    render(<OrderHistory orderId="order-1" api={{ history } as Pick<OrdersApi, "history">} canView={false} />);
    expect(history).not.toHaveBeenCalled();
    expect(screen.getByText("El historial no está disponible para tu perfil.")).toBeInTheDocument();
  });
  it("uses the controlled response page for pagination controls", async () => {
    const history = vi.fn();
    const onLoadHistory = vi.fn(async () => undefined);
    const view = render(<OrderHistory orderId="order-1" api={{ history } as Pick<OrdersApi, "history">} canView historyState={{ status: "success", data: page, error: null }} onLoadHistory={onLoadHistory} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Siguiente p/ }));
    expect(onLoadHistory).toHaveBeenCalledWith(2);

    view.rerender(<OrderHistory orderId="order-1" api={{ history } as Pick<OrdersApi, "history">} canView historyState={{ status: "success", data: { ...page, items: [{ ...entry, id: "h-2", action: "PAUSE" }], pagination: { ...page.pagination, page: 2 } }, error: null }} onLoadHistory={onLoadHistory} />);
    expect(screen.getByRole("navigation", { name: /Pagin/ })).toHaveTextContent(/2 de 2/);
    expect(screen.getByRole("button", { name: /anterior/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Siguiente p/ })).toBeDisabled();
  });
});
