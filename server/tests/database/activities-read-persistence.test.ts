import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivitiesReadRepository } from "../../src/activities/activities.read.repository.js";
import type { ActivityListFilters } from "../../src/activities/activities.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";
import {
  createActivitiesReadFixture,
  removeActivitiesReadFixture,
  type ActivitiesReadFixture,
} from "./activities-test-data.js";

function listFilters(
  overrides: Partial<ActivityListFilters> = {},
): ActivityListFilters {
  return { page: 1, pageSize: 20, ...overrides };
}

afterAll(disconnectTestDatabase);

describe("activities read repository", () => {
  let fixture: ActivitiesReadFixture;

  beforeAll(async () => {
    fixture = await createActivitiesReadFixture(database);
  });
  afterAll(async () => {
    await removeActivitiesReadFixture(database, fixture);
  });

  it("lists only active activity types in display, name and id order", async () => {
    const types = await createActivitiesReadRepository(database).listActivityTypes();

    const matching = types.filter((type) => type.code.startsWith(`ACT-${fixture.suffix}`));
    expect(matching.map(({ id }) => id)).toEqual([
      fixture.catalogTieFirstTypeId,
      fixture.catalogTieSecondTypeId,
      fixture.primaryTypeId,
      fixture.secondaryTypeId,
    ]);
  });

  it("applies every list filter without including soft-deleted activities", async () => {
    const repository = createActivitiesReadRepository(database);
    const common = { kind: "ALL" } as const;
    const status = await repository.listActivities(listFilters({ search: fixture.suffix, status: ["PENDING"] }), common);
    const type = await repository.listActivities(listFilters({ activityTypeId: fixture.secondaryTypeId }), common);
    const client = await repository.listActivities(listFilters({ clientId: fixture.secondaryClientId }), common);
    const branch = await repository.listActivities(listFilters({ branchId: fixture.secondaryBranchId }), common);
    const order = await repository.listActivities(listFilters({ orderId: fixture.primaryOrderId }), common);
    const technician = await repository.listActivities(listFilters({ technicianId: fixture.searchTechnicianId }), common);
    const startedFrom = await repository.listActivities(listFilters({ search: fixture.suffix, startedFrom: new Date("2026-08-01T08:30:00.000Z") }), common);
    const startedTo = await repository.listActivities(listFilters({ search: fixture.suffix, startedTo: new Date("2026-08-01T08:30:00.000Z") }), common);

    expect(status).toMatchObject({
      items: [
        { id: fixture.pendingActivityId },
        { id: fixture.createdAtTieThirdId },
        { id: fixture.createdAtTieSecondId },
        { id: fixture.createdAtTieFirstId },
      ],
      totalItems: 4,
    });
    expect(type.items.map(({ id }) => id)).toEqual([fixture.runningActivityId]);
    expect(client.items.map(({ id }) => id)).toEqual([fixture.runningActivityId]);
    expect(branch.items.map(({ id }) => id)).toEqual([fixture.runningActivityId]);
    expect(order.items.map(({ id }) => id)).toEqual([fixture.pendingActivityId]);
    expect(technician.items.map(({ id }) => id)).toEqual([
      fixture.createdAtTieThirdId,
      fixture.createdAtTieSecondId,
      fixture.createdAtTieFirstId,
    ]);
    expect(startedFrom.items.map(({ id }) => id)).toEqual([fixture.runningActivityId]);
    expect(startedTo.items.map(({ id }) => id)).toEqual([fixture.completedActivityId]);
  });

  it("searches descriptions, results, orders, clients and technicians case-insensitively", async () => {
    const repository = createActivitiesReadRepository(database);
    const common = { kind: "ALL" } as const;
    const description = await repository.listActivities(listFilters({ search: `DESCRIPCIÓN PENDIENTE ${fixture.suffix}` }), common);
    const result = await repository.listActivities(listFilters({ search: `resultado histórico ${fixture.suffix}` }), common);
    const order = await repository.listActivities(listFilters({ search: `act-${fixture.suffix}-001` }), common);
    const client = await repository.listActivities(listFilters({ search: `CLIENTE SECUNDARIO ${fixture.suffix}` }), common);
    const technician = await repository.listActivities(listFilters({ search: `técnico buscable ${fixture.suffix}` }), common);

    expect(description.items.map(({ id }) => id)).toEqual([fixture.pendingActivityId]);
    expect(result.items.map(({ id }) => id)).toEqual([fixture.runningActivityId]);
    expect(order.items.map(({ id }) => id)).toEqual([fixture.pendingActivityId]);
    expect(client.items.map(({ id }) => id)).toEqual([fixture.runningActivityId]);
    expect(technician.totalItems).toBe(3);
  });

  it("orders equal timestamps by descending id and returns stable empty pages", async () => {
    const repository = createActivitiesReadRepository(database);
    const first = await repository.listActivities(listFilters({ search: fixture.suffix, pageSize: 2 }), { kind: "ALL" });
    const second = await repository.listActivities(listFilters({ search: fixture.suffix, page: 2, pageSize: 2 }), { kind: "ALL" });
    const empty = await repository.listActivities(listFilters({ search: fixture.suffix, page: 5, pageSize: 2 }), { kind: "ALL" });

    expect(first.items.map(({ id }) => id)).toEqual([
      fixture.pendingActivityId,
      fixture.runningActivityId,
    ]);
    expect(second.items.map(({ id }) => id)).toEqual([
      fixture.completedActivityId,
      fixture.createdAtTieThirdId,
    ]);
    expect(empty).toEqual({ items: [], totalItems: 6 });
  });

  it("scopes technicians to current and historical participations while hiding foreign, deleted and absent details", async () => {
    const repository = createActivitiesReadRepository(database);
    const ownScope = { kind: "TECHNICIAN", technicianId: fixture.technicianId } as const;
    const ownPage = await repository.listActivities(listFilters(), ownScope);
    const current = await repository.findActivityById(fixture.pendingActivityId, ownScope);
    const historical = await repository.findActivityById(fixture.runningActivityId, ownScope);
    const foreign = await repository.findActivityById(fixture.completedActivityId, ownScope);
    const deleted = await repository.findActivityById(fixture.deletedActivityId, { kind: "ALL" });
    const absent = await repository.findActivityById("00000000-0000-4000-8000-000000000000", ownScope);

    expect(ownPage.items.map(({ id }) => id)).toEqual([
      fixture.pendingActivityId,
      fixture.runningActivityId,
    ]);
    expect(current?.id).toBe(fixture.pendingActivityId);
    expect(historical?.id).toBe(fixture.runningActivityId);
    expect([foreign, deleted, absent]).toEqual([null, null, null]);
  });

  it("excludes activities whose client, branch, type or order parent is deleted", async () => {
    const repository = createActivitiesReadRepository(database);
    const all = await repository.listActivities(listFilters({ search: fixture.suffix }), { kind: "ALL" });
    const deletedParents = [
      fixture.deletedClientActivityId,
      fixture.deletedBranchActivityId,
      fixture.deletedTypeActivityId,
      fixture.deletedOrderActivityId,
    ];
    const details = [];
    for (const id of deletedParents) {
      details.push(await repository.findActivityById(id, { kind: "ALL" }));
    }

    expect(all).toMatchObject({
      items: [
        { id: fixture.pendingActivityId },
        { id: fixture.runningActivityId },
        { id: fixture.completedActivityId },
        { id: fixture.createdAtTieThirdId },
        { id: fixture.createdAtTieSecondId },
        { id: fixture.createdAtTieFirstId },
      ],
      totalItems: 6,
    });
    expect(details).toEqual([null, null, null, null]);
  });
});
