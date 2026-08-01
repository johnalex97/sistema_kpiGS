import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createOrdersReadRepository } from "../../src/orders/orders.read.repository.js";
import type { OrderListFilters } from "../../src/orders/orders.types.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";
import {
  createOrdersReadFixture,
  removeOrdersReadFixture,
  type OrdersReadFixture,
} from "./orders-test-data.js";

const now = new Date("2026-08-01T12:00:00.000Z");

function listFilters(
  overrides: Partial<OrderListFilters> = {},
): OrderListFilters {
  return { page: 1, pageSize: 20, ...overrides };
}

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("orders read repository", () => {
  let fixture: OrdersReadFixture;

  beforeAll(async () => {
    fixture = await createOrdersReadFixture(database);
  });
  afterAll(async () => {
    await removeOrdersReadFixture(database, fixture);
  });

  it("scopes a technician to active and historical assignments without exposing unrelated orders", async () => {
    const repository = createOrdersReadRepository(database);
    const allPage = await repository.listOrders(
      listFilters({ search: fixture.suffix }),
      { kind: "ALL" },
      now,
    );
    const ownPage = await repository.listOrders(
      listFilters({ search: fixture.suffix }),
      { kind: "TECHNICIAN", technicianId: fixture.technicianId },
      now,
    );
    const otherPage = await repository.listOrders(
      listFilters({ search: fixture.suffix }),
      { kind: "TECHNICIAN", technicianId: fixture.otherTechnicianId },
      now,
    );

    expect(allPage.totalItems).toBe(3);
    expect(ownPage.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([fixture.activeOrderId, fixture.historicalOrderId]),
    );
    expect(otherPage.items).toHaveLength(0);
  });

  it("filters by searchable public fields, IDs, repeated enums, schedule and overdue state", async () => {
    const repository = createOrdersReadRepository(database);
    const byOrder = await repository.listOrders(
      listFilters({ search: `${fixture.suffix}-001` }), { kind: "ALL" }, now,
    );
    const byProblem = await repository.listOrders(
      listFilters({ search: `problema ${fixture.suffix}` }), { kind: "ALL" }, now,
    );
    const byClient = await repository.listOrders(
      listFilters({ search: `cliente ${fixture.suffix}` }), { kind: "ALL" }, now,
    );
    const byBranch = await repository.listOrders(
      listFilters({ search: `sucursal ${fixture.suffix}` }), { kind: "ALL" }, now,
    );
    const byIds = await Promise.all([
      repository.listOrders(listFilters({ clientId: fixture.clientId }), { kind: "ALL" }, now),
      repository.listOrders(listFilters({ branchId: fixture.branchId }), { kind: "ALL" }, now),
      repository.listOrders(listFilters({ technicianId: fixture.technicianId }), { kind: "ALL" }, now),
      repository.listOrders(listFilters({ serviceTypeId: fixture.serviceTypeId }), { kind: "ALL" }, now),
    ]);
    const enumPage = await repository.listOrders(
      listFilters({
        search: fixture.suffix,
        status: ["PENDING", "IN_PROGRESS"],
        priority: ["HIGH", "LOW"],
      }),
      { kind: "ALL" }, now,
    );
    const scheduled = await repository.listOrders(
      listFilters({
        search: fixture.suffix,
        scheduledFrom: new Date("2026-08-01T12:30:00.000Z"),
        scheduledTo: new Date("2026-08-01T13:30:00.000Z"),
      }),
      { kind: "ALL" }, now,
    );
    const overdue = await repository.listOrders(
      listFilters({ search: fixture.suffix, overdue: true }), { kind: "ALL" }, now,
    );

    expect(byOrder.items.map(({ id }) => id)).toEqual([fixture.activeOrderId]);
    expect(byProblem.items.map(({ id }) => id)).toEqual([fixture.activeOrderId]);
    expect(byClient.totalItems).toBe(3);
    expect(byBranch.totalItems).toBe(3);
    expect(byIds.map((page) => page.totalItems)).toEqual([3, 3, 2, 3]);
    expect(enumPage.items.map(({ id }) => id)).toEqual(
      expect.arrayContaining([fixture.activeOrderId, fixture.historicalOrderId]),
    );
    expect(scheduled.items.map(({ id }) => id)).toEqual([fixture.historicalOrderId]);
    expect(overdue.items.map(({ id }) => id)).toEqual([fixture.activeOrderId]);
  });

  it("uses stable null-last ordering, pagination, and excludes soft-deleted orders", async () => {
    const repository = createOrdersReadRepository(database);
    const all = await repository.listOrders(
      listFilters({ search: fixture.suffix }), { kind: "ALL" }, now,
    );
    const first = await repository.listOrders(
      listFilters({ search: fixture.suffix, pageSize: 1 }), { kind: "ALL" }, now,
    );
    const second = await repository.listOrders(
      listFilters({ search: fixture.suffix, page: 2, pageSize: 1 }), { kind: "ALL" }, now,
    );

    expect(all.items.map(({ id }) => id)).toEqual([
      fixture.activeOrderId,
      fixture.historicalOrderId,
      fixture.completedOrderId,
    ]);
    expect(all.items.map(({ id }) => id)).not.toContain(fixture.deletedOrderId);
    expect(first.items.map(({ id }) => id)).toEqual([fixture.activeOrderId]);
    expect(second.items.map(({ id }) => id)).toEqual([fixture.historicalOrderId]);
  });

  it("returns null for unauthorized detail and history while paging owned history", async () => {
    const repository = createOrdersReadRepository(database);
    const ownDetail = await repository.findOrderById(fixture.activeOrderId, {
      kind: "TECHNICIAN",
      technicianId: fixture.technicianId,
    });
    const deniedDetail = await repository.findOrderById(fixture.completedOrderId, {
      kind: "TECHNICIAN",
      technicianId: fixture.technicianId,
    });
    const ownHistory = await repository.listOrderHistory(
      fixture.activeOrderId,
      { page: 1, pageSize: 1 },
      { kind: "TECHNICIAN", technicianId: fixture.technicianId },
    );
    const deniedHistory = await repository.listOrderHistory(
      fixture.activeOrderId,
      { page: 1, pageSize: 1 },
      { kind: "TECHNICIAN", technicianId: fixture.otherTechnicianId },
    );

    expect(ownDetail?.id).toBe(fixture.activeOrderId);
    expect(deniedDetail).toBeNull();
    expect(ownHistory).toMatchObject({ totalItems: 2 });
    expect(ownHistory?.items).toHaveLength(1);
    expect(deniedHistory).toBeNull();
  });
});
