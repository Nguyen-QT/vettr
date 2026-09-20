import { prisma } from "@/lib/prisma";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "../constants";
import type { ConfirmTimeSlotInput, ConfirmTimeSlotResult } from "../types";
import { computeSlotRanges } from "./computeSlotRanges";

// Postgres error code for an EXCLUDE constraint violation, thrown when
// TimeSlot's GiST overlap-exclusion constraint (see prisma/migrations)
// rejects a concurrently-booked slot. Prisma 7's driver-adapter client
// wraps this as a generic PrismaClientKnownRequestError (its own `code`
// is an unrelated, non-specific P2039) and only preserves the native
// Postgres code inside the error message text -- `meta` comes back
// empty, so the message is the only reliable signal here.
const POSTGRES_EXCLUSION_VIOLATION_CODE = "23P01";

function isSlotConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes(POSTGRES_EXCLUSION_VIOLATION_CODE);
}

// Concurrency-safe slot allocation (CLAUDE.md 4.1: "database state
// checks"). Deliberately does not pre-check for overlaps itself -- it
// leans entirely on TimeSlot's exclusion constraint to make the
// no-double-booking guarantee hold even under two concurrent approvals,
// which an app-level read-then-write check cannot do on its own. Splits
// into two adjacent TimeSlot rows when the artist's chosen duration
// overflows a single slot (see computeSlotRanges); both rows are
// protected by the same constraint, so the second slot becomes
// unavailable to any other request the instant this transaction commits.
export async function confirmTimeSlot(
  input: ConfirmTimeSlotInput
): Promise<ConfirmTimeSlotResult> {
  const ranges = computeSlotRanges(input.startTime, input.durationMinutes);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const range of ranges) {
        rows.push(
          await tx.timeSlot.create({
            data: {
              artistId: input.artistId,
              intakeRequestId: input.intakeRequestId,
              startTime: range.startTime,
              endTime: range.endTime,
              status: "BOOKED",
            },
          })
        );
      }
      return rows;
    });

    return { success: true, timeSlotIds: created.map((slot) => slot.id) };
  } catch (error) {
    if (isSlotConflict(error)) {
      return { success: false, error: SLOT_CONFLICT_ERROR_MESSAGE };
    }
    throw error;
  }
}
