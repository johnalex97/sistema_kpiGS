import { describe, expect, it } from "vitest";
import { formatRecurrenceDateTime } from "./recurrence-format";

describe("formatRecurrenceDateTime", () => {
  it("presenta el instante bajo America/Tegucigalpa aunque el proceso use otra zona", () => {
    expect(formatRecurrenceDateTime("2026-09-01T05:30:00.000Z")).toBe("31 ago 2026, 11:30 p. m.");
    expect(formatRecurrenceDateTime("2026-09-01T06:30:00.000Z")).toBe("1 sept 2026, 12:30 a. m.");
  });
});
