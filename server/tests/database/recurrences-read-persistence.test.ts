import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRecurrencesReadRepository } from "../../src/recurrences/recurrences.read.repository.js";
import type { RecurrenceListFilters } from "../../src/recurrences/recurrences.types.js";
import { database, disconnectTestDatabase } from "./database-test-context.js";
import {
  createRecurrencesReadFixture,
  removeRecurrencesReadFixture,
  type RecurrencesReadFixture,
} from "./recurrences-test-data.js";

function listFilters(
  overrides: Partial<RecurrenceListFilters> = {},
): RecurrenceListFilters {
  return { page: 1, pageSize: 20, ...overrides };
}

afterAll(disconnectTestDatabase);

describe("recurrences read repository", () => {
  let fixture: RecurrencesReadFixture;

  beforeAll(async () => {
    fixture = await createRecurrencesReadFixture(database);
  });
  afterAll(async () => {
    await removeRecurrencesReadFixture(database);
  });

  function fixtureFilters(
    overrides: Partial<RecurrenceListFilters> = {},
  ): RecurrenceListFilters {
    return listFilters({ originalOrderId: fixture.originalOrderId, ...overrides });
  }

  // Mutation caught: catalog admits inactive or soft-deleted causes, or changes display/code order.
  it("lists only active causes in display-order then code order", async () => {
    const causes = await createRecurrencesReadRepository(database).listCauses();

    expect(causes.filter(({ code }) => code.startsWith("RR-")).map(({ id }) => id)).toEqual([
      fixture.activeCauseId,
      fixture.secondaryCauseId,
    ]);
  });

  // Mutation caught: removing the reportedBy -> tecnico ownership branch hides reporter-owned history.
  it("keeps reporter-owned history visible after the original assignment closes", async () => {
    const repository = createRecurrencesReadRepository(database);
    const scope = { kind: "TECHNICIAN", technicianId: fixture.technicianId } as const;
    const page = await repository.listRecurrences(listFilters(), scope);
    const detail = await repository.findRecurrence(fixture.reporterRecurrenceId, scope);

    expect(page.items.map(({ id }) => id)).toContain(fixture.reporterRecurrenceId);
    expect(detail?.id).toBe(fixture.reporterRecurrenceId);
  });

  // Mutation caught: removing the reincidenciaTecnico snapshot branch hides original/correction participants.
  it("keeps original and correction participation snapshots visible after both assignments close", async () => {
    const repository = createRecurrencesReadRepository(database);
    const scope = { kind: "TECHNICIAN", technicianId: fixture.technicianId } as const;
    const page = await repository.listRecurrences(listFilters(), scope);
    const original = await repository.findRecurrence(fixture.originalParticipantRecurrenceId, scope);
    const correction = await repository.findRecurrence(fixture.correctionParticipantRecurrenceId, scope);

    expect(page.items.map(({ id }) => id)).toEqual([
      fixture.reporterRecurrenceId,
      fixture.correctionParticipantRecurrenceId,
      fixture.originalParticipantRecurrenceId,
    ]);
    expect(original?.id).toBe(fixture.originalParticipantRecurrenceId);
    expect(correction?.id).toBe(fixture.correctionParticipantRecurrenceId);
  });

  // Mutation caught: findFirst ignores scope and leaks a foreign recurrence instead of returning the null boundary.
  it("returns the same null boundary for foreign and absent details", async () => {
    const repository = createRecurrencesReadRepository(database);
    const scope = { kind: "TECHNICIAN", technicianId: fixture.technicianId } as const;

    const foreign = await repository.findRecurrence(fixture.foreignRecurrenceId, scope);
    const absent = await repository.findRecurrence("83000000-0000-4000-8000-000000000099", scope);

    expect([foreign, absent]).toEqual([null, null]);
  });

  // Mutation caught: detail reuses catalog visibility and drops the stored inactive/deleted cause relation.
  it("keeps inactive and deleted historical causes in detail while excluding them from catalog", async () => {
    const repository = createRecurrencesReadRepository(database);
    const catalog = await repository.listCauses();
    const inactive = await repository.findRecurrence(fixture.inactiveCauseRecurrenceId, { kind: "ALL" });
    const deleted = await repository.findRecurrence(fixture.deletedCauseRecurrenceId, { kind: "ALL" });

    expect(catalog.map(({ id }) => id)).not.toEqual(expect.arrayContaining([
      fixture.inactiveCauseId,
      fixture.deletedCauseId,
    ]));
    expect(inactive?.causa?.id).toBe(fixture.inactiveCauseId);
    expect(deleted?.causa?.id).toBe(fixture.deletedCauseId);
  });

  // Mutation caught: list ignores a filter, uses an unstable tie-breaker, or returns a count from a different scope.
  it("applies filters and returns exact totals with detectedAt-descending id-descending pages", async () => {
    const repository = createRecurrencesReadRepository(database);
    const allScope = { kind: "ALL" } as const;
    const byStatus = await repository.listRecurrences(fixtureFilters({ status: ["ANALYSIS"] }), allScope);
    const byImpact = await repository.listRecurrences(fixtureFilters({ impact: ["HIGH"] }), allScope);
    const byResponsibility = await repository.listRecurrences(fixtureFilters({ responsibility: ["CLIENT"] }), allScope);
    const byOrder = await repository.listRecurrences(fixtureFilters(), allScope);
    const byTechnician = await repository.listRecurrences(fixtureFilters({ technicianId: fixture.technicianId }), allScope);
    const byClient = await repository.listRecurrences(fixtureFilters({ clientId: fixture.clientId }), allScope);
    const byBranch = await repository.listRecurrences(fixtureFilters({ branchId: fixture.branchId }), allScope);
    const byForeignClient = await repository.listRecurrences(fixtureFilters({ clientId: "83000000-0000-4000-8000-000000000099" }), allScope);
    const byForeignBranch = await repository.listRecurrences(fixtureFilters({ branchId: "83000000-0000-4000-8000-000000000099" }), allScope);
    const byDate = await repository.listRecurrences(fixtureFilters({ detectedFrom: new Date("2026-08-05T00:00:00.000Z"), detectedTo: new Date("2026-08-05T23:59:59.999Z") }), allScope);
    const first = await repository.listRecurrences(fixtureFilters({ pageSize: 2 }), allScope);
    const second = await repository.listRecurrences(fixtureFilters({ page: 2, pageSize: 2 }), allScope);
    const empty = await repository.listRecurrences(fixtureFilters({ page: 5, pageSize: 2 }), { kind: "TECHNICIAN", technicianId: fixture.technicianId });

    expect(byStatus).toMatchObject({ items: [{ id: fixture.originalParticipantRecurrenceId }], totalItems: 1 });
    expect(byImpact.totalItems).toBe(2);
    expect(byResponsibility).toMatchObject({ items: [{ id: fixture.correctionParticipantRecurrenceId }], totalItems: 1 });
    expect(byOrder.totalItems).toBe(6);
    expect(byTechnician.items.map(({ id }) => id)).toEqual([
      fixture.correctionParticipantRecurrenceId,
      fixture.originalParticipantRecurrenceId,
    ]);
    expect(byClient.totalItems).toBe(6);
    expect(byBranch.totalItems).toBe(6);
    expect(byForeignClient).toEqual({ items: [], totalItems: 0 });
    expect(byForeignBranch).toEqual({ items: [], totalItems: 0 });
    expect(byDate.items.map(({ id }) => id)).toEqual([
      fixture.correctionParticipantRecurrenceId,
      fixture.originalParticipantRecurrenceId,
    ]);
    expect(first).toMatchObject({
      items: [{ id: fixture.reporterRecurrenceId }, { id: fixture.correctionParticipantRecurrenceId }],
      totalItems: 6,
    });
    expect(second.items.map(({ id }) => id)).toEqual([
      fixture.originalParticipantRecurrenceId,
      fixture.foreignRecurrenceId,
    ]);
    expect(empty).toEqual({ items: [], totalItems: 3 });
  });

  // Mutation caught: search omits one of recurrence number, order, problem, client, or branch fields.
  it("searches recurrence number, order number, problem, client and branch case-insensitively", async () => {
    const repository = createRecurrencesReadRepository(database);
    const scope = { kind: "ALL" } as const;
    const recurrenceNumber = await repository.listRecurrences(listFilters({ search: "ri-2037-9101" }), scope);
    const orderNumber = await repository.listRecurrences(listFilters({ search: "ot-read-original" }), scope);
    const problem = await repository.listRecurrences(listFilters({ search: "REPORTER-OWNED SENSOR" }), scope);
    const client = await repository.listRecurrences(listFilters({ search: "read client" }), scope);
    const branch = await repository.listRecurrences(listFilters({ search: "READ BRANCH" }), scope);

    expect(recurrenceNumber.items.map(({ id }) => id)).toEqual([fixture.reporterRecurrenceId]);
    expect(orderNumber.totalItems).toBe(6);
    expect(problem.items.map(({ id }) => id)).toEqual([fixture.reporterRecurrenceId]);
    expect(client.totalItems).toBe(6);
    expect(branch.totalItems).toBe(6);
  });

  // Mutation caught: ALL scope is accidentally narrowed or an authorized empty page is conflated with denied detail.
  it("lets management see every fixture case while preserving an empty-page result separately from denied detail", async () => {
    const repository = createRecurrencesReadRepository(database);
    const management = await repository.listRecurrences(fixtureFilters(), { kind: "ALL" });
    const authorizedEmpty = await repository.listRecurrences(fixtureFilters({ page: 10 }), { kind: "ALL" });
    const denied = await repository.findRecurrence(fixture.foreignRecurrenceId, { kind: "TECHNICIAN", technicianId: fixture.technicianId });

    expect(management.totalItems).toBe(6);
    expect(authorizedEmpty).toEqual({ items: [], totalItems: 6 });
    expect(denied).toBeNull();
  });
});
