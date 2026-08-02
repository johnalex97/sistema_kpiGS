import { describe, expect, it } from "vitest";
import {
  addMaterialSchema,
  adjustOrderSchema,
  assignmentParamsSchema,
  assignmentSchema,
  cancelOrderSchema,
  completeOrderSchema,
  createOrderSchema,
  historyQuerySchema,
  materialParamsSchema,
  orderIdSchema,
  orderListQuerySchema,
  pauseOrderSchema,
  removeMaterialSchema,
  unassignmentSchema,
  updateMaterialSchema,
  updateOrderSchema,
  versionCommandSchema,
} from "../../src/orders/orders.schemas.js";

const orderId = "10000000-0000-4000-8000-000000000001";
const technicianId = "10000000-0000-4000-8000-000000000002";
const materialId = "10000000-0000-4000-8000-000000000003";
const usageId = "10000000-0000-4000-8000-000000000004";
const branchId = "10000000-0000-4000-8000-000000000005";
const serviceTypeId = "10000000-0000-4000-8000-000000000006";

describe("order request schemas", () => {
  it("defaults priority and normalizes nullable optional strings", () => {
    expect(
      createOrderSchema.parse({
        branchId,
        serviceTypeId,
        reportedProblem: "  Falla de enlace  ",
      }),
    ).toMatchObject({ priority: "MEDIUM", reportedProblem: "Falla de enlace" });
    expect(
      createOrderSchema.parse({
        branchId,
        serviceTypeId,
        reportedProblem: "Falla",
        description: "   ",
      }),
    ).toMatchObject({ description: null });
  });

  it("rejects unknown properties from every exported object schema", () => {
    expect(() => orderIdSchema.parse({ orderId, extra: true })).toThrow();
    expect(() => createOrderSchema.parse({ branchId, serviceTypeId, reportedProblem: "Falla", extra: true })).toThrow();
    expect(() => assignmentSchema.parse({ version: 1, technicianId, role: "PRIMARY", extra: true })).toThrow();
  });

  it("parses parameter identifiers for orders, assignments, and material usage", () => {
    expect(orderIdSchema.parse({ orderId })).toEqual({ orderId });
    expect(assignmentParamsSchema.parse({ orderId, technicianId })).toEqual({ orderId, technicianId });
    expect(materialParamsSchema.parse({ orderId, usageId })).toEqual({ orderId, usageId });
  });

  it("normalizes repeated status and priority query values with ISO dates", () => {
    const parsed = orderListQuerySchema.parse({
      status: ["ASSIGNED", "IN_PROGRESS", "ASSIGNED"],
      priority: ["HIGH", "HIGH", "CRITICAL"],
      scheduledFrom: "2026-08-01T14:00:00.000Z",
      scheduledTo: "2026-08-02T14:00:00.000Z",
      overdue: "true",
      pageSize: "50",
    });

    expect(parsed).toMatchObject({
      status: ["ASSIGNED", "IN_PROGRESS"],
      priority: ["HIGH", "CRITICAL"],
      overdue: true,
      page: 1,
      pageSize: 50,
    });
    expect(parsed.scheduledFrom).toEqual(new Date("2026-08-01T14:00:00.000Z"));
    expect(parsed.scheduledTo).toEqual(new Date("2026-08-02T14:00:00.000Z"));
    expect(orderListQuerySchema.parse({ status: "PENDING", priority: "LOW" })).toMatchObject({
      status: ["PENDING"], priority: ["LOW"], page: 1, pageSize: 20,
    });
  });

  it("enforces query bounds and history defaults", () => {
    expect(() => orderListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(historyQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("requires a positive version and valid operation payload sizes", () => {
    expect(() => versionCommandSchema.parse({ version: 0 })).toThrow();
    expect(() => pauseOrderSchema.parse({ version: 2, comment: "corto" })).toThrow();
    expect(() => completeOrderSchema.parse({ version: 2, diagnosis: "ab", result: "resultado válido" })).toThrow();
    expect(() => completeOrderSchema.parse({ version: 2, diagnosis: "diagnóstico válido", result: "ab" })).toThrow();
    expect(() => cancelOrderSchema.parse({ version: 2, cancellationReason: "corto" })).toThrow();
    expect(() => unassignmentSchema.parse({ version: 2, reason: "corto" })).toThrow();
  });

  it("enforces order fields and rejects an empty administrative patch", () => {
    expect(() => createOrderSchema.parse({ branchId, serviceTypeId, reportedProblem: "Falla", estimatedMinutes: 10_081 })).toThrow();
    expect(() => updateOrderSchema.parse({ version: 1 })).toThrow();
    expect(updateOrderSchema.parse({ version: 1, scheduledFor: "   ", estimatedMinutes: "120" })).toMatchObject({
      scheduledFor: null, estimatedMinutes: 120,
    });
  });

  it("validates materials as positive decimal values with at most three places", () => {
    expect(
      addMaterialSchema.parse({ version: 2, materialId, quantity: "12.500", observation: " Cable " }),
    ).toMatchObject({ quantity: "12.500", observation: "Cable" });
    expect(() => addMaterialSchema.parse({ version: 2, materialId, quantity: "1.0001" })).toThrow();
    expect(() => addMaterialSchema.parse({ version: 2, materialId, quantity: "0" })).toThrow();
    expect(() => updateMaterialSchema.parse({ version: 2 })).toThrow();
    expect(removeMaterialSchema.parse({ version: 2 })).toEqual({ version: 2 });
  });

  it("matches the Decimal(12,3) quantity boundary for material creation and editing", () => {
    expect(
      addMaterialSchema.parse({
        version: 2,
        materialId,
        quantity: "999999999.999",
      }),
    ).toMatchObject({ quantity: "999999999.999" });
    expect(
      updateMaterialSchema.parse({ version: 2, quantity: "999999999.999" }),
    ).toMatchObject({ quantity: "999999999.999" });

    expect(() =>
      addMaterialSchema.parse({
        version: 2,
        materialId,
        quantity: "1000000000",
      }),
    ).toThrow();
    expect(() =>
      updateMaterialSchema.parse({ version: 2, quantity: "1000000000" }),
    ).toThrow();
  });

  it("requires an adjustment reason and at least one permitted field", () => {
    expect(() => adjustOrderSchema.parse({ version: 2, reason: "Razón suficientemente larga" })).toThrow();
    expect(
      adjustOrderSchema.parse({
        version: 2,
        reason: "Razón suficientemente larga",
        diagnosis: " Diagnóstico corregido ",
      }),
    ).toMatchObject({ diagnosis: "Diagnóstico corregido" });
  });

  it("rejects an inverted adjustment range when both endpoints are submitted", () => {
    const parsed = adjustOrderSchema.safeParse({
      version: 2,
      reason: "Correccion suficientemente documentada",
      startedAt: "2026-08-01T15:00:00.000Z",
      endedAt: "2026-08-01T14:59:59.000Z",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues).toEqual([
      expect.objectContaining({ path: ["endedAt"] }),
    ]);
  });
});
