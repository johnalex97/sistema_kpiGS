import { describe, expect, it } from "vitest";
import type { OrderDetail } from "../models/order";
import {
  allowedOrderActions,
  deriveOrderCapabilities,
  fromTegucigalpaDateTimeInput,
  readOrderUrlState,
  toTegucigalpaDateTimeInput,
  writeOrderUrlState,
} from "./order-workspace.helpers";

function detail(
  status: OrderDetail["status"],
  primaryTechnicianId: string | null = "tech-1",
): OrderDetail {
  return {
    id: "order-1",
    orderNumber: "OT-2026-0001",
    client: { id: "client-1", code: "CLI-1", tradeName: "Acme" },
    branch: { id: "branch-1", code: "MAIN", name: "Principal" },
    serviceType: { id: "service-1", code: "SUPPORT", name: "Soporte" },
    priority: "HIGH",
    status,
    reportedProblem: "Sin red",
    scheduledFor: null,
    primaryTechnician: primaryTechnicianId
      ? { id: primaryTechnicianId, code: "TEC-1", fullName: "Ana López" }
      : null,
    supportCount: 0,
    overdue: false,
    startedAt: null,
    endedAt: null,
    estimatedMinutes: 60,
    totalMinutes: null,
    createdAt: "2026-09-16T12:00:00.000Z",
    updatedAt: "2026-09-16T12:00:00.000Z",
    version: 1,
    description: null,
    diagnosis: null,
    result: null,
    cancellationReason: null,
    participants: [],
    materials: [],
  };
}

describe("order URL state", () => {
  it("reads repeated filters, selection and valid scalar values", () => {
    const result = readOrderUrlState(
      "?status=ASSIGNED&status=PAUSED&status=INVALID"
      + "&priority=HIGH&priority=CRITICAL&overdue=true"
      + "&search=%20Acme%20&clientId=client-1&branchId=branch-1"
      + "&technicianId=tech-1&serviceTypeId=service-1"
      + "&scheduledFrom=2026-09-01T00%3A00%3A00-06%3A00"
      + "&scheduledTo=2026-09-30T23%3A59%3A59-06%3A00"
      + "&page=2&pageSize=50&orderId=o1",
    );

    expect(result).toEqual({
      filters: {
        search: "Acme",
        statuses: ["ASSIGNED", "PAUSED"],
        priorities: ["HIGH", "CRITICAL"],
        overdue: true,
        clientId: "client-1",
        branchId: "branch-1",
        technicianId: "tech-1",
        serviceTypeId: "service-1",
        scheduledFrom: "2026-09-01T00:00:00-06:00",
        scheduledTo: "2026-09-30T23:59:59-06:00",
        page: 2,
        pageSize: 50,
      },
      orderId: "o1",
    });
  });

  it("falls back safely for invalid URL values", () => {
    expect(readOrderUrlState(
      "?status=NOPE&priority=NOPE&overdue=yes&page=0&pageSize=500"
      + "&scheduledFrom=not-a-date&scheduledTo=2026-13-40&orderId=%20",
    )).toEqual({ filters: { page: 1, pageSize: 20 }, orderId: null });
  });

  it("writes stable repeated values and preserves unrelated parameters", () => {
    const query = writeOrderUrlState("?keep=1&status=PENDING", {
      filters: {
        search: "  enlace  ",
        statuses: ["PAUSED", "ASSIGNED", "PAUSED"],
        priorities: ["HIGH"],
        overdue: false,
        clientId: "client-1",
        page: 3,
        pageSize: 20,
      },
      orderId: "order-1",
    });

    expect(query.get("keep")).toBe("1");
    expect(query.get("search")).toBe("enlace");
    expect(query.getAll("status")).toEqual(["PAUSED", "ASSIGNED"]);
    expect(query.getAll("priority")).toEqual(["HIGH"]);
    expect(query.get("overdue")).toBe("false");
    expect(query.get("clientId")).toBe("client-1");
    expect(query.get("page")).toBe("3");
    expect(query.get("pageSize")).toBe("20");
    expect(query.get("orderId")).toBe("order-1");
  });
});

describe("order capabilities and actions", () => {
  it("derives module, lookup and evidence capabilities independently", () => {
    expect(deriveOrderCapabilities([
      "ORDERS_VIEW_OWN",
      "ORDERS_OPERATE_OWN",
      "CLIENTS_VIEW",
      "EVIDENCES_VIEW",
      "EVIDENCES_UPLOAD",
    ])).toEqual({
      canView: true,
      canViewAll: false,
      canManage: false,
      canOperateOwn: true,
      canLookupClients: true,
      canLookupTechnicians: false,
      canViewEvidence: true,
      canUploadEvidence: true,
      canManageEvidence: false,
    });
  });

  it.each([
    ["ASSIGNED", ["onRoute", "start"]],
    ["ON_ROUTE", ["start"]],
    ["IN_PROGRESS", ["pause", "complete", "manageMaterials"]],
    ["PAUSED", ["resume", "manageMaterials"]],
  ] as const)("offers only valid owned operations from %s", (status, actions) => {
    const capabilities = deriveOrderCapabilities([
      "ORDERS_VIEW_OWN",
      "ORDERS_OPERATE_OWN",
    ]);

    expect(allowedOrderActions(detail(status), capabilities, "tech-1"))
      .toEqual(actions);
  });

  it("does not offer owned operations to a different technician", () => {
    const capabilities = deriveOrderCapabilities([
      "ORDERS_VIEW_OWN",
      "ORDERS_OPERATE_OWN",
    ]);

    expect(allowedOrderActions(detail("IN_PROGRESS"), capabilities, "tech-2"))
      .toEqual([]);
  });

  it("offers administrative actions by state and no transition on terminal orders", () => {
    const capabilities = deriveOrderCapabilities([
      "ORDERS_VIEW_ALL",
      "ORDERS_MANAGE",
    ]);

    expect(allowedOrderActions(detail("PENDING", null), capabilities, null))
      .toEqual(["edit", "assign", "cancel"]);
    expect(allowedOrderActions(detail("COMPLETED"), capabilities, null))
      .toEqual(["adjust"]);
    expect(allowedOrderActions(detail("CANCELLED"), capabilities, null))
      .toEqual(["adjust"]);
  });
});

describe("Tegucigalpa date inputs", () => {
  it("converts between UTC and the fixed Honduras offset", () => {
    expect(toTegucigalpaDateTimeInput("2026-09-16T18:30:00.000Z"))
      .toBe("2026-09-16T12:30");
    expect(fromTegucigalpaDateTimeInput("2026-09-16T12:30"))
      .toBe("2026-09-16T12:30:00.000-06:00");
  });

  it("returns null for empty or invalid input", () => {
    expect(toTegucigalpaDateTimeInput("invalid")).toBe("");
    expect(fromTegucigalpaDateTimeInput("2026-02-30T10:00")).toBeNull();
  });
});
