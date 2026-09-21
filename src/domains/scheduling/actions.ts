"use server";

import {
  confirmTimeSlotInputSchema,
  getAvailableSlotsInputSchema,
} from "./scheduling.schema";
import { confirmTimeSlot } from "./services/confirmTimeSlot";
import {
  getAvailableSlots,
  type AvailableSlot,
} from "./services/getAvailableSlots";
import type { ConfirmTimeSlotResult } from "./types";

export type GetAvailableSlotsResult =
  | { success: true; slots: AvailableSlot[] }
  | { success: false; error: string };

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

// Controller/Action boundary (CLAUDE.md 4.1j-b): validates structurally,
// then hands off to the read query. Called from the intake form as the
// client picks a date (4.1j-c/d), so a real artistId/date are always
// supplied by the app itself -- validation here mainly guards against a
// malformed date string, not adversarial input.
export async function getAvailableSlotsAction(
  input: unknown
): Promise<GetAvailableSlotsResult> {
  const parsed = getAvailableSlotsInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid availability request.",
    };
  }

  const slots = await getAvailableSlots(parsed.data.artistId, parsed.data.date);
  return { success: true, slots };
}
