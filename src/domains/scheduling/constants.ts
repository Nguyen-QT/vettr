// Placeholder bounds — tune to the actual booking model. Length of a
// single bookable TimeSlot row, not the total service duration.
export const MIN_SLOT_DURATION_MINUTES = 60;
export const MAX_SLOT_DURATION_MINUTES = 180;

// Hard cap on the artist-decided total service duration. For now a
// booking may consume at most two consecutive slot rows (see
// services/confirmTimeSlot.ts) rather than arbitrary N-slot spanning;
// typically only FREESTYLE services ever exceed a single slot.
export const MAX_TOTAL_SERVICE_DURATION_MINUTES = MAX_SLOT_DURATION_MINUTES * 2;

// Surfaced by confirmTimeSlot when the database's overlap-exclusion
// constraint (see prisma/migrations) rejects a concurrently-booked slot.
export const SLOT_CONFLICT_ERROR_MESSAGE =
  "This time slot was already booked by another client. Please choose a different time.";
