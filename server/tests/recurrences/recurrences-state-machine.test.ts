import { describe, expect, it } from "vitest";
import { transitionRecurrence } from "../../src/recurrences/recurrences.state-machine.js";

describe("recurrence state machine", () => {
  it("moves only through the approved correction workflow", () => {
    expect(transitionRecurrence("OPEN", "ANALYZE")).toBe("ANALYSIS");
    expect(transitionRecurrence("ANALYSIS", "START_CORRECTION")).toBe("CORRECTION");
    expect(transitionRecurrence("CORRECTION", "CLOSE")).toBe("CLOSED");
  });

  it("allows dismissal only from open or analysis and never reopens terminals", () => {
    expect(transitionRecurrence("OPEN", "DISMISS")).toBe("DISMISSED");
    expect(transitionRecurrence("ANALYSIS", "DISMISS")).toBe("DISMISSED");
    expect(transitionRecurrence("CORRECTION", "DISMISS")).toBeNull();
    expect(transitionRecurrence("CLOSED", "ANALYZE")).toBeNull();
    expect(transitionRecurrence("DISMISSED", "ANALYZE")).toBeNull();
  });
});
