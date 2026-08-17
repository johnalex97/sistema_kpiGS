import { randomUUID } from "node:crypto";
import { NivelAccesoEvidencia, Prisma } from "../../generated/prisma/client.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvidencesReadRepository } from "../../src/evidences/evidences.read.repository.js";
import { createEvidencesMutationRepository } from "../../src/evidences/evidences.mutation.repository.js";
import type {
  CreateEvidencePersistenceInput,
  EvidenceActorContext,
  EvidenceListFilters,
} from "../../src/evidences/evidences.types.js";
import { seedDatabase } from "../../prisma/seed.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";
import {
  createEvidencesReadFixture,
  removeEvidencesReadFixture,
  type EvidencesReadFixture,
} from "./evidences-test-data.js";

beforeAll(() => seedDatabase(database));

const page: EvidenceListFilters = { page: 1, pageSize: 20 };

function managementActor(userId: string, technicianId: string | null = null): EvidenceActorContext {
  return { userId, technicianId, permissions: ["EVIDENCES_VIEW", "EVIDENCES_MANAGE"], requestId: "70000000-0000-4000-8000-000000000001" };
}

function technicianActor(userId: string, technicianId: string): EvidenceActorContext {
  return { userId, technicianId, permissions: ["EVIDENCES_VIEW"], requestId: "70000000-0000-4000-8000-000000000002" };
}

