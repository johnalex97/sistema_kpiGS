import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface OrdersReadFixture {
  suffix: string;
  clientId: string;
  branchId: string;
  serviceTypeId: string;
  technicianId: string;
  otherTechnicianId: string;
  activeOrderId: string;
  historicalOrderId: string;
  completedOrderId: string;
  deletedOrderId: string;
}

export async function createOrdersReadFixture(
  database: PrismaClient,
): Promise<OrdersReadFixture> {
  const suffix = randomUUID().slice(0, 8);
  const fixture: OrdersReadFixture = {
    suffix,
    clientId: randomUUID(),
    branchId: randomUUID(),
    serviceTypeId: randomUUID(),
    technicianId: randomUUID(),
    otherTechnicianId: randomUUID(),
    activeOrderId: randomUUID(),
    historicalOrderId: randomUUID(),
    completedOrderId: randomUUID(),
    deletedOrderId: randomUUID(),
  };

  await database.cliente.create({
    data: {
      id: fixture.clientId,
      code: `ORD-${suffix}`,
      tradeName: `Cliente ${suffix}`,
    },
  });
  await database.sucursalCliente.create({
    data: {
      id: fixture.branchId,
      clienteId: fixture.clientId,
      code: "MAIN",
      name: `Sucursal ${suffix}`,
      address: "Centro",
    },
  });
  await database.tipoServicio.create({
    data: { id: fixture.serviceTypeId, code: `ORD-${suffix}`, name: `Servicio ${suffix}` },
  });
  await database.tecnico.createMany({
    data: [
      { id: fixture.technicianId, code: `OT-${suffix}-A`, fullName: `Técnico ${suffix}` },
      { id: fixture.otherTechnicianId, code: `OT-${suffix}-B`, fullName: `Ajeno ${suffix}` },
    ],
  });
  await database.ordenTrabajo.createMany({
    data: [
      {
        id: fixture.activeOrderId,
        orderNumber: `OT-${suffix}-001`,
        sucursalId: fixture.branchId,
        tipoServicioId: fixture.serviceTypeId,
        priority: "HIGH",
        status: "PENDING",
        reportedProblem: `Problema ${suffix}`,
        scheduledFor: new Date("2026-08-01T11:00:00.000Z"),
        createdAt: new Date("2026-08-01T08:00:00.000Z"),
      },
      {
        id: fixture.historicalOrderId,
        orderNumber: `OT-${suffix}-002`,
        sucursalId: fixture.branchId,
        tipoServicioId: fixture.serviceTypeId,
        priority: "LOW",
        status: "IN_PROGRESS",
        reportedProblem: `Seguimiento ${suffix}`,
        scheduledFor: new Date("2026-08-01T13:00:00.000Z"),
        createdAt: new Date("2026-08-01T08:01:00.000Z"),
      },
      {
        id: fixture.completedOrderId,
        orderNumber: `OT-${suffix}-003`,
        sucursalId: fixture.branchId,
        tipoServicioId: fixture.serviceTypeId,
        priority: "MEDIUM",
        status: "COMPLETED",
        reportedProblem: `Completada ${suffix}`,
        scheduledFor: null,
        createdAt: new Date("2026-08-01T08:02:00.000Z"),
      },
      {
        id: fixture.deletedOrderId,
        orderNumber: `OT-${suffix}-004`,
        sucursalId: fixture.branchId,
        tipoServicioId: fixture.serviceTypeId,
        priority: "CRITICAL",
        status: "PENDING",
        reportedProblem: `Eliminada ${suffix}`,
        deletedAt: new Date("2026-08-01T08:03:00.000Z"),
      },
    ],
  });
  await database.ordenTecnico.createMany({
    data: [
      {
        ordenId: fixture.activeOrderId,
        tecnicoId: fixture.technicianId,
        role: "PRIMARY",
        assignedAt: new Date("2026-08-01T09:00:00.000Z"),
      },
      {
        ordenId: fixture.historicalOrderId,
        tecnicoId: fixture.technicianId,
        role: "SUPPORT",
        assignedAt: new Date("2026-08-01T09:00:00.000Z"),
        unassignedAt: new Date("2026-08-01T10:00:00.000Z"),
      },
    ],
  });
  await database.historialOrden.createMany({
    data: [
      {
        id: randomUUID(),
        ordenId: fixture.activeOrderId,
        action: "ORDER_CREATED",
        occurredAt: new Date("2026-08-01T09:00:00.000Z"),
      },
      {
        id: randomUUID(),
        ordenId: fixture.activeOrderId,
        action: "ORDER_ASSIGNED",
        occurredAt: new Date("2026-08-01T10:00:00.000Z"),
      },
    ],
  });
  return fixture;
}

export async function removeOrdersReadFixture(
  database: PrismaClient,
  fixture: OrdersReadFixture,
): Promise<void> {
  const orderIds = [
    fixture.activeOrderId,
    fixture.historicalOrderId,
    fixture.completedOrderId,
    fixture.deletedOrderId,
  ];
  await database.historialOrden.deleteMany({ where: { ordenId: { in: orderIds } } });
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: orderIds } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: orderIds } } });
  await database.tecnico.deleteMany({
    where: { id: { in: [fixture.technicianId, fixture.otherTechnicianId] } },
  });
  await database.tipoServicio.deleteMany({ where: { id: fixture.serviceTypeId } });
  await database.sucursalCliente.deleteMany({ where: { id: fixture.branchId } });
  await database.cliente.deleteMany({ where: { id: fixture.clientId } });
}
