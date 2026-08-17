import { randomUUID } from "node:crypto";
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
});
