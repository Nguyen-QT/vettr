import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import {
  createBookedTimeSlots,
  isSlotConflict,
} from "@/domains/scheduling/services/confirmTimeSlot";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";
import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type {
  RescheduleApprovedBookingInput,
  RescheduleApprovedBookingResult,
} from "../types";

const NOT_APPROVED_ERROR_MESSAGE = "Only an approved booking can be rescheduled.";

// Artist-initiated reschedule of an already-APPROVED booking (CLAUDE.md
// 5.5.1) -- the artist has final say over all slot allocation, same
// "No Auto-Booking" model as approval itself, so this applies
// immediately rather than needing the client's on-platform confirmation
// (client-initiated reschedule proposals are a separate backlog item).
// Releases the old BOOKED TimeSlot(s) and books the new one(s) inside
// one transaction: TimeSlot's overlap-exclusion constraint only applies
// to BOOKED rows (see its migration), so releasing first means the old
// slot(s) never register as a self-conflict against the new booking,
// and a genuine conflict on the new time rolls the whole thing back
// rather than leaving the request slotless.
export async function rescheduleApprovedBooking(
  input: RescheduleApprovedBookingInput
): Promise<RescheduleApprovedBookingResult> {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: input.bookingRequestId },
  });

  if (!request) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.status !== "APPROVED") {
    return { success: false, error: NOT_APPROVED_ERROR_MESSAGE };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await releaseBookedTimeSlots(tx, request.id);

      await createBookedTimeSlots(tx, {
        bookingRequestId: request.id,
        artistId: request.artistId,
        startTime: input.newStartTime,
        durationMinutes: input.durationMinutes,
      });

      // Keeps the client dashboard's displayed time accurate --
      // requestedStartTime reflects the current booked time once
      // APPROVED, not just the client's original candidate slot.
      await tx.bookingRequest.update({
        where: { id: request.id },
        data: { requestedStartTime: input.newStartTime },
      });
    });
  } catch (error) {
    if (isSlotConflict(error)) {
      return { success: false, error: SLOT_CONFLICT_ERROR_MESSAGE };
    }
    throw error;
  }

  return { success: true };
}
