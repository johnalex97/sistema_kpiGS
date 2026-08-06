import {
  mapPublicActivityDetail,
  mapPublicActivitySummary,
  mapPublicActivityType,
} from "../../src/activities/activities.mapper.js";

const record = {
  id: "activity-id",
  status: "COMPLETED",
  description: "Reparación final",
  observations: "Observación interna permitida",
  result: "Operativo",
  startedAt: new Date("2026-08-06T12:00:00.000Z"),
  endedAt: new Date("2026-08-06T13:00:00.000Z"),
  pausedMinutes: 5,
  productiveMinutes: 55,
  createdAt: new Date("2026-08-06T11:00:00.000Z"),
  updatedAt: new Date("2026-08-06T13:00:00.000Z"),
  version: 3,
  deletedAt: new Date("2026-08-07T00:00:00.000Z"),
  sucursalId: "private-branch-fk",
  ordenId: "private-order-fk",
  tipoActividadId: "private-type-fk",
  sucursal: { id: "branch-id", code: "SUC-01", name: "Central", clienteId: "private-client-fk", cliente: { id: "client-id", code: "CLI-01", tradeName: "Cliente" } },
  orden: { id: "order-id", orderNumber: "OT-001", status: "COMPLETED", deletedAt: null, usuario: { passwordHash: "secret", sesiones: [{ id: "session-id" }] } },
  tipoActividad: { id: "type-id", code: "REPAIR", name: "Reparación", description: "Tipo público", isActive: true, displayOrder: 2, deletedAt: null },
  tecnicos: [{ id: "assignment-id", actividadId: "private-activity-fk", tecnicoId: "tech-id", role: "RESPONSIBLE", participationPercentage: { toFixed: () => "100.00" }, startedAt: new Date("2026-08-06T12:00:00.000Z"), endedAt: new Date("2026-08-06T13:00:00.000Z"), tecnico: { id: "tech-id", code: "TEC-01", fullName: "Ana Técnica", userId: "private-user-fk", usuario: { passwordHash: "secret", sesiones: [{ id: "session-id" }] } } }],
  pausas: [{ id: "pause-id", actividadId: "private-activity-fk", startedAt: new Date("2026-08-06T12:20:00.000Z"), endedAt: new Date("2026-08-06T12:25:00.000Z"), reason: "Almuerzo", userId: "private-user-fk", usuario: { passwordHash: "secret" } }],
  auxiliaryHydrationId: "must-not-leak",
};

describe("activity mappers", () => {
  it("maps summaries and details through explicit public fields only", () => {
    const summary = mapPublicActivitySummary(record as never);
    const detail = mapPublicActivityDetail(record as never);
    const serialized = JSON.stringify({ summary, detail });

    expect(summary).toMatchObject({ id: "activity-id", branch: { id: "branch-id" }, activityType: { id: "type-id" } });
    expect(detail.team[0]).toMatchObject({ technician: { id: "tech-id", code: "TEC-01" }, participationPercentage: "100.00" });
    expect(detail.pauses[0]).toMatchObject({ id: "pause-id", reason: "Almuerzo" });
    expect(serialized).not.toContain("deletedAt");
    expect(serialized).not.toContain("private-");
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("session-id");
    expect(serialized).not.toContain("auxiliaryHydrationId");
  });

  it("maps activity types without persistence-only fields", () => {
    expect(mapPublicActivityType(record.tipoActividad as never)).toEqual({
      id: "type-id",
      code: "REPAIR",
      name: "Reparación",
      description: "Tipo público",
      displayOrder: 2,
    });
  });
});
