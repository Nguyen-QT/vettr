// Pure domain contracts for the scheduling bounded context. Deliberately
// standalone TypeScript — no z.infer, no import from scheduling.schema.ts —
// so the domain's shape doesn't depend on which validation library
// enforces it at runtime. Kept structurally in sync with constants.ts's
// runtime bounds and scheduling.schema.ts's Zod schema by hand; they are
// not derived from one another.

// One of the artist's fixed daily times (CLAUDE.md 4.1e/4.1j), e.g.
// 11:00, 14:00, 17:30. Placeholder set -- tune to the actual daily
// schedule. Lives here rather than in booking since booking depends on
// scheduling, not the other way around, and 4.1j's getAvailableSlots
// needs this same set.
export type SlotTime = "11:00" | "14:00" | "17:30";

// startTime comes from the client's originally requested candidate slot.
// durationMinutes is an artist decision made at approval time, not
// something the client supplies — endTime is always derived from it.
export interface ConfirmTimeSlotInput {
  bookingRequestId: string;
  artistId: string;
  startTime: Date;
  durationMinutes: number;
}

// More than one id when the artist's chosen duration spills past a
// single slot's length and consumes a second, adjacent slot row too.
export type ConfirmTimeSlotResult =
  | { success: true; timeSlotIds: string[] }
  | { success: false; error: string };

// Write command (CLAUDE.md 4.3): upserts the artist's recurring weekly
// hours for one day of week. An empty availableTimes array closes that
// weekday entirely; never calling this for a given day is what leaves
// it at getOperatingWindows' default-open fallback.
export interface SetWeeklyHoursInput {
  artistId: string;
  dayOfWeek: number;
  availableTimes: SlotTime[];
}

// Write command (CLAUDE.md 4.3): upserts a one-off override for a
// specific date, taking precedence over ArtistWeeklyHours in
// getOperatingWindows. An empty availableTimes array is a full
// blackout for that date. date is "YYYY-MM-DD", the same convention
// getAvailableSlots/getOperatingWindows already use.
export interface SetScheduleOverrideInput {
  artistId: string;
  date: string;
  availableTimes: SlotTime[];
}

// Write command (CLAUDE.md 20.1): the same upsert as
// SetScheduleOverrideInput, applied across every date in a continuous
// inclusive range (e.g. blocking out an extended break in one action)
// rather than one date at a time. startDate/endDate are "YYYY-MM-DD",
// the same convention as SetScheduleOverrideInput.date.
export interface SetScheduleOverrideRangeInput {
  artistId: string;
  startDate: string;
  endDate: string;
  availableTimes: SlotTime[];
}
