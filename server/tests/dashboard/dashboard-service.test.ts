import { describe, expect, it, vi } from "vitest";
import { createDashboardService } from "../../src/dashboard/dashboard.service.js";

describe("dashboard service", () => {
  it("includes the current open pause in the active activity duration", async () => {
    const repository = {
      readOperationalDashboard: vi.fn(async () => ({
        team: [{
          id: "tech-1", code: "TEC-1", fullName: "Ana", specialty: null, status: "BUSY",
          actividades: [{ actividad: {
            status: "PAUSED", description: "En espera", startedAt: new Date("2026-09-30T12:00:00.000Z"),
            pausedMinutes: 0, pausas: [
              { startedAt: new Date("2026-09-30T12:10:00.000Z"), endedAt: new Date("2026-09-30T12:20:00.000Z") },
              { startedAt: new Date("2026-09-30T12:30:00.000Z"), endedAt: null },
            ],
            tipoActividad: { name: "Soporte" }, sucursal: { name: "Centro", cliente: { tradeName: "Cliente" } },
          } }],
        }], activities: [], recurrences: [],
      })),
    };
    const service = createDashboardService(repository as never, "America/Tegucigalpa", () => new Date("2026-09-30T13:00:00.000Z"));

    const dashboard = await service.getOperationalDashboard({ date: "2026-09-30" }, {
      userId: "user-1", technicianId: null, permissions: ["ACTIVITIES_VIEW_ALL", "TECHNICIANS_VIEW"], requestId: "request-1",
    });

    expect(dashboard.team[0]).toMatchObject({ activeActivity: { pausedMinutes: 40 } });
  });

  it("only exposes an activity recurrence relation to actors allowed to view it", async () => {
    const activity = {
      id: "activity-1", status: "COMPLETED", description: "Instalación", startedAt: null, endedAt: null,
      pausedMinutes: 0, productiveMinutes: 30, updatedAt: new Date("2026-09-30T12:00:00.000Z"),
      tipoActividad: { name: "Instalación" }, sucursal: { name: "Centro", cliente: { tradeName: "Cliente" } },
      orden: { orderNumber: "OT-1", reincidenciasOriginales: [{ id: "recurrence-1" }], visitasReincidencia: [] },
      tecnicos: [],
    };
    const repository = { readOperationalDashboard: vi.fn(async () => ({ team: [], activities: [activity], recurrences: [] })) };
    const service = createDashboardService(repository as never, "America/Tegucigalpa", () => new Date("2026-09-30T12:00:00.000Z"));

    const withoutRecurrences = await service.getOperationalDashboard({ date: "2026-09-30" }, {
      userId: "user-1", technicianId: null, permissions: ["ACTIVITIES_VIEW_ALL"], requestId: "request-1",
    });
    const withRecurrences = await service.getOperationalDashboard({ date: "2026-09-30" }, {
      userId: "user-2", technicianId: null, permissions: ["ACTIVITIES_VIEW_ALL", "RECURRENCES_VIEW_ALL"], requestId: "request-2",
    });

    expect(withoutRecurrences.recentActivities[0]).not.toHaveProperty("isRecurrenceRelated");
    expect(withRecurrences.recentActivities[0]).toMatchObject({ isRecurrenceRelated: true });
  });

  it("keeps recurrence data absent when the actor cannot view recurrences", async () => {
    const repository = {
      readOperationalDashboard: vi.fn(async () => ({
        team: [],
        activities: [],
        recurrences: [{ id: "private-case" }],
      })),
    };
    const service = createDashboardService(repository as never, "America/Tegucigalpa", () => new Date("2026-09-30T12:00:00.000Z"));

    const dashboard = await service.getOperationalDashboard(
      { date: "2026-09-30" },
      {
        userId: "user-1", technicianId: null,
        permissions: ["KPI_VIEW_ALL", "TECHNICIANS_VIEW", "ACTIVITIES_VIEW_ALL"],
        requestId: "request-1",
      },
    );

    expect(dashboard.capabilities.recurrences).toBe(false);
    expect(dashboard.recurrences).toBeNull();
    expect(repository.readOperationalDashboard).toHaveBeenCalledWith(expect.objectContaining({
      includeRecurrences: false,
    }));
  });
});
