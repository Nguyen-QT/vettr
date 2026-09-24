import { describe, expect, it } from "vitest";

import { MAX_SCHEDULE_OVERRIDE_RANGE_DAYS } from "./constants";
import { setScheduleOverrideRangeInputSchema } from "./scheduling.schema";

// Formats via local getters rather than toISOString(), which would
// shift the date by the runner's UTC offset once it crosses a local
// midnight boundary.
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00`);
  result.setDate(result.getDate() + days);
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, "0");
  const day = String(result.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("setScheduleOverrideRangeInputSchema", () => {
  const base = {
    artistId: "artist-1",
    availableTimes: ["11:00"] as const,
  };

  it("accepts a valid range with startDate before endDate", () => {
    const result = setScheduleOverrideRangeInputSchema.safeParse({
      ...base,
      startDate: "2027-05-01",
      endDate: "2027-05-03",
    });
    expect(result.success).toBe(true);
  });

  it("accepts startDate equal to endDate", () => {
    const result = setScheduleOverrideRangeInputSchema.safeParse({
      ...base,
      startDate: "2027-05-01",
      endDate: "2027-05-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an endDate before startDate", () => {
    const result = setScheduleOverrideRangeInputSchema.safeParse({
      ...base,
      startDate: "2027-05-03",
      endDate: "2027-05-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a range exactly at the max day count", () => {
    const startDate = "2027-01-01";
    const endDate = addDays(startDate, MAX_SCHEDULE_OVERRIDE_RANGE_DAYS - 1);
    const result = setScheduleOverrideRangeInputSchema.safeParse({
      ...base,
      startDate,
      endDate,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a range one day past the max day count", () => {
    const startDate = "2027-01-01";
    const endDate = addDays(startDate, MAX_SCHEDULE_OVERRIDE_RANGE_DAYS);
    const result = setScheduleOverrideRangeInputSchema.safeParse({
      ...base,
      startDate,
      endDate,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date string", () => {
    const result = setScheduleOverrideRangeInputSchema.safeParse({
      ...base,
      startDate: "not-a-date",
      endDate: "2027-05-03",
    });
    expect(result.success).toBe(false);
  });
});
