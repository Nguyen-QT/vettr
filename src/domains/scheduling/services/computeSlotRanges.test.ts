import { describe, expect, it } from "vitest";

import { MAX_SLOT_DURATION_MINUTES } from "../constants";
import { computeSlotRanges } from "./computeSlotRanges";

const START = new Date("2026-10-01T11:00:00.000Z");

describe("computeSlotRanges", () => {
  it("returns a single range for a duration under the per-slot max", () => {
    const ranges = computeSlotRanges(START, 60);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({
      startTime: START,
      endTime: new Date("2026-10-01T12:00:00.000Z"),
    });
  });

  it("returns a single range at exactly the per-slot max (boundary)", () => {
    const ranges = computeSlotRanges(START, MAX_SLOT_DURATION_MINUTES);

    expect(ranges).toHaveLength(1);
    expect(ranges[0].endTime.getTime() - ranges[0].startTime.getTime()).toBe(
      MAX_SLOT_DURATION_MINUTES * 60_000
    );
  });

  it("splits into two adjacent, non-overlapping ranges just past the max (boundary)", () => {
    const ranges = computeSlotRanges(START, MAX_SLOT_DURATION_MINUTES + 1);

    expect(ranges).toHaveLength(2);
    const [first, second] = ranges;
    expect(first.startTime).toEqual(START);
    // Adjacent, not overlapping: the second range starts exactly where
    // the first ends.
    expect(second.startTime).toEqual(first.endTime);
    expect(second.endTime.getTime() - second.startTime.getTime()).toBe(60_000);
  });

  it("splits a long FREESTYLE-style duration into two ranges covering the full span", () => {
    const totalMinutes = MAX_SLOT_DURATION_MINUTES * 2;
    const ranges = computeSlotRanges(START, totalMinutes);

    expect(ranges).toHaveLength(2);
    expect(ranges[0].startTime).toEqual(START);
    expect(ranges[1].endTime).toEqual(
      new Date(START.getTime() + totalMinutes * 60_000)
    );
  });
});
