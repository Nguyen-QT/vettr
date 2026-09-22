import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";
import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type {
  CancelApprovedBookingAsArtistInput,
  CancelApprovedBookingAsArtistResult,
} from "../types";

const NOT_APPROVED_ERROR_MESSAGE = "Only an approved booking can be cancelled.";

// Artist-initiated cancellation of an already-APPROVED booking (CLAUDE.md
// 5.6). Unlike cancelIntakeRequest (5.4, client-initiated), this never
// applies a cancellation strike -- it's the artist's own call to cancel,
// never the client's fault. Releases the BOOKED TimeSlot(s) back to
// RELEASED, same as the client-side cancel.
export async function cancelApprovedBookingAsArtist(
  input: CancelApprovedBookingAsArtistInput
): Promise<CancelApprovedBookingAsArtistResult> {
  const request = await prisma.intakeRequest.findUnique({
    where: { id: input.intakeRequestId },
  });

  if (!request) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.status !== "APPROVED") {
    return { success: false, error: NOT_APPROVED_ERROR_MESSAGE };
  }

  await prisma.$transaction(async (tx) => {
    await releaseBookedTimeSlots(tx, request.id);
    await tx.intakeRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED_BY_ARTIST" },
    });
  });

  return { success: true };
}
