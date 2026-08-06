import { transitionActivity } from "../../src/activities/activities.state-machine.js";

describe("transitionActivity", () => {
  it.each([
    ["PENDING", "START", "IN_PROGRESS"],
    ["PENDING", "CANCEL", "CANCELLED"],
    ["IN_PROGRESS", "PAUSE", "PAUSED"],
    ["IN_PROGRESS", "COMPLETE", "COMPLETED"],
    ["IN_PROGRESS", "CANCEL", "CANCELLED"],
    ["PAUSED", "RESUME", "IN_PROGRESS"],
    ["PAUSED", "CANCEL", "CANCELLED"],
  ] as const)("moves %s with %s to %s", (current, command, expected) => {
    expect(transitionActivity(current, command)).toBe(expected);
  });

  it.each([
    ["PENDING", "PAUSE"], ["PENDING", "RESUME"], ["PENDING", "COMPLETE"],
    ["IN_PROGRESS", "START"], ["IN_PROGRESS", "RESUME"],
    ["PAUSED", "START"], ["PAUSED", "PAUSE"], ["PAUSED", "COMPLETE"],
    ["COMPLETED", "START"], ["COMPLETED", "PAUSE"], ["COMPLETED", "RESUME"], ["COMPLETED", "COMPLETE"], ["COMPLETED", "CANCEL"],
    ["CANCELLED", "START"], ["CANCELLED", "PAUSE"], ["CANCELLED", "RESUME"], ["CANCELLED", "COMPLETE"], ["CANCELLED", "CANCEL"],
  ] as const)("rejects %s with %s", (current, command) => {
    expect(transitionActivity(current, command)).toBeNull();
  });
});
