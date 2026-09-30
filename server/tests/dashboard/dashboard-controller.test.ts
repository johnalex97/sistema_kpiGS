import { describe, expect, it, vi } from "vitest";
import { createDashboardController } from "../../src/dashboard/dashboard.controller.js";

describe("dashboard controller", () => {
  it("returns the standard envelope and forwards the normalized actor and query", async () => {
    const getOperationalDashboard = vi.fn(async () => ({
      date: "2026-09-30",
      generatedAt: "2026-09-30T12:00:00.000Z",
      capabilities: { team: false, recentActivities: false, recurrences: false },
      team: [],
      recentActivities: [],
      recurrences: null,
    }));
    const controller = createDashboardController({ getOperationalDashboard });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    await controller.operational(
      {
        query: { date: "2026-09-30" },
        auth: { userId: "user-1", technicianId: null, permissions: ["KPI_VIEW_ALL"] },
        requestId: "request-1",
      } as never,
      { status } as never,
      next,
    );

    expect(getOperationalDashboard).toHaveBeenCalledWith(
      { date: "2026-09-30" },
      { userId: "user-1", technicianId: null, permissions: ["KPI_VIEW_ALL"], requestId: "request-1" },
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: "Resumen operativo consultado",
      errors: [],
      meta: { requestId: "request-1" },
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
