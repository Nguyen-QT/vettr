import { z } from "zod";

import {
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
