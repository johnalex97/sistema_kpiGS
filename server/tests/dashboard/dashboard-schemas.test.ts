import { describe, expect, it } from "vitest";
import { operationalDashboardQuerySchema } from "../../src/dashboard/dashboard.schemas.js";
import { getOperationalDayBounds } from "../../src/dashboard/dashboard.time.js";

describe("operational dashboard query", () => {
  it("accepts an omitted date and a valid ISO calendar date", () => {
    expect(operationalDashboardQuerySchema.safeParse({}).success).toBe(true);
    expect(operationalDashboardQuerySchema.safeParse({ date: "2026-09-30" }).success).toBe(true);
  });

  it.each(["2026-2-3", "2026-02-30", "30-09-2026"])(
    "rejects invalid date %s",
    (date) => {
      expect(operationalDashboardQuerySchema.safeParse({ date }).success).toBe(false);
    },
  );
});

describe("operational day bounds", () => {
  it("uses the Honduras calendar day rather than UTC midnight", () => {
    const bounds = getOperationalDayBounds("2026-09-30", "America/Tegucigalpa");

    expect(bounds.start.toISOString()).toBe("2026-09-30T06:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });
});
