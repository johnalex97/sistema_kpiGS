import {
  activityIdSchema,
  activityListQuerySchema,
  adjustActivitySchema,
  completeActivitySchema,
  createActivitySchema,
  manualActivitySchema,
  pauseActivitySchema,
} from "../../src/activities/activities.schemas.js";

const branchId = "11111111-1111-4111-8111-111111111111";
const activityId = "00000000-0000-4000-8000-000000000000";
const orderId = "22222222-2222-4222-8222-222222222222";
const activityTypeId = "33333333-3333-4333-8333-333333333333";
const technicianId = "44444444-4444-4444-8444-444444444444";
const secondTechnicianId = "55555555-5555-4555-8555-555555555555";
const fixedNow = new Date("2026-08-06T16:00:00.000Z");

describe("activity schemas", () => {
  it("accepts strict UUID path parameters", () => {
    expect(activityIdSchema.safeParse({ activityId }).success).toBe(true);
    expect(activityIdSchema.safeParse({ activityId: "not-a-uuid" }).success).toBe(false);
    expect(activityIdSchema.safeParse({ activityId, extra: true }).success).toBe(false);
  });

  it("normalizes public UUIDs and rejects case-variant duplicate technicians", () => {
    const canonicalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const upperTechnicianId = canonicalId.toUpperCase();

    expect(activityIdSchema.parse({ activityId: upperTechnicianId }).activityId).toBe(canonicalId);
    expect(
      createActivitySchema.safeParse({
        branchId,
        activityTypeId,
        description: "Actividad de prueba",
        team: [
          { technicianId: canonicalId, role: "RESPONSIBLE", participationPercentage: "50.00" },
          { technicianId: upperTechnicianId, role: "PARTICIPANT", participationPercentage: "50.00" },
        ],
      }).success,
    ).toBe(false);
    const parsed = createActivitySchema.parse({
      branchId,
      activityTypeId,
      description: "Actividad de prueba",
      team: [{ technicianId: upperTechnicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    });
    expect(parsed.team?.[0]?.technicianId).toBe(canonicalId);
  });

  it("defaults activity pagination to page 1 and 25 items with a maximum of 100", () => {
    expect(activityListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 25 });
    expect(activityListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it("trims text and requires exactly one responsible team member totaling 100.00", () => {
    const parsed = createActivitySchema.parse({
      branchId,
      activityTypeId,
      description: "  Revisión preventiva  ",
      observations: "  Sin novedad  ",
      team: [
        { technicianId, role: "RESPONSIBLE", participationPercentage: "60.00" },
        { technicianId: secondTechnicianId, role: "PARTICIPANT", participationPercentage: "40.00" },
      ],
    });

    expect(parsed.description).toBe("Revisión preventiva");
    expect(parsed.observations).toBe("Sin novedad");
    expect(
      createActivitySchema.safeParse({
        branchId,
        activityTypeId,
        description: "Valid activity",
        team: [
          { technicianId, role: "PARTICIPANT", participationPercentage: "100.00" },
        ],
      }).success,
    ).toBe(false);
    expect(
      createActivitySchema.safeParse({
        branchId,
        activityTypeId,
        description: "Valid activity",
        team: [
          { technicianId, role: "RESPONSIBLE", participationPercentage: "0.00" },
          { technicianId: secondTechnicianId, role: "PARTICIPANT", participationPercentage: "100.00" },
        ],
      }).success,
    ).toBe(false);
    expect(
      createActivitySchema.safeParse({
        branchId,
        activityTypeId,
        description: "Valid activity",
        team: [
          { technicianId, role: "RESPONSIBLE", participationPercentage: "100" },
        ],
      }).success,
    ).toBe(false);
    expect(
      createActivitySchema.safeParse({
        branchId,
        activityTypeId,
        description: "Valid activity",
        team: [
          { technicianId, role: "RESPONSIBLE", participationPercentage: "99.99" },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires exactly one parent reference and rejects unknown fields", () => {
    const base = { activityTypeId, description: "Trabajo programado" };
    expect(createActivitySchema.safeParse(base).success).toBe(false);
    expect(createActivitySchema.safeParse({ ...base, branchId, orderId }).success).toBe(false);
    expect(createActivitySchema.safeParse({ ...base, branchId, unexpected: true }).success).toBe(false);
  });

  it("validates manual ISO ranges against the injected clock", () => {
    const valid = {
      orderId,
      activityTypeId,
      description: "Entrega e instalación",
      result: "Equipo operativo",
      justification: "Trabajo registrado al cierre",
      startedAt: "2026-08-06T14:00:00.000Z",
      endedAt: "2026-08-06T15:00:00.000Z",
      team: [{ technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
    };

    expect(manualActivitySchema(() => fixedNow).safeParse(valid).success).toBe(true);
    expect(manualActivitySchema(() => fixedNow).safeParse({ ...valid, endedAt: "2026-08-06T14:00:59.999Z" }).success).toBe(false);
    expect(manualActivitySchema(() => fixedNow).safeParse({ ...valid, endedAt: "2026-08-07T14:00:00.001Z" }).success).toBe(false);
    expect(manualActivitySchema(() => fixedNow).safeParse({ ...valid, endedAt: "2026-08-06T16:00:00.001Z" }).success).toBe(false);
  });

  it("requires non-empty reasons and results, and requires an adjustment field", () => {
    expect(completeActivitySchema.safeParse({ version: 1, result: "   " }).success).toBe(false);
    expect(pauseActivitySchema.safeParse({ version: 1, reason: "   " }).success).toBe(false);
    expect(adjustActivitySchema.safeParse({ version: 1, reason: "Corregir registro" }).success).toBe(false);
    expect(adjustActivitySchema.safeParse({ version: 1, reason: "Corregir registro", result: "Resultado corregido" }).success).toBe(true);
  });
});
