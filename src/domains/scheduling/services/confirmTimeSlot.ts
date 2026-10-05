import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "../constants";
import type { ConfirmTimeSlotInput, ConfirmTimeSlotResult } from "../types";
import { computeSlotRanges } from "./computeSlotRanges";

type PrismaTransactionClient = Prisma.TransactionClient;

// Postgres error code for an EXCLUDE constraint violation, thrown when
// TimeSlot's GiST overlap-exclusion constraint (see prisma/migrations)
// rejects a concurrently-booked slot. Prisma 7's driver-adapter client
// wraps this as a generic PrismaClientKnownRequestError (its own `code`
// is an unrelated, non-specific P2039) and only preserves the native
// Postgres code inside the error message text -- `meta` comes back
// empty, so the message is the only reliable signal here.
const POSTGRES_EXCLUSION_VIOLATION_CODE = "23P01";

// Prisma's code for "write conflict or deadlock" (Postgres 40001/40P01).
// Two transactions racing for the same window can have the loser aborted
// this way instead of by the exclusion constraint; either way it lost the
// race for the slot, so it maps to the same conflict result (no retry).
const PRISMA_WRITE_CONFLICT_CODE = "P2034";

// Exported for reuse by callers (e.g. booking's reviewBookingRequest, 4.1f)
// that need to book slots as part of a larger transaction spanning
// domains, rather than confirmTimeSlot's own self-contained one below.
export function isSlotConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_WRITE_CONFLICT_CODE
  ) {
    return true;
  }
  return error instanceof Error && error.message.includes(POSTGRES_EXCLUSION_VIOLATION_CODE);
}

// The transaction-composable core: creates the one or two BOOKED
// TimeSlot rows an artist-decided duration needs, against whatever
// transaction client the caller supplies. Leans entirely on TimeSlot's
// exclusion constraint for the no-double-booking guarantee (does not
// pre-check for overlaps itself) -- callers must catch isSlotConflict
// around their own transaction.
export async function createBookedTimeSlots(
  tx: PrismaTransactionClient,
  input: ConfirmTimeSlotInput
) {
  const ranges = computeSlotRanges(input.startTime, input.durationMinutes);
  const rows = [];
  for (const range of ranges) {
    rows.push(
      await tx.timeSlot.create({
        data: {
          artistId: input.artistId,
          bookingRequestId: input.bookingRequestId,
          startTime: range.startTime,
          endTime: range.endTime,
          status: "BOOKED",
        },
      })
    );
  }
  return rows;
}

// Concurrency-safe slot allocation (CLAUDE.md 4.1: "database state
// checks"). Splits into two adjacent TimeSlot rows when the artist's
// chosen duration overflows a single slot (see computeSlotRanges); both
// rows are protected by the same constraint, so the second slot becomes
// unavailable to any other request the instant this transaction commits.
export async function confirmTimeSlot(
  input: ConfirmTimeSlotInput
): Promise<ConfirmTimeSlotResult> {
  try {
    const created = await prisma.$transaction((tx) =>
      createBookedTimeSlots(tx, input)
    );

    return { success: true, timeSlotIds: created.map((slot) => slot.id) };
  } catch (error) {
    if (isSlotConflict(error)) {
      return { success: false, error: SLOT_CONFLICT_ERROR_MESSAGE };
    }
    throw error;
  }
}
