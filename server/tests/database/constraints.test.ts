import { randomUUID } from "node:crypto";
import {
  EstadoActividad,
  EstadoOrden,
  ParticipacionReincidencia,
  PrioridadOrden,
  RolOrdenTecnico,
} from "../../generated/prisma/client.js";
import { seedDatabase } from "../../prisma/seed.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

async function fixtures() {
  const [order, activity, technician, user, material, configuration] =
    await Promise.all([
      database.ordenTrabajo.findUniqueOrThrow({
        where: { orderNumber: "GS-2026-0001" },
      }),
      database.actividad.findUniqueOrThrow({
        where: { id: "30000000-0000-4000-8000-000000000001" },
      }),
      database.tecnico.findUniqueOrThrow({ where: { code: "TEC-003" } }),
      database.usuario.findUniqueOrThrow({
        where: { email: "admin.demo@geeksolution.example.test" },
      }),
      database.material.findUniqueOrThrow({
        where: { code: "MAT-CABLE-001" },
      }),
      database.configuracionKPI.findUniqueOrThrow({ where: { version: 1 } }),
    ]);

  return { order, activity, technician, user, material, configuration };
}

describe("database constraints", () => {
  it("rejects a duplicate work order number", async () => {
    const { order } = await fixtures();

    await expect(
      database.ordenTrabajo.create({
        data: {
          orderNumber: order.orderNumber,
          sucursalId: order.sucursalId,
          tipoServicioId: order.tipoServicioId,
          priority: PrioridadOrden.LOW,
          status: EstadoOrden.PENDING,
          reportedProblem: "Duplicado ficticio",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a second active primary technician", async () => {
    const { order, technician } = await fixtures();

    await expect(
      database.ordenTecnico.create({
        data: {
          ordenId: order.id,
          tecnicoId: technician.id,
          role: RolOrdenTecnico.PRIMARY,
        },
      }),
    ).rejects.toThrow();
  });

  it("keeps closed order-assignment cycles while allowing only one open pair", async () => {
    const { order, technician, user } = await fixtures();
    const firstClosedId = randomUUID();
    const secondClosedId = randomUUID();
    const openId = randomUUID();

    try {
      await database.ordenTecnico.createMany({
        data: [
          {
            id: firstClosedId,
            ordenId: order.id,
            tecnicoId: technician.id,
            role: RolOrdenTecnico.SUPPORT,
            assignedAt: new Date("2026-07-20T08:00:00.000Z"),
            unassignedAt: new Date("2026-07-20T10:00:00.000Z"),
            assignedById: user.id,
          },
          {
            id: secondClosedId,
            ordenId: order.id,
            tecnicoId: technician.id,
            role: RolOrdenTecnico.SUPPORT,
            assignedAt: new Date("2026-07-21T08:00:00.000Z"),
            unassignedAt: new Date("2026-07-21T10:00:00.000Z"),
            assignedById: user.id,
          },
          {
            id: openId,
            ordenId: order.id,
            tecnicoId: technician.id,
            role: RolOrdenTecnico.SUPPORT,
            assignedAt: new Date("2026-07-22T08:00:00.000Z"),
            assignedById: user.id,
          },
        ],
      });

      expect(await database.ordenTecnico.count({
        where: { ordenId: order.id, tecnicoId: technician.id },
      })).toBe(3);
      await expect(database.ordenTecnico.create({
        data: {
          ordenId: order.id,
          tecnicoId: technician.id,
          role: RolOrdenTecnico.SUPPORT,
          assignedById: user.id,
        },
      })).rejects.toThrow();
    } finally {
      await database.ordenTecnico.deleteMany({
        where: { id: { in: [firstClosedId, secondClosedId, openId] } },
      });
    }
  });

  it("rejects a work order related to itself", async () => {
    const { order } = await fixtures();

    await expect(
      database.ordenRelacionada.create({
        data: {
          ordenOriginalId: order.id,
          ordenRelacionadaId: order.id,
          type: "RELATED",
          reason: "Relación inválida de prueba",
        },
      }),
    ).rejects.toThrow();
  });

  it("requires evidence to target exactly one resource", async () => {
    const { order, activity, user } = await fixtures();

    await expect(
      database.evidencia.create({
        data: {
          originalName: "evidence.pdf",
          storedName: `${randomUUID()}.pdf`,
          mimeType: "application/pdf",
          fileExtension: "pdf",
          sizeBytes: 100n,
          storageKey: `test/${randomUUID()}`,
          checksumSha256: "a".repeat(64),
          uploadedById: user.id,
        },
      }),
    ).rejects.toThrow();

    await expect(
      database.evidencia.create({
        data: {
          originalName: "evidence.pdf",
          storedName: `${randomUUID()}.pdf`,
          mimeType: "application/pdf",
          fileExtension: "pdf",
          sizeBytes: 100n,
          storageKey: `test/${randomUUID()}`,
          checksumSha256: "a".repeat(64),
          uploadedById: user.id,
          ordenId: order.id,
          actividadId: activity.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects evidence metadata that violates integrity checks", async () => {
    const { order, user } = await fixtures();
    const baseEvidence = {
      originalName: "evidence.pdf",
      storedName: `${randomUUID()}.pdf`,
      mimeType: "application/pdf",
      fileExtension: "pdf",
      sizeBytes: 100n,
      storageKey: `test/${randomUUID()}`,
      checksumSha256: "a".repeat(64),
      uploadedById: user.id,
      ordenId: order.id,
    };

    await expect(
      database.evidencia.create({
        data: { ...baseEvidence, checksumSha256: "A".repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      database.evidencia.create({ data: { ...baseEvidence, version: 0 } }),
    ).rejects.toThrow();
    await expect(
      database.evidencia.create({
        data: { ...baseEvidence, sizeBytes: 10_485_761n },
      }),
    ).rejects.toThrow();
    await expect(
      database.evidencia.create({
        data: {
          ...baseEvidence,
          deletedAt: new Date("2026-08-17T12:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("requires material usage to target exactly one resource", async () => {
    const { order, activity, material } = await fixtures();

    await expect(
      database.materialUtilizado.create({
        data: {
          materialId: material.id,
          quantity: "1.000",
          historicalUnitCost: "1.00",
        },
      }),
    ).rejects.toThrow();

    await expect(
      database.materialUtilizado.create({
        data: {
          materialId: material.id,
          ordenId: order.id,
          actividadId: activity.id,
          quantity: "1.000",
          historicalUnitCost: "1.00",
        },
      }),
    ).rejects.toThrow();
  });

  it("allows only one open pause per activity", async () => {
    const { activity } = await fixtures();
    const firstPauseId = randomUUID();

    try {
      await database.pausaActividad.create({
        data: {
          id: firstPauseId,
          actividadId: activity.id,
          startedAt: new Date("2026-07-30T10:00:00.000Z"),
          reason: "Pausa abierta de prueba",
        },
      });

      await expect(
        database.pausaActividad.create({
          data: {
            actividadId: activity.id,
            startedAt: new Date("2026-07-30T10:05:00.000Z"),
            reason: "Segunda pausa inválida",
          },
        }),
      ).rejects.toThrow();
    } finally {
      await database.pausaActividad.deleteMany({ where: { id: firstPauseId } });
    }
  });

  it("rejects negative material quantities", async () => {
    const { order, material } = await fixtures();

    await expect(
      database.materialUtilizado.create({
        data: {
          materialId: material.id,
          ordenId: order.id,
          quantity: "-1.000",
          historicalUnitCost: "1.00",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects KPI weights that do not sum to one", async () => {
    await expect(
      database.configuracionKPI.create({
        data: {
          version: 99_001,
          validFrom: new Date("2027-01-01T00:00:00.000Z"),
          productivityWeight: "0.3000",
          complianceWeight: "0.3000",
          efficiencyWeight: "0.3000",
          qualityWeight: "0.3000",
        },
      }),
    ).rejects.toThrow();
  });

  it("requires justification when a recurrence affects quality", async () => {
    const { technician } = await fixtures();
    const recurrence = await database.reincidencia.findUniqueOrThrow({
      where: { id: "60000000-0000-4000-8000-000000000001" },
    });

    await expect(
      database.reincidenciaTecnico.create({
        data: {
          reincidenciaId: recurrence.id,
          tecnicoId: technician.id,
          participation: ParticipacionReincidencia.ORIGINAL_PARTICIPANT,
          affectsQuality: true,
          justification: "   ",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects activity completion before its start", async () => {
    const { order } = await fixtures();
    const activityType = await database.tipoActividad.findUniqueOrThrow({
      where: { code: "OTHER" },
    });

    await expect(
      database.actividad.create({
        data: {
          sucursalId: order.sucursalId,
          tipoActividadId: activityType.id,
          status: EstadoActividad.COMPLETED,
          description: "Actividad temporal inválida",
          startedAt: new Date("2026-07-30T11:00:00.000Z"),
          endedAt: new Date("2026-07-30T10:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects KPI component scores over one hundred", async () => {
    const { technician, configuration } = await fixtures();

    await expect(
      database.resultadoKPI.create({
        data: {
          tecnicoId: technician.id,
          configuracionId: configuration.id,
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-08-31T00:00:00.000Z"),
          completedJobs: 1,
          appliedTarget: 1,
          registeredMinutes: 60,
          productiveMinutes: 60,
          onTimeJobs: 1,
          attributableRecurrences: 0,
          productivityScore: "101.00",
          complianceScore: "100.00",
          efficiencyScore: "100.00",
          qualityScore: "100.00",
          overallScore: "100.00",
          productivityWeight: "0.3000",
          complianceWeight: "0.2500",
          efficiencyWeight: "0.2000",
          qualityWeight: "0.2500",
        },
      }),
    ).rejects.toThrow();
  });
});
