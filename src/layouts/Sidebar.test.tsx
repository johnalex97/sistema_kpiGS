import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("shows the orders workspace when it is authorized", () => {
    render(<Sidebar
      page="Órdenes"
      visiblePages={["Órdenes"]}
      open={false}
      onChange={vi.fn()}
      onClose={vi.fn()}
    />);

    expect(screen.getByRole("button", { name: "Órdenes" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("no presenta un contador de reincidencias sin una fuente real compartida", () => {
    render(<Sidebar
      page="Reincidencias"
      visiblePages={["Reincidencias"]}
      open={false}
      onChange={vi.fn()}
      onClose={vi.fn()}
    />);

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    const recurrence = within(navigation).getByRole("button", { name: "Reincidencias" });
    expect(recurrence).toHaveAttribute("aria-current", "page");
    expect(within(recurrence).queryByText("4")).not.toBeInTheDocument();
  });
});
