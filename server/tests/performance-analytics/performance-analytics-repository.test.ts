import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import { createPerformanceAnalyticsRepository } from "../../src/performance-analytics/performance-analytics.repository.js";

const period = {
  granularity: "WEEK" as const,
  periodStart: "2026-05-04",
  periodEnd: "2026-05-10",
  startInclusive: new Date("2026-05-04T06:00:00.000Z"),
  endExclusive: new Date("2026-05-11T06:00:00.000Z"),
};

describe("performance analytics repository", () => {
  it("reads facts in one repeatable-read snapshot and maps partial activity participation", async () => {
    const transaction = {
      tecnico: { findMany: vi.fn(async () => [{ id: "tech-a", code: "TEC-01", fullName: "Ana" }]) },
      ordenTrabajo: { findMany: vi.fn(async () => [{ id: "order-1", status: "COMPLETED", scheduledFor: null, endedAt: new Date("2026-05-05T12:00:00.000Z"), totalMinutes: 120, tecnicos: [{ tecnicoId: "tech-a" }] }]) },
      actividad: { findMany: vi.fn(async () => [{
        id: "activity-1", orderId: "order-1", startedAt: new Date("2026-05-05T08:00:00.000Z"), endedAt: new Date("2026-05-05T10:00:00.000Z"), pausedMinutes: 20, productiveMinutes: 80,
        tecnicos: [{ tecnicoId: "tech-a", participationPercentage: { toNumber: () => 50 } }],
        pausas: [
          { startedAt: new Date("2026-05-05T08:20:00.000Z"), endedAt: new Date("2026-05-05T08:30:00.000Z") },
          { startedAt: new Date("2026-05-05T09:00:00.000Z"), endedAt: new Date("2026-05-05T09:10:00.000Z") },
        ],
      }]) },
      reincidencia: { findMany: vi.fn(async () => [{ id: "rec-1", originalOrderId: "order-1", tecnicos: [{ tecnicoId: "tech-a" }] }]) },
      resultadoKPI: { findMany: vi.fn(async () => []) },
      configuracionKPI: { findFirst: vi.fn(async () => null) },
    };
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown, options: unknown) => {
        expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        return operation(transaction);
      }),
    };
    const repository = createPerformanceAnalyticsRepository(database as never);

    const snapshot = await repository.readSnapshot({
      query: { granularity: "WEEK", periodStart: "2026-05-04" }, period, scope: { kind: "GLOBAL" },
    });

    expect(snapshot.activities).toEqual([expect.objectContaining({
      technicianId: "tech-a", registeredMinutes: 50, productiveMinutes: 40, pausedMinutes: 10,
    })]);
    expect(snapshot.recurrences).toEqual([{ id: "rec-1", originalOrderId: "order-1", technicianIds: ["tech-a"] }]);
    expect(snapshot.orders).toEqual([expect.objectContaining({ id: "order-1", technicianIds: ["tech-a"] })]);
    expect(database.$transaction).toHaveBeenCalledTimes(1);
  });

  it("limits all fact queries to the technician in own scope and excludes archived parents", async () => {
    const transaction = {
      tecnico: { findMany: vi.fn(async () => []) }, ordenTrabajo: { findMany: vi.fn(async () => []) },
      actividad: { findMany: vi.fn(async () => []) }, reincidencia: { findMany: vi.fn(async () => []) }, resultadoKPI: { findMany: vi.fn(async () => []) },
      configuracionKPI: { findFirst: vi.fn(async () => null) },
    };
    const repository = createPerformanceAnalyticsRepository({
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
    } as never);

    await repository.readSnapshot({ query: { granularity: "WEEK", periodStart: "2026-05-04" }, period, scope: { kind: "TECHNICIAN", technicianId: "tech-own" } });

    expect(transaction.tecnico.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "tech-own", deletedAt: null }) }));
    expect(transaction.actividad.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      sucursal: { is: { deletedAt: null, isActive: true, cliente: { is: { deletedAt: null, isActive: true } } } },
      tecnicos: { some: { tecnicoId: "tech-own" } },
    }) }));
    expect(transaction.ordenTrabajo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      deletedAt: null, sucursal: { is: { deletedAt: null, isActive: true, cliente: { is: { deletedAt: null, isActive: true } } } },
    }) }));
  });
});
