import { z } from "zod";

import {
  DAILY_SLOT_TIME_OPTIONS,
  MAX_TOTAL_SERVICE_DURATION_MINUTES,
  MIN_SLOT_DURATION_MINUTES,
} from "./constants";

// Structural validity only — see services/confirmTimeSlot.ts for the
// concurrency-safe database check that actually allocates the slot(s).
// durationMinutes is the artist's call at approval time, not the client's.
export const confirmTimeSlotInputSchema = z
  .object({
    intakeRequestId: z.string().min(1),
    artistId: z.string().min(1),
    startTime: z.coerce.date(),
    durationMinutes: z
      .number()
      .int()
      .min(
        MIN_SLOT_DURATION_MINUTES,
        `The service duration must be at least ${MIN_SLOT_DURATION_MINUTES} minutes.`
      )
      .max(
        MAX_TOTAL_SERVICE_DURATION_MINUTES,
        `The service duration cannot exceed ${MAX_TOTAL_SERVICE_DURATION_MINUTES} minutes.`
      ),
  })
  .refine((data) => data.startTime.getTime() > Date.now(), {
    message: "The selected time slot is in the past.",
    path: ["startTime"],
  });

// Structural validity only — see services/getAvailableSlots.ts for the
// availability read itself.
export const getAvailableSlotsInputSchema = z.object({
  artistId: z.string().min(1),
  date: z.iso.date("Enter a valid date."),
});

// Shared by the business-hours read/write actions below (CLAUDE.md 4.3).
export const artistIdInputSchema = z.object({
  artistId: z.string().min(1),
});

const availableTimesInputSchema = z.array(z.enum(DAILY_SLOT_TIME_OPTIONS));

// Structural validity only — see services/setWeeklyHours.ts for the
// upsert itself.
export const setWeeklyHoursInputSchema = z.object({
  artistId: z.string().min(1),
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
  artistId: z.string().min(1),
  date: z.iso.date("Enter a valid date."),
  availableTimes: availableTimesInputSchema,
});
