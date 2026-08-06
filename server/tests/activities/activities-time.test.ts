import {
  calculateActivityMinutes,
  overlapsAny,
  rangesOverlap,
} from "../../src/activities/activities.time.js";

const at = (minute: number) => new Date(Date.UTC(2026, 7, 6, 12, minute));
const range = (startedAt: number, endedAt: number) => ({ startedAt: at(startedAt), endedAt: at(endedAt) });

describe("activity time rules", () => {
  it("uses [start, end) boundaries for adjacent intervals", () => {
    expect(rangesOverlap(range(0, 10), range(10, 20))).toBe(false);
    expect(rangesOverlap(range(0, 10), range(9, 20))).toBe(true);
    expect(rangesOverlap(range(5, 5), range(0, 10))).toBe(false);
    expect(rangesOverlap(range(0, 10), range(5, 5))).toBe(false);
  });

  it("subtracts sorted multiple pauses and floors only after raw subtraction", () => {
    const result = calculateActivityMinutes(
      new Date("2026-08-06T12:00:00.000Z"),
      new Date("2026-08-06T12:03:59.999Z"),
      [
        { startedAt: new Date("2026-08-06T12:02:00.000Z"), endedAt: new Date("2026-08-06T12:02:30.000Z") },
        { startedAt: new Date("2026-08-06T12:01:00.000Z"), endedAt: new Date("2026-08-06T12:01:30.000Z") },
      ],
    );

    expect(result.pausedMinutes).toBe(1);
    expect(result.productiveMinutes).toBe(2);
    expect(result.productiveSegments.map((segment) => [segment.startedAt.toISOString(), segment.endedAt.toISOString()])).toEqual([
      ["2026-08-06T12:00:00.000Z", "2026-08-06T12:01:00.000Z"],
      ["2026-08-06T12:01:30.000Z", "2026-08-06T12:02:00.000Z"],
      ["2026-08-06T12:02:30.000Z", "2026-08-06T12:03:59.999Z"],
    ]);
  });

  it("does not move the productive cursor backward for an empty pause", () => {
    const result = calculateActivityMinutes(at(0), at(10), [range(1, 5), range(3, 3)]);

    expect(result.productiveSegments.map((segment) => [
      segment.startedAt.toISOString(),
      segment.endedAt.toISOString(),
    ])).toEqual([
      ["2026-08-06T12:00:00.000Z", "2026-08-06T12:01:00.000Z"],
      ["2026-08-06T12:05:00.000Z", "2026-08-06T12:10:00.000Z"],
    ]);
  });

  it("rejects inverted, outside, overlapping, and negative productive ranges", () => {
    expect(() => calculateActivityMinutes(at(10), at(0), [])).toThrow();
    expect(() => calculateActivityMinutes(at(0), at(10), [range(9, 11)])).toThrow();
    expect(() => calculateActivityMinutes(at(0), at(10), [range(1, 5), range(4, 6)])).toThrow();
    expect(() => calculateActivityMinutes(at(0), at(10), [range(0, 10), range(10, 11)])).toThrow();
  });

  it("allows an interval inside a paused gap but rejects overlap with productive segments", () => {
    const { productiveSegments } = calculateActivityMinutes(at(0), at(60), [range(20, 40)]);
    expect(overlapsAny(range(20, 40), productiveSegments)).toBe(false);
    expect(overlapsAny(range(19, 21), productiveSegments)).toBe(true);
  });
});
