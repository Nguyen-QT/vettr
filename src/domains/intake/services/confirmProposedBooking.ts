import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import {
  createBookedTimeSlots,
  isSlotConflict,
} from "@/domains/scheduling/services/confirmTimeSlot";
import { prisma } from "@/lib/prisma";

import { generateResponseMessage } from "./generateResponseMessage";

export type ConfirmProposedBookingResult =
  | { success: true; responseMessage: string }
  | { success: false; error: string };

// Finalizes an AWAITING_SLOT_CONFIRMATION request (CLAUDE.md 4.1g), once
// the artist has confirmed the double-slot booking with the client
// off-platform. Books the two slots reviewIntakeRequest (4.1f) proposed
// but never allocated, and approves, atomically in one transaction --
// same shape as reviewIntakeRequest's single-slot path, just reading the
// duration back from proposedDurationMinutes instead of taking it fresh.
export async function confirmProposedBooking(
  intakeRequestId: string
): Promise<ConfirmProposedBookingResult> {
  const request = await prisma.intakeRequest.findUnique({
    where: { id: intakeRequestId },
  });

  if (!request) {
    return { success: false, error: "This request could not be found." };
  }

  if (request.status !== "AWAITING_SLOT_CONFIRMATION") {
    return {
      success: false,
      error: "This request is not awaiting slot confirmation.",
    };
  }

  const requestedStartTime = request.requestedStartTime;
  const proposedDurationMinutes = request.proposedDurationMinutes;
  if (!requestedStartTime || !proposedDurationMinutes) {
    return {
      success: false,
      error: "This request has no proposed booking on file.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await createBookedTimeSlots(tx, {
        intakeRequestId: request.id,
        artistId: request.artistId,
        startTime: requestedStartTime,
        durationMinutes: proposedDurationMinutes,
      });
      await tx.intakeRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED" },
      });
    });
  } catch (error) {
    if (isSlotConflict(error)) {
      return { success: false, error: SLOT_CONFLICT_ERROR_MESSAGE };
    }
    throw error;
  }

  return {
    success: true,
    responseMessage: generateResponseMessage("APPROVED"),
  };
}
