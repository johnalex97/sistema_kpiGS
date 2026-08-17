import { randomUUID } from "node:crypto";
import { NivelAccesoEvidencia, Prisma } from "../../generated/prisma/client.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvidencesReadRepository } from "../../src/evidences/evidences.read.repository.js";
import type { EvidenceActorContext, EvidenceListFilters } from "../../src/evidences/evidences.types.js";
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

function managementActor(userId: string): EvidenceActorContext {
  return { userId, technicianId: null, permissions: ["EVIDENCES_VIEW"], requestId: "70000000-0000-4000-8000-000000000001" };
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
