import { z } from "zod";

import {
  DAILY_SLOT_TIME_OPTIONS,
  MAX_SCHEDULE_OVERRIDE_RANGE_DAYS,
} from "./constants";

// Structural validity only — see services/getAvailableSlots.ts for the
// availability read itself.
export const getAvailableSlotsInputSchema = z.object({
  artistId: z.string().min(1),
  date: z.iso.date("Enter a valid date."),
});

const availableTimesInputSchema = z.array(z.enum(DAILY_SLOT_TIME_OPTIONS));

// Structural validity only — see services/setWeeklyHours.ts for the
// upsert itself. artistId is deliberately absent from the three settings
// schemas: the controller derives it from the session (validation.md §2).
export const setWeeklyHoursInputSchema = z.object({
  dayOfWeek: z
    .number()
    .int()
    .min(0, "Day of week must be between 0 (Sunday) and 6 (Saturday).")
    .max(6, "Day of week must be between 0 (Sunday) and 6 (Saturday)."),
  availableTimes: availableTimesInputSchema,
});

// Structural validity only — see services/setScheduleOverride.ts for
// the upsert itself.
export const setScheduleOverrideInputSchema = z.object({
  date: z.iso.date("Enter a valid date."),
  availableTimes: availableTimesInputSchema,
});

// Structural validity only — see services/setScheduleOverrideRange.ts
// for the upsert itself. The day-count refine assumes both dates are
// already known to be valid ISO strings (guaranteed by the schema
// shape above running first) and endDate on or after startDate
// (guaranteed by the preceding refine, Zod runs .refine chains in
// declared order).
export const setScheduleOverrideRangeInputSchema = z
  .object({
    startDate: z.iso.date("Enter a valid start date."),
    endDate: z.iso.date("Enter a valid end date."),
    availableTimes: availableTimesInputSchema,
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      const rangeDays =
        (new Date(`${data.endDate}T00:00:00`).getTime() -
          new Date(`${data.startDate}T00:00:00`).getTime()) /
          (24 * 60 * 60 * 1000) +
        1;
      return rangeDays <= MAX_SCHEDULE_OVERRIDE_RANGE_DAYS;
    },
    {
      message: `A date range override cannot span more than ${MAX_SCHEDULE_OVERRIDE_RANGE_DAYS} days.`,
      path: ["endDate"],
    }
  );
