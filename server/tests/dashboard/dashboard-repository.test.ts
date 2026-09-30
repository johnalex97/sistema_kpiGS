import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import { createDashboardReadRepository } from "../../src/dashboard/dashboard.repository.js";

describe("dashboard read repository", () => {
  it("reads the snapshot inside a RepeatableRead transaction", async () => {
    const transaction = {
      tecnico: { findMany: vi.fn(async () => []) },
      actividad: { findMany: vi.fn(async () => []) },
      reincidencia: { findMany: vi.fn(async () => []) },
    };
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown, options: unknown) => {
        expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        return operation(transaction);
      }),
    };
    const repository = createDashboardReadRepository(database as never);

    await repository.readOperationalDashboard({
      start: new Date("2026-09-30T06:00:00.000Z"),
      end: new Date("2026-10-01T06:00:00.000Z"),
      activityTechnicianId: null,
      recurrenceTechnicianId: null,
      includeTeam: true,
      includeRecurrences: true,
    });

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.tecnico.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.actividad.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.reincidencia.findMany).toHaveBeenCalledTimes(1);
  });

  it("orders open recurrence candidates by impact before their latest update", async () => {
    const transaction = {
      tecnico: { findMany: vi.fn(async () => []) },
      actividad: { findMany: vi.fn(async () => []) },
      reincidencia: { findMany: vi.fn(async () => []) },
    };
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
    };
    const repository = createDashboardReadRepository(database as never);

    await repository.readOperationalDashboard({
      start: new Date("2026-09-30T06:00:00.000Z"),
      end: new Date("2026-10-01T06:00:00.000Z"),
      activityTechnicianId: null,
      recurrenceTechnicianId: null,
      includeTeam: false,
      includeRecurrences: true,
    });

    expect(transaction.reincidencia.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ impact: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    }));
  });

  it("limits recent activity to the operational day and active parents", async () => {
    const transaction = {
      tecnico: { findMany: vi.fn(async () => []) },
      actividad: { findMany: vi.fn(async () => []) },
      reincidencia: { findMany: vi.fn(async () => []) },
    };
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
    };
    const repository = createDashboardReadRepository(database as never);
    const start = new Date("2026-09-30T06:00:00.000Z");
    const end = new Date("2026-10-01T06:00:00.000Z");

    await repository.readOperationalDashboard({
      start, end, activityTechnicianId: null, recurrenceTechnicianId: null,
      includeTeam: false, includeRecurrences: false,
    });

    expect(transaction.actividad.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sucursal: { deletedAt: null, isActive: true, cliente: { deletedAt: null, isActive: true } },
        OR: [{ startedAt: { gte: start, lt: end } }, { updatedAt: { gte: start, lt: end } }],
      }),
    }));
  });

  it("limits the team board to the authorized technician for own scope", async () => {
    const transaction = { tecnico: { findMany: vi.fn(async () => []) }, actividad: { findMany: vi.fn(async () => []) }, reincidencia: { findMany: vi.fn(async () => []) } };
    const repository = createDashboardReadRepository({ $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)) } as never);
    await repository.readOperationalDashboard({ start: new Date(), end: new Date(), activityTechnicianId: "tech-own", recurrenceTechnicianId: "tech-own", includeTeam: true, includeRecurrences: false });
    expect(transaction.tecnico.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "tech-own" }) }));
  });
});
