import { planTechnicianLockIds } from "../../src/activities/activities.mutation.repository.js";

describe("activity technician lock planning", () => {
  it("deduplicates and orders UUIDs before advisory-lock acquisition", () => {
    const lower = "00000000-0000-4000-8000-000000000001";
    const higher = "00000000-0000-4000-8000-000000000002";

    expect(planTechnicianLockIds([higher, lower, lower])).toEqual([lower, higher]);
  });
});
