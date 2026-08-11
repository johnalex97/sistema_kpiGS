import { Prisma } from "../../generated/prisma/client.js";
import { describe, expect, it } from "vitest";
import {
  mapPublicOrderDetail,
  mapPublicOrderHistory,
  mapPublicOrderSummary,
} from "../../src/orders/orders.mapper.js";
import type {
  OrderDetailRecord,
  OrderHistoryRecord,
  OrderSummaryRecord,
} from "../../src/orders/orders.repository.types.js";

const now = new Date("2026-08-01T12:00:00.000Z");

function summaryRecord(): OrderSummaryRecord {
  return {
    id: "order-1",
    orderNumber: "OT-001",
    priority: "HIGH",
    status: "IN_PROGRESS",
    reportedProblem: "No enciende",
    scheduledFor: new Date("2026-08-01T11:00:00.000Z"),
    startedAt: new Date("2026-08-01T11:05:00.000Z"),
    endedAt: null,
    estimatedMinutes: 90,
    totalMinutes: null,
    createdAt: new Date("2026-08-01T09:00:00.000Z"),
    updatedAt: new Date("2026-08-01T11:05:00.000Z"),
    version: 3,
    sucursal: {
      id: "branch-1",
      code: "MAIN",
      name: "Principal",
      cliente: { id: "client-1", code: "CLI-001", tradeName: "Acme" },
    },
    tipoServicio: { id: "service-1", code: "SUPPORT", name: "Soporte" },
    tecnicos: [
      {
        role: "PRIMARY",
        unassignedAt: null,
        tecnico: { id: "tech-1", code: "TEC-001", fullName: "Ana Técnica" },
      },
    ],
    _count: { tecnicos: 2 },
  } as OrderSummaryRecord;
}

describe("order public mappers", () => {
  it("maps a summary with ISO dates, active primary and computed overdue", () => {
    const result = mapPublicOrderSummary(summaryRecord(), now);

    expect(result).toMatchObject({
      id: "order-1",
      client: { id: "client-1", code: "CLI-001", tradeName: "Acme" },
      branch: { id: "branch-1", code: "MAIN", name: "Principal" },
      primaryTechnician: { id: "tech-1", code: "TEC-001", fullName: "Ana Técnica" },
      supportCount: 2,
      overdue: true,
      scheduledFor: "2026-08-01T11:00:00.000Z",
    });
    expect(result).not.toHaveProperty("deletedAt");
    expect(result).not.toHaveProperty("sucursal");
  });

  it("maps a detail without internal relations while retaining historical participants and decimal strings", () => {
    const record = {
      ...summaryRecord(),
      description: "Detalle interno de la orden",
      diagnosis: "Fuente dañada",
      result: "Fuente reemplazada",
      cancellationReason: null,
      tecnicos: [
        {
          role: "SUPPORT",
          assignedAt: new Date("2026-08-01T09:20:00.000Z"),
          unassignedAt: null,
          tecnico: { id: "tech-3", code: "TEC-003", fullName: "Sofía Soporte" },
        },
        {
          role: "PRIMARY",
          assignedAt: new Date("2026-07-31T09:30:00.000Z"),
          unassignedAt: new Date("2026-07-31T10:00:00.000Z"),
          tecnico: { id: "tech-1", code: "TEC-001", fullName: "Ana Histórica" },
        },
        {
          role: "PRIMARY",
          assignedAt: new Date("2026-08-01T09:30:00.000Z"),
          unassignedAt: null,
          tecnico: { id: "tech-2", code: "TEC-002", fullName: "Bruno Principal" },
        },
      ],
      materiales: [
        {
          id: "usage-1",
          quantity: new Prisma.Decimal("12.500"),
          historicalUnitCost: new Prisma.Decimal("25.00"),
          observation: "Instalado",
          createdAt: new Date("2026-08-01T11:20:00.000Z"),
          material: { id: "material-1", code: "MAT-001", name: "Cable", unit: "m" },
        },
      ],
    } as OrderDetailRecord;

    const result = mapPublicOrderDetail(record, now);

    expect(result.primaryTechnician).toEqual({
      id: "tech-2",
      code: "TEC-002",
      fullName: "Bruno Principal",
    });
    expect(result.materials[0]).toMatchObject({
      quantity: "12.500",
      historicalUnitCost: "25.00",
    });
    expect(result.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "tech-2", active: true, unassignedAt: null }),
        expect.objectContaining({ id: "tech-1", active: false, unassignedAt: "2026-07-31T10:00:00.000Z" }),
      ]),
    );
    expect(result).not.toHaveProperty("deletedAt");
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("permissions");
    expect(result).not.toHaveProperty("sessions");
    expect(result).not.toHaveProperty("tecnicos");
    expect(result).not.toHaveProperty("materiales");
  });

  it("does not publish a support or historical primary when no active primary exists", () => {
    const record = {
      ...summaryRecord(),
      description: null,
      diagnosis: null,
      result: null,
      cancellationReason: null,
      tecnicos: [
        {
          role: "SUPPORT",
          assignedAt: new Date("2026-08-01T09:00:00.000Z"),
          unassignedAt: null,
          tecnico: { id: "tech-support", code: "TEC-010", fullName: "Soporte Activo" },
        },
        {
          role: "PRIMARY",
          assignedAt: new Date("2026-08-01T08:00:00.000Z"),
          unassignedAt: new Date("2026-08-01T09:00:00.000Z"),
          tecnico: { id: "tech-old", code: "TEC-011", fullName: "Primario Histórico" },
        },
      ],
      materiales: [],
    } as OrderDetailRecord;

    expect(mapPublicOrderDetail(record, now).primaryTechnician).toBeNull();
  });

  it("maps history actor and JSON metadata without exposing the Prisma relation", () => {
    const record = {
      id: "history-1",
      previousStatus: "ASSIGNED",
      newStatus: "IN_PROGRESS",
      action: "ORDER_STARTED",
      comment: "En sitio",
      occurredAt: new Date("2026-08-01T11:05:00.000Z"),
      metadata: { source: "mobile" },
      usuario: { id: "user-1", displayName: "Coordinación" },
    } as OrderHistoryRecord;

    expect(mapPublicOrderHistory(record)).toEqual({
      id: "history-1",
      previousStatus: "ASSIGNED",
      newStatus: "IN_PROGRESS",
      action: "ORDER_STARTED",
      comment: "En sitio",
      occurredAt: "2026-08-01T11:05:00.000Z",
      metadata: { source: "mobile" },
      user: { id: "user-1", displayName: "Coordinación" },
    });
  });
});
