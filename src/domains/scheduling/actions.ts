"use server";

import { getCurrentSession } from "@/domains/auth/actions";
import { prisma } from "@/lib/prisma";

import {
  confirmTimeSlotInputSchema,
  getAvailableSlotsInputSchema,
  setScheduleOverrideInputSchema,
  setScheduleOverrideRangeInputSchema,
  setWeeklyHoursInputSchema,
} from "./scheduling.schema";
import { confirmTimeSlot } from "./services/confirmTimeSlot";
import {
  getAvailableSlots,
  type AvailableSlot,
} from "./services/getAvailableSlots";
import { setScheduleOverride } from "./services/setScheduleOverride";
import { setScheduleOverrideRange } from "./services/setScheduleOverrideRange";
import { setWeeklyHours } from "./services/setWeeklyHours";
import type { ConfirmTimeSlotResult, SlotTime } from "./types";

const NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE =
  "You must be signed in as an artist to do that.";

// Checks activeRole (not role) so a dual-role account browsing as a client
// can't manage the artist schedule -- same posture as billing/booking.
async function requireArtistId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.activeRole !== "ARTIST" || !session.artistId) {
    return null;
  }
  return session.artistId;
}

export type GetAvailableSlotsResult =
  | { success: true; slots: AvailableSlot[] }
  | { success: false; error: string };

export type ScheduleMutationResult =
  | { success: true }
  | { success: false; error: string };

export interface WeeklyHoursSummary {
  dayOfWeek: number;
  availableTimes: SlotTime[];
}

export type GetWeeklyHoursResult =
  | { success: true; hours: WeeklyHoursSummary[] }
  | { success: false; error: string };

export interface ScheduleOverrideSummary {
  date: string;
  availableTimes: SlotTime[];
}

export type GetScheduleOverridesResult =
  | { success: true; overrides: ScheduleOverrideSummary[] }
  | { success: false; error: string };

// Controller/Action boundary (CLAUDE.md): validates structurally, then
// hands off to the domain service for the concurrency-safe database
// check. Not yet called from any view -- the artist-facing duration
// picker this depends on hasn't been built (CLAUDE.md 4.1 was scoped to
// the confirmation logic only). Also deliberately does not touch
// BookingRequest.status: composing this with booking's approveBookingRequest
// is a later wiring task, same separation booking/actions.ts already
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
// then hands off to the read query. Called from the booking form as the
// client picks a date (4.1j-c/d), so a real artistId/date are always
// supplied by the app itself -- validation here mainly guards against a
// malformed date string, not adversarial input. Intentionally public (no
// session guard): the guest booking wizard calls it signed-out, and it only
// reveals open slots.
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

// Controller/Action boundary (CLAUDE.md 4.3): validates structurally,
// then hands off to the upsert. Powers the artist-facing business
// hours settings UI (4.3.7).
export async function setWeeklyHoursAction(
  input: unknown
): Promise<ScheduleMutationResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const parsed = setWeeklyHoursInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid weekly hours.",
    };
  }

  await setWeeklyHours({ artistId, ...parsed.data });
  return { success: true };
}

// Controller/Action boundary (CLAUDE.md 4.3): validates structurally,
// then hands off to the upsert. Powers the artist-facing business
// hours settings UI (4.3.7).
export async function setScheduleOverrideAction(
  input: unknown
): Promise<ScheduleMutationResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const parsed = setScheduleOverrideInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid schedule override.",
    };
  }

  await setScheduleOverride({ artistId, ...parsed.data });
  return { success: true };
}

// Controller/Action boundary (CLAUDE.md 20.1): validates structurally,
// then hands off to the range upsert. Powers the Blackout Dates
// settings sub-view's date-range picker.
export async function setScheduleOverrideRangeAction(
  input: unknown
): Promise<ScheduleMutationResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const parsed = setScheduleOverrideRangeInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid schedule override range.",
    };
  }

  await setScheduleOverrideRange({ artistId, ...parsed.data });
  return { success: true };
}

// Controller/Action boundary (CLAUDE.md 4.3): a plain passthrough read
// with no business rules of its own, so it queries Prisma directly
// rather than adding a single-purpose domain service for it (same
// precedent as booking/actions.ts's submitBookingRequest). Powers the
// settings UI (4.3.7), which needs to show what's already configured.
export async function getWeeklyHoursAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy hook callers still pass an ignored artistId
  _input?: unknown
): Promise<GetWeeklyHoursResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const rows = await prisma.artistWeeklyHours.findMany({
    where: { artistId },
    orderBy: { dayOfWeek: "asc" },
  });

  return {
    success: true,
    hours: rows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      availableTimes: row.availableTimes as SlotTime[],
    })),
  };
}

// Controller/Action boundary (CLAUDE.md 4.3): see getWeeklyHoursAction
// above for why this queries Prisma directly.
export async function getScheduleOverridesAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy hook callers still pass an ignored artistId
  _input?: unknown
): Promise<GetScheduleOverridesResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const rows = await prisma.artistScheduleOverride.findMany({
    where: { artistId },
    orderBy: { date: "asc" },
  });

  return {
    success: true,
    overrides: rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      availableTimes: row.availableTimes as SlotTime[],
    })),
  };
}
