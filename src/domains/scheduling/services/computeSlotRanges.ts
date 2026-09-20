import { MAX_SLOT_DURATION_MINUTES } from "../constants";

export interface SlotRange {
  startTime: Date;
  endTime: Date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

// Pure Business Logic Core: turns an artist-decided total service
// duration into the one or two consecutive TimeSlot rows confirmTimeSlot
// needs to create. A duration that fits within a single slot's length
// stays one row; anything longer spills into a second, adjacent row
// (CLAUDE.md 4.1 -- capped at two slots for now, not arbitrary N-slot
// spanning). Assumes durationMinutes has already passed
// scheduling.schema.ts's bounds check.
export function computeSlotRanges(startTime: Date, durationMinutes: number): SlotRange[] {
  if (durationMinutes <= MAX_SLOT_DURATION_MINUTES) {
    return [{ startTime, endTime: addMinutes(startTime, durationMinutes) }];
  }

  const firstSlotEnd = addMinutes(startTime, MAX_SLOT_DURATION_MINUTES);
  return [
    { startTime, endTime: firstSlotEnd },
    { startTime: firstSlotEnd, endTime: addMinutes(startTime, durationMinutes) },
  ];
}
