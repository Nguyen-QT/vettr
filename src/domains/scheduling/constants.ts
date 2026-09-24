// Placeholder set -- tune to the artist's actual daily schedule. Kept
// structurally in sync with types.ts's SlotTime union by hand. Moved
// here from booking in 4.1j since getAvailableSlots needs it too, and
// scheduling is the lower-level domain (booking depends on it, not
// vice versa).
export const DAILY_SLOT_TIME_OPTIONS = ["11:00", "14:00", "17:30"] as const;

// Placeholder bounds — tune to the actual booking model. Length of a
// single bookable TimeSlot row, not the total service duration.
export const MIN_SLOT_DURATION_MINUTES = 60;
export const MAX_SLOT_DURATION_MINUTES = 180;

// Hard cap on the artist-decided total service duration. For now a
// booking may consume at most two consecutive slot rows (see
// services/confirmTimeSlot.ts) rather than arbitrary N-slot spanning;
// typically only FREESTYLE services ever exceed a single slot.
export const MAX_TOTAL_SERVICE_DURATION_MINUTES = MAX_SLOT_DURATION_MINUTES * 2;

// Upper bound on a single date-range override (CLAUDE.md 20.1), enforced
// at the schema layer (setScheduleOverrideRangeInputSchema) -- keeps a
// single write bounded to a sane number of upserts rather than an
// unbounded multi-year range.
export const MAX_SCHEDULE_OVERRIDE_RANGE_DAYS = 90;

// Surfaced by confirmTimeSlot when the database's overlap-exclusion
// constraint (see prisma/migrations) rejects a concurrently-booked slot.
export const SLOT_CONFLICT_ERROR_MESSAGE =
  "This time slot was already booked by another client. Please choose a different time.";
