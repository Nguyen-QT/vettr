// Pure domain contracts for the scheduling bounded context. Deliberately
// standalone TypeScript — no z.infer, no import from scheduling.schema.ts —
// so the domain's shape doesn't depend on which validation library
// enforces it at runtime. Kept structurally in sync with constants.ts's
// runtime bounds and scheduling.schema.ts's Zod schema by hand; they are
// not derived from one another.

// One of the artist's fixed daily times (CLAUDE.md 4.1e/4.1j), e.g.
// 11:00, 14:00, 17:30. Placeholder set -- tune to the actual daily
// schedule. Lives here rather than in intake since intake depends on
// scheduling, not the other way around, and 4.1j's getAvailableSlots
// needs this same set.
export type SlotTime = "11:00" | "14:00" | "17:30";

// startTime comes from the client's originally requested candidate slot.
// durationMinutes is an artist decision made at approval time, not
// something the client supplies — endTime is always derived from it.
export interface ConfirmTimeSlotInput {
  intakeRequestId: string;
  artistId: string;
  startTime: Date;
  durationMinutes: number;
}

// More than one id when the artist's chosen duration spills past a
// single slot's length and consumes a second, adjacent slot row too.
export type ConfirmTimeSlotResult =
  | { success: true; timeSlotIds: string[] }
  | { success: false; error: string };
