import { describe, expect, it } from "vitest";
import {
  calculateGrossMinutes,
  isOrderOverdue,
  transitionOrder,
} from "../../src/orders/orders.state-machine.js";

describe("order state machine", () => {
  it("applies every valid operational transition", () => {
    expect(transitionOrder("ASSIGNED", "ON_ROUTE")).toBe("ON_ROUTE");
    expect(transitionOrder("ASSIGNED", "START")).toBe("IN_PROGRESS");
    expect(transitionOrder("ON_ROUTE", "START")).toBe("IN_PROGRESS");
    expect(transitionOrder("IN_PROGRESS", "PAUSE")).toBe("PAUSED");
    expect(transitionOrder("PAUSED", "RESUME")).toBe("IN_PROGRESS");
    expect(transitionOrder("IN_PROGRESS", "COMPLETE")).toBe("COMPLETED");
  });

  it("rejects invalid transitions including terminal-state commands", () => {
    expect(transitionOrder("PENDING", "START")).toBeNull();
    expect(transitionOrder("COMPLETED", "START")).toBeNull();
    expect(transitionOrder("CANCELLED", "COMPLETE")).toBeNull();
  });

  it("cancels from each open state but never from a terminal state", () => {
    for (const status of ["PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED"] as const) {
      expect(transitionOrder(status, "CANCEL")).toBe("CANCELLED");
    }
    expect(transitionOrder("COMPLETED", "CANCEL")).toBeNull();
    expect(transitionOrder("CANCELLED", "CANCEL")).toBeNull();
  });

  it("calculates gross full minutes and rejects negative temporal intervals", () => {
    expect(
      calculateGrossMinutes(
        new Date("2026-08-01T14:00:00Z"),
        new Date("2026-08-01T15:30:59Z"),
      ),
    ).toBe(90);
    expect(() => calculateGrossMinutes(new Date("2026-08-01T15:00:00Z"), new Date("2026-08-01T14:59:59Z"))).toThrow();
  });

  it("marks only scheduled open orders before now as overdue", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    expect(isOrderOverdue("IN_PROGRESS", new Date("2026-08-01T11:59:59Z"), now)).toBe(true);
    expect(isOrderOverdue("COMPLETED", new Date("2026-08-01T11:59:59Z"), now)).toBe(false);
    expect(isOrderOverdue("CANCELLED", new Date("2026-08-01T11:59:59Z"), now)).toBe(false);
    expect(isOrderOverdue("PENDING", null, now)).toBe(false);
    expect(isOrderOverdue("PENDING", new Date("2026-08-01T12:00:00Z"), now)).toBe(false);
  });
});