describe("evidence persistence", () => {
  it("persists hash metadata with its initial version", async () => {
    const [order, user] = await Promise.all([
      database.ordenTrabajo.findUniqueOrThrow({
        where: { orderNumber: "GS-2026-0001" },
      }),
      database.usuario.findUniqueOrThrow({
        where: { email: "admin.demo@geeksolution.example.test" },
      }),
    ]);
    const id = randomUUID();

    try {
      const evidence = await database.evidencia.create({
        data: {
          id,
          originalName: "integrity.pdf",
          storedName: `${id}.pdf`,
          mimeType: "application/pdf",
          fileExtension: "pdf",
          sizeBytes: 100n,
          storageKey: `test/${id}`,
          checksumSha256: "a".repeat(64),
          uploadedById: user.id,
          ordenId: order.id,
        },
        include: { uploadedBy: true, deletedBy: true },
      });

      expect(evidence).toMatchObject({
        id,
        checksumSha256: "a".repeat(64),
        version: 1,
        deletedAt: null,
        deletedById: null,
        deletionReason: null,
        uploadedBy: { id: user.id },
        deletedBy: null,
      });
    } finally {
      await database.evidencia.deleteMany({ where: { id } });
    }
  });

  it("requires archived evidence reasons to contain 10 through 500 characters", async () => {
    const [order, user] = await Promise.all([
      database.ordenTrabajo.findUniqueOrThrow({
        where: { orderNumber: "GS-2026-0001" },
      }),
      database.usuario.findUniqueOrThrow({
        where: { email: "admin.demo@geeksolution.example.test" },
      }),
    ]);
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const archivedEvidence = (id: string, deletionReason: string) => ({
      id,
      originalName: "archived.pdf",
      storedName: `${id}.pdf`,
      mimeType: "application/pdf",
      fileExtension: "pdf",
      sizeBytes: 100n,
      storageKey: `test/${id}`,
      checksumSha256: "a".repeat(64),
      uploadedById: user.id,
      ordenId: order.id,
      deletedAt: new Date("2026-08-17T12:00:00.000Z"),
      deletedById: user.id,
      deletionReason,
    });

    try {
      await expect(
        database.evidencia.create({
          data: archivedEvidence(ids[0]!, "x".repeat(9)),
        }),
      ).rejects.toThrow();
      await expect(
        database.evidencia.create({
          data: archivedEvidence(ids[1]!, "x".repeat(10)),
        }),
      ).resolves.toMatchObject({ deletionReason: "x".repeat(10) });
      await expect(
        database.evidencia.create({
          data: archivedEvidence(ids[2]!, "x".repeat(500)),
        }),
      ).resolves.toMatchObject({ deletionReason: "x".repeat(500) });
      await expect(
        database.evidencia.create({
          data: archivedEvidence(ids[3]!, "x".repeat(501)),
        }),
      ).rejects.toThrow();
    } finally {
      await database.evidencia.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("rejects the future CLIENT evidence level during phase 9", async () => {
    const [order, user] = await Promise.all([
      database.ordenTrabajo.findUniqueOrThrow({
        where: { orderNumber: "GS-2026-0001" },
      }),
      database.usuario.findUniqueOrThrow({
        where: { email: "admin.demo@geeksolution.example.test" },
      }),
    ]);
    const id = randomUUID();

    try {
      await expect(
        database.evidencia.create({
          data: {
            id,
            originalName: "client.pdf",
            storedName: `${id}.pdf`,
            mimeType: "application/pdf",
            fileExtension: "pdf",
            sizeBytes: 100n,
            storageKey: `test/${id}`,
            checksumSha256: "a".repeat(64),
            accessLevel: NivelAccesoEvidencia.CLIENT,
            uploadedById: user.id,
            ordenId: order.id,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await database.evidencia.deleteMany({ where: { id } });
    }
  });
});

describe("evidence read repository", () => {
  let fixture: EvidencesReadFixture;

  beforeAll(async () => {
    fixture = await createEvidencesReadFixture(database);
  });
  afterAll(async () => {
    await removeEvidencesReadFixture(database);
  });

  it("uses SQL visibility predicates for current and historical technician resources", async () => {
    const repository = createEvidencesReadRepository(database);
    const order = { type: "ORDER", id: fixture.activeOrderId } as const;
    const completedOrder = { type: "ORDER", id: fixture.completedOrderId } as const;
    const currentActivity = { type: "ACTIVITY", id: fixture.currentActivityId } as const;
    const historicalActivityResource = { type: "ACTIVITY", id: fixture.historicalActivityId } as const;
    const cancelledOrder = { type: "ORDER", id: fixture.cancelledOrderId } as const;
    const assigned = technicianActor(fixture.assignedUserId, fixture.assignedTechnicianId);
    const former = technicianActor(fixture.formerUserId, fixture.formerTechnicianId);
    const historicalActivity = technicianActor(fixture.historicalActivityUserId, fixture.historicalActivityTechnicianId);
    const foreign = technicianActor(fixture.foreignUserId, fixture.foreignTechnicianId);

    const assignedPage = await repository.listEvidence(order, page, assigned);
    expect(assignedPage?.items.map(({ accessLevel }) => accessLevel)).toEqual(["TECHNICIAN", "TECHNICIAN"]);
    expect(await repository.listEvidence(completedOrder, page, former)).not.toBeNull();
    expect(await repository.listEvidence(currentActivity, page, assigned)).not.toBeNull();
    expect(await repository.listEvidence(historicalActivityResource, page, historicalActivity)).not.toBeNull();
    expect(await repository.listEvidence(order, page, foreign)).toBeNull();
    expect(await repository.findUploadTarget(completedOrder, former)).toMatchObject({ status: "COMPLETED" });
    expect(await repository.findUploadTarget(historicalActivityResource, historicalActivity)).toMatchObject({ status: "COMPLETED" });
    expect(await repository.findUploadTarget(order, foreign)).toBeNull();
    expect(await repository.findUploadTarget(cancelledOrder, managementActor(fixture.supervisorUserId))).toMatchObject({ status: "CANCELLED" });
  });

  it("hides internal and archived evidence from technicians and makes absent and foreign downloads indistinguishable", async () => {
    const repository = createEvidencesReadRepository(database);
    const assigned = technicianActor(fixture.assignedUserId, fixture.assignedTechnicianId);
    const admin = managementActor(fixture.adminUserId);
    const foreign = technicianActor(fixture.foreignUserId, fixture.foreignTechnicianId);

    expect(await repository.findDownloadableEvidence(fixture.orderInternalEvidenceId, assigned)).toBeNull();
    expect(await repository.findDownloadableEvidence(fixture.orderArchivedEvidenceId, admin)).toBeNull();
    expect(await repository.findDownloadableEvidence(fixture.orderTechnicianEvidenceId, foreign)).toBeNull();
    expect(await repository.findDownloadableEvidence("00000000-0000-4000-8000-000000000000", assigned)).toBeNull();
    expect(await repository.findDownloadableEvidence(fixture.orderInternalEvidenceId, admin)).toMatchObject({ id: fixture.orderInternalEvidenceId });
  });

  it("denies an unlinked technician identity instead of promoting it to management access", async () => {
    const repository = createEvidencesReadRepository(database);
    const unlinkedTechnician: EvidenceActorContext = {
      userId: fixture.assignedUserId,
      technicianId: null,
      permissions: ["EVIDENCES_VIEW"],
      requestId: "70000000-0000-4000-8000-000000000003",
    };

    expect(await repository.listEvidence(
      { type: "ORDER", id: fixture.activeOrderId }, page, unlinkedTechnician,
    )).toBeNull();
    expect(await repository.findDownloadableEvidence(
      fixture.orderInternalEvidenceId, unlinkedTechnician,
    )).toBeNull();
    expect(await repository.findDownloadableEvidence(
      fixture.cancelledForeignEvidenceId, unlinkedTechnician,
    )).toBeNull();
  });

  it("keeps an elevated actor administrative even when it also has a technician profile", async () => {
    const repository = createEvidencesReadRepository(database);
    const manager = managementActor(
      fixture.supervisorUserId,
      fixture.managerTechnicianId,
    );

    const pageResult = await repository.listEvidence(
      { type: "ORDER", id: fixture.activeOrderId }, page, manager,
    );
    expect(pageResult?.totalItems).toBe(3);
    expect(pageResult?.items.map(({ id }) => id)).toContain(
      fixture.orderInternalEvidenceId,
    );
    await expect(repository.findDownloadableEvidence(
      fixture.orderInternalEvidenceId, manager,
    )).resolves.toMatchObject({ id: fixture.orderInternalEvidenceId });
  });

  it("orders evidence pages by createdAt and id descending, including page boundaries", async () => {
    const repository = createEvidencesReadRepository(database);
    const order = { type: "ORDER", id: fixture.activeOrderId } as const;
    const admin = managementActor(fixture.adminUserId);

    const first = await repository.listEvidence(order, { page: 1, pageSize: 1 }, admin);
    const second = await repository.listEvidence(order, { page: 2, pageSize: 1 }, admin);

    expect(first).toMatchObject({ totalItems: 3, items: [{ id: fixture.orderTechnicianTieEvidenceId }] });
    expect(second).toMatchObject({ items: [{ id: fixture.orderInternalEvidenceId }] });
  });

  it("keeps count and list in one repeatable-read snapshot", async () => {
    let receivedOptions: unknown;
    const transactionDatabase = {
      $transaction: async <T>(callback: (transaction: unknown) => Promise<T>, options: unknown) => {
        receivedOptions = options;
        return database.$transaction(callback as never, options as never) as Promise<T>;
      },
    };
    const repository = createEvidencesReadRepository(transactionDatabase as never);

    await expect(repository.listEvidence(
      { type: "ORDER", id: fixture.activeOrderId },
      page,
      managementActor(fixture.adminUserId),
    )).resolves.toMatchObject({ totalItems: 3, items: expect.any(Array) });
    expect(receivedOptions).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it("returns every metadata storage key, including archived and recurrence-linked records", async () => {
    const keys = await createEvidencesReadRepository(database).listMetadataStorageKeys();

    expect(keys).toEqual(expect.arrayContaining(fixture.storageKeys));
  });
});

afterAll(disconnectTestDatabase);

describe("evidence mutation repository", () => {
  let fixture: EvidencesReadFixture;
  const createdIds: string[] = [];
  const now = new Date("2026-08-17T15:30:00.000Z");
  const privateSnapshotFields = [
    "storageKey",
    "storedName",
    "originalName",
    "mimeType",
    "fileExtension",
    "uploadedById",
  ];

  function expectExactSnapshot(data: unknown, expected: object): void {
    expect(data).toEqual(expected);
    for (const field of privateSnapshotFields) {
      expect(data).not.toHaveProperty(field);
    }
  }

  beforeAll(async () => {
    fixture = await createEvidencesReadFixture(database);
  });
  afterAll(async () => {
    const created = await database.evidencia.findMany({
      where: { storageKey: { in: createdIds.map((id) => `files/2026/08/${id}.pdf`) } },
      select: { id: true },
    });
    await database.auditoria.deleteMany({ where: { entityId: { in: created.map(({ id }) => id) } } });
    await database.evidencia.deleteMany({ where: { id: { in: created.map(({ id }) => id) } } });
    await removeEvidencesReadFixture(database);
  });

  function inputFor(resource: CreateEvidencePersistenceInput["resource"]): CreateEvidencePersistenceInput {
    const id = randomUUID();
    createdIds.push(id);
    return {
      resource,
      originalName: "field-report.pdf",
      storedName: `${id}.pdf`,
      mimeType: "application/pdf",
      fileExtension: "pdf",
      sizeBytes: 321,
      storageKey: `files/2026/08/${id}.pdf`,
      checksumSha256: "c".repeat(64),
      description: "Initial report",
      accessLevel: "INTERNAL",
    };
  }

  it("locks a valid target before promotion and atomically persists uploaded metadata and audit", async () => {
    const events: string[] = [];
    const transactionDatabase = {
      $transaction: async <T>(callback: (transaction: unknown) => Promise<T>, options: unknown) => database.$transaction(
        (transaction) => callback(new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "$queryRaw") {
              return async (...args: unknown[]) => {
                events.push("lock");
                return Reflect.apply(Reflect.get(target, property), target, args);
              };
            }
            if (property === "evidencia") {
              return new Proxy(Reflect.get(target, property, receiver), {
                get(delegate, delegateProperty, delegateReceiver) {
                  if (delegateProperty === "create") {
                    return async (...args: unknown[]) => {
                      events.push("metadata");
                      return Reflect.apply(Reflect.get(delegate, delegateProperty), delegate, args);
                    };
                  }
                  return Reflect.get(delegate, delegateProperty, delegateReceiver);
                },
              });
            }
            if (property === "auditoria") {
              return new Proxy(Reflect.get(target, property, receiver), {
                get(delegate, delegateProperty, delegateReceiver) {
                  if (delegateProperty === "create") {
                    return async (...args: unknown[]) => {
                      events.push("audit");
                      return Reflect.apply(Reflect.get(delegate, delegateProperty), delegate, args);
                    };
                  }
                  return Reflect.get(delegate, delegateProperty, delegateReceiver);
                },
              });
            }
            return Reflect.get(target, property, receiver);
          },
        }) as unknown),
        options as never,
      ) as Promise<T>,
    };
    const repository = createEvidencesMutationRepository(transactionDatabase as never);
    const input = inputFor({ type: "ORDER", id: fixture.activeOrderId });

    const result = await repository.createEvidence(
      input,
      managementActor(fixture.adminUserId),
      now,
      async () => { events.push("promote"); },
    );

    expect(events).toEqual(["lock", "promote", "metadata", "audit"]);
    expect(result).toMatchObject({ kind: "CREATED", evidence: { storageKey: input.storageKey, version: 1 } });
    const audit = await database.auditoria.findFirstOrThrow({ where: { entityId: result.kind === "CREATED" ? result.evidence.id : "" } });
    expect(audit).toMatchObject({ action: "EVIDENCE_UPLOADED", entity: "Evidencia", userId: fixture.adminUserId, beforeData: null, reason: null });
    expectExactSnapshot(audit.afterData, {
      resourceType: "ORDER",
      resourceId: fixture.activeOrderId,
      checksumSha256: input.checksumSha256,
      sizeBytes: input.sizeBytes,
      accessLevel: "INTERNAL",
      actorId: fixture.adminUserId,
      version: 1,
      description: input.description,
    });
  });

  it("rejects deleted or cancelled targets before promotion and accepts completed targets", async () => {
    const repository = createEvidencesMutationRepository(database);
    const activeOrder = await database.ordenTrabajo.findUniqueOrThrow({
      where: { id: fixture.activeOrderId },
      select: { sucursalId: true, tipoServicioId: true },
    });
    const deletedOrder = await database.ordenTrabajo.create({
      data: {
        id: randomUUID(),
        orderNumber: `EVD-DEL-${randomUUID().slice(0, 8)}`,
        sucursalId: activeOrder.sucursalId,
        tipoServicioId: activeOrder.tipoServicioId,
        reportedProblem: "Deleted evidence target",
        deletedAt: now,
      },
    });
    let deletedPromoted = false;
    const deleted = await repository.createEvidence(
      inputFor({ type: "ORDER", id: deletedOrder.id }),
      managementActor(fixture.adminUserId), now,
      async () => { deletedPromoted = true; },
    );
    let cancelledPromoted = false;
    const cancelled = await repository.createEvidence(
      inputFor({ type: "ORDER", id: fixture.cancelledOrderId }),
      managementActor(fixture.adminUserId), now,
      async () => { cancelledPromoted = true; },
    );
    let completedPromoted = false;
    const completed = await repository.createEvidence(
      inputFor({ type: "ORDER", id: fixture.completedOrderId }),
      managementActor(fixture.adminUserId), now,
      async () => { completedPromoted = true; },
    );

    expect(cancelled).toEqual({ kind: "RESOURCE_CANCELLED" });
    expect(cancelledPromoted).toBe(false);
    expect(deleted).toEqual({ kind: "RESOURCE_NOT_FOUND" });
    expect(deletedPromoted).toBe(false);
    expect(completed).toMatchObject({ kind: "CREATED", evidence: { orden: { id: fixture.completedOrderId } } });
    expect(completedPromoted).toBe(true);
    await database.ordenTrabajo.delete({ where: { id: deletedOrder.id } });
  });

  it("rolls back evidence metadata when uploaded audit creation fails", async () => {
    const failingAuditDatabase = {
      $transaction: async <T>(callback: (transaction: unknown) => Promise<T>, options: unknown) => database.$transaction(
        (transaction) => callback(new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "auditoria") {
              return new Proxy(Reflect.get(target, property, receiver), {
                get(delegate, delegateProperty, delegateReceiver) {
                  if (delegateProperty === "create") return async () => { throw new Error("forced audit failure"); };
                  return Reflect.get(delegate, delegateProperty, delegateReceiver);
                },
              });
            }
            return Reflect.get(target, property, receiver);
          },
        }) as unknown), options as never,
      ) as Promise<T>,
    };
    const input = inputFor({ type: "ACTIVITY", id: fixture.currentActivityId });
    let promoted = false;

    await expect(createEvidencesMutationRepository(failingAuditDatabase as never).createEvidence(
      input, managementActor(fixture.adminUserId), now, async () => { promoted = true; },
    )).rejects.toThrow("forced audit failure");
    expect(promoted).toBe(true);
    await expect(database.evidencia.findUnique({ where: { storageKey: input.storageKey } })).resolves.toBeNull();
  });

  it("updates once with an exact before/after audit snapshot and rejects stale versions without audit", async () => {
    const repository = createEvidencesMutationRepository(database);
    const id = fixture.orderInternalEvidenceId;
    const original = await database.evidencia.findUniqueOrThrow({ where: { id } });

    const updated = await repository.updateEvidence(id, {
      description: "Management correction", accessLevel: "TECHNICIAN", version: original.version,
    }, managementActor(fixture.adminUserId), now);
    const stale = await repository.updateEvidence(id, {
      description: "Must not persist", version: original.version,
    }, managementActor(fixture.adminUserId), now);

    expect(updated).toMatchObject({ kind: "UPDATED", evidence: { version: original.version + 1, description: "Management correction", accessLevel: "TECHNICIAN" } });
    expect(stale).toEqual({ kind: "VERSION_CONFLICT" });
    const audits = await database.auditoria.findMany({ where: { entityId: id, action: "EVIDENCE_UPDATED" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ reason: null });
    expectExactSnapshot(audits[0]?.beforeData, {
      resourceType: "ORDER",
      resourceId: fixture.activeOrderId,
      checksumSha256: original.checksumSha256,
      sizeBytes: Number(original.sizeBytes),
      accessLevel: original.accessLevel,
      actorId: fixture.adminUserId,
      version: original.version,
      description: original.description,
    });
    expectExactSnapshot(audits[0]?.afterData, {
      resourceType: "ORDER",
      resourceId: fixture.activeOrderId,
      checksumSha256: original.checksumSha256,
      sizeBytes: Number(original.sizeBytes),
      accessLevel: "TECHNICIAN",
      actorId: fixture.adminUserId,
      version: original.version + 1,
      description: "Management correction",
    });
  });

  it("archives exactly once without a physical callback and records the complete archive triplet", async () => {
    const repository = createEvidencesMutationRepository(database);
    const id = fixture.orderTechnicianTieEvidenceId;
    const before = await database.evidencia.findUniqueOrThrow({ where: { id } });
    const [first, second] = await Promise.all([
      repository.archiveEvidence(id, { reason: "Superseded by an approved replacement document", version: before.version }, managementActor(fixture.adminUserId), now),
      repository.archiveEvidence(id, { reason: "Superseded by an approved replacement document", version: before.version }, managementActor(fixture.adminUserId), now),
    ]);

    expect([first.kind, second.kind]).toContain("UPDATED");
    expect([first.kind, second.kind]).toContainEqual(expect.stringMatching(/^(VERSION_CONFLICT|EVIDENCE_NOT_FOUND)$/));
    const archived = await database.evidencia.findUniqueOrThrow({ where: { id } });
    expect(archived).toMatchObject({ deletedById: fixture.adminUserId, deletionReason: "Superseded by an approved replacement document", version: before.version + 1 });
    expect(archived.deletedAt).toEqual(now);
    const audit = await database.auditoria.findFirstOrThrow({ where: { entityId: id, action: "EVIDENCE_ARCHIVED" } });
    expect(audit).toMatchObject({ reason: "Superseded by an approved replacement document" });
    expectExactSnapshot(audit.beforeData, {
      resourceType: "ORDER",
      resourceId: fixture.activeOrderId,
      checksumSha256: before.checksumSha256,
      sizeBytes: Number(before.sizeBytes),
      accessLevel: before.accessLevel,
      actorId: fixture.adminUserId,
      version: before.version,
    });
    expectExactSnapshot(audit.afterData, {
      resourceType: "ORDER",
      resourceId: fixture.activeOrderId,
      checksumSha256: before.checksumSha256,
      sizeBytes: Number(before.sizeBytes),
      accessLevel: before.accessLevel,
      actorId: fixture.adminUserId,
      version: before.version + 1,
      deletedAt: now.toISOString(),
      deletedById: fixture.adminUserId,
      deletionReason: "Superseded by an approved replacement document",
    });
    expect(audit.afterData).not.toHaveProperty("description");
  });

  it("writes the exact administrative download audit without changing evidence metadata", async () => {
    const repository = createEvidencesMutationRepository(database);
    const before = await database.evidencia.findUniqueOrThrow({ where: { id: fixture.orderTechnicianEvidenceId } });

    await repository.recordAdministrativeDownload(
      before.id, managementActor(fixture.supervisorUserId), now,
    );

    const after = await database.evidencia.findUniqueOrThrow({ where: { id: before.id } });
    const audit = await database.auditoria.findFirstOrThrow({ where: { entityId: before.id, action: "EVIDENCE_DOWNLOADED" } });
    expect(after).toMatchObject({ updatedAt: before.updatedAt, version: before.version });
    expect(audit).toMatchObject({ entity: "Evidencia", userId: fixture.supervisorUserId, occurredAt: now, beforeData: null, reason: null });
    expectExactSnapshot(audit.afterData, {
      resourceType: "ORDER",
      resourceId: fixture.activeOrderId,
      checksumSha256: before.checksumSha256,
      sizeBytes: Number(before.sizeBytes),
      accessLevel: before.accessLevel,
      actorId: fixture.supervisorUserId,
      version: before.version,
    });
  });
});
