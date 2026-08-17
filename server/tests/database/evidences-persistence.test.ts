import { randomUUID } from "node:crypto";
import { NivelAccesoEvidencia } from "../../generated/prisma/client.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

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
