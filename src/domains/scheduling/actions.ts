"use server";

import { confirmTimeSlotInputSchema } from "./scheduling.schema";
import { confirmTimeSlot } from "./services/confirmTimeSlot";
import type { ConfirmTimeSlotResult } from "./types";

// Controller/Action boundary (CLAUDE.md): validates structurally, then
// hands off to the domain service for the concurrency-safe database
// check. Not yet called from any view -- the artist-facing duration
// picker this depends on hasn't been built (CLAUDE.md 4.1 was scoped to
// the confirmation logic only). Also deliberately does not touch
// IntakeRequest.status: composing this with intake's approveIntakeRequest
// is a later wiring task, same separation intake/actions.ts already
// documents on its own approve/decline mutators.
export async function confirmTimeSlotAction(
  input: unknown
): Promise<ConfirmTimeSlotResult> {
  const parsed = confirmTimeSlotInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid time slot request.",
    };
  }

  return confirmTimeSlot(parsed.data);
}
