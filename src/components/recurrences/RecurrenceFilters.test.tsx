import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecurrenceLookupApi } from "../../api/recurrence-lookups";
import type { RecurrenceCatalog } from "../../models/recurrence";
import { RecurrenceFilters } from "./RecurrenceFilters";

const pagination = { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };
const catalog: RecurrenceCatalog = {
  causes: [],
  states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
  impacts: ["LOW", "MEDIUM", "HIGH"],
  responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
  transitions: [],
};

afterEach(cleanup);

describe("filtros de alcance de reincidencias", () => {
  it("aborta e invalida una búsqueda de sucursales pendiente al limpiar el cliente", async () => {
    const user = userEvent.setup();
    let resolveBranches!: (value: Awaited<ReturnType<RecurrenceLookupApi["branches"]>>) => void;
    let branchSignal: AbortSignal | undefined;
    const branchResponse = new Promise<Awaited<ReturnType<RecurrenceLookupApi["branches"]>>>((resolve) => {
      resolveBranches = resolve;
    });
    const lookupApi: RecurrenceLookupApi = {
      orders: vi.fn().mockResolvedValue({ items: [], pagination }),
      technicians: vi.fn().mockResolvedValue({ items: [], pagination }),
      clients: vi.fn().mockResolvedValue({ items: [], pagination }),
      branches: vi.fn((_clientId, _search, _page, signal) => {
        branchSignal = signal;
        return branchResponse;
      }),
    };

    render(<RecurrenceFilters
      filters={{ clientId: "client-old", page: 1, pageSize: 20 }}
      catalog={catalog}
      catalogState="ready"
      canViewAll
      lookupApi={lookupApi}
      lookupCapabilities={{ orders: true, technicians: true, clients: true, branches: true }}
      onChange={vi.fn()}
      onRetryCatalog={vi.fn()}
    />);

    await user.click(screen.getByRole("combobox", { name: "Sucursal" }));
    await waitFor(() => expect(lookupApi.branches).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Quitar cliente" }));

    await act(async () => resolveBranches({
      items: [{ id: "branch-old", code: "OLD", name: "Sucursal anterior" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }));

    expect(branchSignal?.aborted).toBe(true);
    expect(screen.queryByRole("option", { name: /Sucursal anterior/ })).not.toBeInTheDocument();
  });
});
