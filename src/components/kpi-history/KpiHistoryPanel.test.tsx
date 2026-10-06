import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { historyFixture } from "../../api/kpi-history.fixture";
import { KpiHistoryPanel } from "./KpiHistoryPanel";
import { HistoryTechnicianPicker } from "./HistoryTechnicianPicker";
import type { HistorySeries, HistoryTechnicianPage } from "../../models/kpi-history";

function auth(permissions: string[], id: string | null = "a", userId = "u"): AuthContextValue {
  return { status: "authenticated", user: { id: userId, email: "u@test.local", displayName: "Usuario", mustChangePassword: false, technicianId: id, roles: [], permissions }, notice: null, returnPath: null, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), retry: vi.fn(), hasPermission: (...required) => required.some(p => permissions.includes(p)) };
}
function api() {
  return { getTrend: vi.fn().mockResolvedValue(historyFixture), searchTechnicians: vi.fn().mockResolvedValue({ items: [historyFixture.technician], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }) };
}
describe("history panel", () => {
  it("ignores an old directory response even when transport ignores abort", async () => {
    const current = api(); const user = userEvent.setup();
    let resolveOld!: (page: HistoryTechnicianPage) => void;
    const newer = { ...historyFixture.technician, id: "b", fullName: "Beatriz nueva" };
    current.searchTechnicians.mockImplementationOnce(() => new Promise(r => { resolveOld = r; })).mockResolvedValue({ items: [newer], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    render(<HistoryTechnicianPicker api={current} value={null} onSelect={vi.fn()} />);
    await waitFor(() => expect(current.searchTechnicians).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText("Buscar técnico por nombre o código"), "Beatriz");
    await screen.findByRole("button", { name: /Beatriz nueva/ });
    await act(async () => resolveOld({ items: [historyFixture.technician], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));
    expect(screen.queryByRole("button", { name: /Ana López/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Beatriz nueva/ })).toBeInTheDocument();
  });
  it("discards a pending series after permissions are revoked", async () => {
    const current = api(); let resolve!: (data: HistorySeries) => void;
    current.getTrend.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { rerender } = render(<AuthContext.Provider value={auth(["KPI_VIEW_OWN"])}><KpiHistoryPanel api={current} /></AuthContext.Provider>);
    await waitFor(() => expect(current.getTrend).toHaveBeenCalled());
    rerender(<AuthContext.Provider value={auth([])}><KpiHistoryPanel api={current} /></AuthContext.Provider>);
    await act(async () => resolve(historyFixture));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/No tienes permiso/)).toBeInTheDocument();
  });
  it("selects authorized technicians, changes metric locally and requests a new granularity", async () => {
    const current = api(); const user = userEvent.setup();
    render(<AuthContext.Provider value={auth(["KPI_VIEW_ALL"])}><KpiHistoryPanel api={current} /></AuthContext.Provider>);
    expect(current.getTrend).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Buscar técnico por nombre o código"), "Ana");
    await user.click(await screen.findByRole("button", { name: /Ana López/ }));
    await screen.findByRole("table", { name: "Historial oficial por periodo" });
    await user.selectOptions(screen.getByLabelText("Indicador del historial"), "quality");
    expect(current.getTrend).toHaveBeenCalledTimes(1);
    await user.selectOptions(screen.getByLabelText("Periodo del historial"), "MONTH");
    await waitFor(() => expect(current.getTrend).toHaveBeenLastCalledWith("a", expect.objectContaining({ granularity: "MONTH" }), expect.any(AbortSignal)));
  });
  it("uses the linked profile without a directory and explains a missing link", async () => {
    const current = api();
    const { rerender } = render(<AuthContext.Provider value={auth(["KPI_VIEW_OWN"])}><KpiHistoryPanel api={current} /></AuthContext.Provider>);
    await screen.findByRole("table");
    expect(current.searchTechnicians).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Buscar técnico por nombre o código")).not.toBeInTheDocument();
    rerender(<AuthContext.Provider value={auth(["KPI_VIEW_OWN"], null)}><KpiHistoryPanel api={current} /></AuthContext.Provider>);
    expect(screen.getByText(/no tiene un técnico vinculado/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("clears admin selection after a session change and keeps an entirely empty window", async () => {
    const current = api();
    current.getTrend.mockResolvedValue({ ...historyFixture, points: historyFixture.points.map(p => ({ ...p, status: "NO_DATA", officialWeeks: 0, partial: true, scores: { overall: null, productivity: null, compliance: null, efficiency: null, quality: null } })) });
    const { rerender } = render(<AuthContext.Provider value={auth(["KPI_VIEW_ALL"])}><KpiHistoryPanel api={current} initialTechnicianId="a" /></AuthContext.Provider>);
    await screen.findByRole("table"); expect(screen.getByText(/al cerrar semanas/i)).toBeInTheDocument();
    rerender(<AuthContext.Provider value={auth(["KPI_VIEW_ALL"], "b", "v")}><KpiHistoryPanel api={current} initialTechnicianId="a" /></AuthContext.Provider>);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/Selecciona un técnico/i)).toBeInTheDocument();
  });
  it("handles directory failure, retry, empty search and pagination", async () => {
    const current = api(); const user = userEvent.setup();
    current.searchTechnicians.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [historyFixture.technician], pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2 } }).mockResolvedValue({ items: [], pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 } });
    render(<AuthContext.Provider value={auth(["KPI_VIEW_ALL"])}><KpiHistoryPanel api={current} /></AuthContext.Provider>);
    await user.click(await screen.findByRole("button", { name: "Reintentar búsqueda" }));
    await user.click(await screen.findByRole("button", { name: "Siguiente página de técnicos" }));
    await screen.findByText("No hay técnicos para esta búsqueda.");
    expect(current.searchTechnicians).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal));
  });
});
