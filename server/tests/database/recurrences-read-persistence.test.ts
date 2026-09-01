import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRecurrencesReadRepository } from "../../src/recurrences/recurrences.read.repository.js";
import { createRecurrencesSummaryRepository } from "../../src/recurrences/recurrences.summary.repository.js";
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

  describe("filtered summary aggregates", () => {
    const summaryIds = {
      otherClient: "83100000-0000-4000-8000-000000000001",
      otherBranch: "83100000-0000-4000-8000-000000000002",
      otherOrder: "83100000-0000-4000-8000-000000000003",
      otherRecurrence: "83100000-0000-4000-8000-000000000004",
      otherSnapshot: "83100000-0000-4000-8000-000000000005",
    } as const;
    const additionalOrderIds = [
      "83100000-0000-4000-8000-000000000011",
      "83100000-0000-4000-8000-000000000012",
      "83100000-0000-4000-8000-000000000013",
      "83100000-0000-4000-8000-000000000014",
      "83100000-0000-4000-8000-000000000015",
      "83100000-0000-4000-8000-000000000016",
      "83100000-0000-4000-8000-000000000017",
      "83100000-0000-4000-8000-000000000018",
    ] as const;
    const detectedFrom = new Date("2026-08-01T00:00:00-06:00");
    const detectedTo = new Date("2026-08-31T23:59:59.999-06:00");

    beforeAll(async () => {
      await database.ordenTrabajo.update({
        where: { id: fixture.originalOrderId },
        data: { status: "COMPLETED", endedAt: new Date("2026-08-04T12:00:00.000Z") },
      });
      await database.ordenTrabajo.update({
        where: { id: fixture.correctionOrderId },
        data: { status: "COMPLETED", endedAt: new Date("2026-08-08T12:00:00.000Z") },
      });
      await database.cliente.create({
        data: { id: summaryIds.otherClient, code: "RR-OTHER-CLIENT", tradeName: "Read Other Client" },
      });
      await database.sucursalCliente.create({
        data: {
          id: summaryIds.otherBranch,
          clienteId: summaryIds.otherClient,
          code: "RR-OTHER-BRANCH",
          name: "Read Other Branch",
          address: "Other fixture address",
        },
      });
      await database.ordenTrabajo.createMany({
        data: [
          ...additionalOrderIds.map((id, index) => ({
            id,
            orderNumber: `OT-READ-SUMMARY-${index + 1}`,
            sucursalId: fixture.branchId,
            tipoServicioId: "83000000-0000-4000-8000-000000000023",
            status: "COMPLETED" as const,
            endedAt: new Date(`2026-08-${String(index + 10).padStart(2, "0")}T12:00:00.000Z`),
            reportedProblem: `Summary base order ${index + 1}`,
          })),
          {
            id: summaryIds.otherOrder,
            orderNumber: "OT-READ-SUMMARY-OTHER",
            sucursalId: summaryIds.otherBranch,
            tipoServicioId: "83000000-0000-4000-8000-000000000023",
            status: "COMPLETED",
            endedAt: new Date("2026-08-18T12:00:00.000Z"),
            reportedProblem: "Summary order for another client",
          },
        ],
      });
      await database.ordenTecnico.createMany({
        data: [
          ...additionalOrderIds.map((ordenId, index) => ({
            ordenId,
            tecnicoId: index < 5 ? fixture.technicianId : fixture.foreignTechnicianId,
            role: "PRIMARY" as const,
            assignedAt: new Date("2026-08-01T08:00:00.000Z"),
            unassignedAt: new Date("2026-08-20T08:00:00.000Z"),
          })),
          {
            ordenId: summaryIds.otherOrder,
            tecnicoId: fixture.foreignTechnicianId,
            role: "PRIMARY",
            assignedAt: new Date("2026-08-01T08:00:00.000Z"),
            unassignedAt: new Date("2026-08-20T08:00:00.000Z"),
          },
        ],
      });
      await database.reincidencia.update({
        where: { id: fixture.reporterRecurrenceId },
        data: { additionalMinutes: 120, estimatedCost: "4000.00" },
      });
      await database.reincidencia.update({
        where: { id: fixture.originalParticipantRecurrenceId },
        data: { additionalMinutes: 60, estimatedCost: "2240.00" },
      });
      await database.reincidencia.create({
        data: {
          id: summaryIds.otherRecurrence,
          recurrenceNumber: "RI-2037-9199",
          originalOrderId: summaryIds.otherOrder,
          reportedById: fixture.supervisorUserId,
          status: "OPEN",
          impact: "HIGH",
          detectedProblem: "Case for another client and technician",
          detectedAt: new Date("2026-08-07T12:00:00.000Z"),
          additionalMinutes: 999,
          estimatedCost: "9999.99",
        },
      });
      await database.reincidenciaTecnico.create({
        data: {
          id: summaryIds.otherSnapshot,
          reincidenciaId: summaryIds.otherRecurrence,
          tecnicoId: fixture.foreignTechnicianId,
          participation: "ORIGINAL_RESPONSIBLE",
        },
      });
      await database.reincidenciaOrden.createMany({
        data: [
          { reincidenciaId: fixture.reporterRecurrenceId, ordenId: additionalOrderIds[0], visitNumber: 1 },
          { reincidenciaId: fixture.reporterRecurrenceId, ordenId: additionalOrderIds[1], visitNumber: 2 },
          { reincidenciaId: fixture.originalParticipantRecurrenceId, ordenId: additionalOrderIds[2], visitNumber: 1 },
        ],
      });
    });

    afterAll(async () => {
      const createdOrderIds = [...additionalOrderIds, summaryIds.otherOrder];
      await database.reincidenciaTecnico.deleteMany({ where: { reincidenciaId: summaryIds.otherRecurrence } });
      await database.reincidenciaOrden.deleteMany({ where: { ordenId: { in: createdOrderIds } } });
      await database.reincidencia.deleteMany({ where: { id: summaryIds.otherRecurrence } });
      await database.ordenTecnico.deleteMany({ where: { ordenId: { in: createdOrderIds } } });
      await database.ordenTrabajo.deleteMany({ where: { id: { in: createdOrderIds } } });
      await database.sucursalCliente.deleteMany({ where: { id: summaryIds.otherBranch } });
      await database.cliente.deleteMany({ where: { id: summaryIds.otherClient } });
    });

    // Mutation caught: hydrating/filtering the wrong rows, summing costs as JS numbers,
    // or applying recurrence-only filters to the denominator changes these literals.
    it("calculates exact filtered metrics without leaking another client", async () => {
      const repository = createRecurrencesSummaryRepository(database);

      await expect(repository.summarizeRecurrences({
        status: ["OPEN", "ANALYSIS"],
        clientId: fixture.clientId,
        branchId: fixture.branchId,
        detectedFrom,
        detectedTo,
      }, { kind: "ALL" })).resolves.toEqual({
        totalCases: 2,
        openCases: 2,
        highImpactCases: 1,
        additionalVisits: 3,
        additionalMinutes: 180,
        estimatedCost: "6240.00",
        completedBaseOrders: 10,
        recurrenceRate: "20.00",
      });
    });

    // Mutation caught: the extracted predicate diverges between list and summary,
    // or base orders incorrectly inherit search/status/impact/responsibility/originalOrderId.
    it("preserves list filters when sharing the recurrence predicate", async () => {
      const filters = {
        search: "ORIGINAL PARTICIPANT",
        status: ["ANALYSIS" as const],
        impact: ["MEDIUM" as const],
        responsibility: ["EQUIPMENT" as const],
        originalOrderId: fixture.originalOrderId,
        technicianId: fixture.technicianId,
        clientId: fixture.clientId,
        branchId: fixture.branchId,
        detectedFrom,
        detectedTo,
      };
      const list = await createRecurrencesReadRepository(database).listRecurrences(
        { ...filters, page: 1, pageSize: 20 },
        { kind: "ALL" },
      );
      const summary = await createRecurrencesSummaryRepository(database)
        .summarizeRecurrences(filters, { kind: "ALL" });

      expect(list).toMatchObject({
        items: [{ id: fixture.originalParticipantRecurrenceId }],
        totalItems: 1,
      });
      expect(summary).toEqual({
        totalCases: 1,
        openCases: 1,
        highImpactCases: 0,
        additionalVisits: 1,
        additionalMinutes: 60,
        estimatedCost: "2240.00",
        completedBaseOrders: 7,
        recurrenceRate: "14.29",
      });
    });

    // Mutation caught: technician scope is omitted from either recurrence or base-order aggregates.
    it("applies own-technician scope to cases and completed base orders", async () => {
      const summary = await createRecurrencesSummaryRepository(database).summarizeRecurrences({
        status: ["OPEN", "ANALYSIS"],
        clientId: fixture.clientId,
        branchId: fixture.branchId,
        detectedFrom,
        detectedTo,
      }, { kind: "TECHNICIAN", technicianId: fixture.technicianId });

      expect(summary).toMatchObject({
        totalCases: 2,
        completedBaseOrders: 7,
        recurrenceRate: "28.57",
      });
    });

    // Mutation caught: zero denominators yield NaN/Infinity or lose fixed decimal formatting.
    it("returns a fixed zero rate when no completed base orders match", async () => {
      const repository = createRecurrencesSummaryRepository(database);

      await expect(repository.summarizeRecurrences({
        clientId: fixture.clientId,
        branchId: fixture.branchId,
        detectedFrom: new Date("2026-09-01T00:00:00-06:00"),
        detectedTo: new Date("2026-09-30T23:59:59.999-06:00"),
      }, { kind: "ALL" })).resolves.toEqual({
        totalCases: 0,
        openCases: 0,
        highImpactCases: 0,
        additionalVisits: 0,
        additionalMinutes: 0,
        estimatedCost: "0.00",
        completedBaseOrders: 0,
        recurrenceRate: "0.00",
      });
    });
  });
});
