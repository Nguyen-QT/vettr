import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { computeSlotRanges } from "@/domains/scheduling/services/computeSlotRanges";
import {
  createBookedTimeSlots,
  isSlotConflict,
} from "@/domains/scheduling/services/confirmTimeSlot";
import { prisma } from "@/lib/prisma";

import { generateResponseMessage } from "./generateResponseMessage";

export interface ReviewIntakeRequestInput {
  intakeRequestId: string;
  durationMinutes: number;
}

export type ReviewIntakeRequestResult =
  | {
      success: true;
      outcome: "APPROVED" | "AWAITING_SLOT_CONFIRMATION";
      responseMessage: string;
    }
  | { success: false; error: string };

// Cross-domain orchestration (CLAUDE.md 4.1f): the artist's approval
// decision, now that duration is theirs to set rather than the client's.
// A duration that fits one slot books it and approves atomically in one
// transaction. A duration that spills into a second slot can't be
// booked yet -- that needs off-platform confirmation with the client
// first (see confirmProposedBooking, 4.1g) -- so this only stores the
// proposal and moves the request to AWAITING_SLOT_CONFIRMATION instead.
export async function reviewIntakeRequest(
  input: ReviewIntakeRequestInput
): Promise<ReviewIntakeRequestResult> {
  const request = await prisma.intakeRequest.findUnique({
    where: { id: input.intakeRequestId },
  });

  if (!request) {
    return { success: false, error: "This request could not be found." };
  }

  const requestedStartTime = request.requestedStartTime;
  if (!requestedStartTime) {
    return {
      success: false,
      error: "This request has no requested time on file.",
    };
  }

  const ranges = computeSlotRanges(requestedStartTime, input.durationMinutes);

  if (ranges.length > 1) {
    await prisma.intakeRequest.update({
      where: { id: request.id },
      data: {
        status: "AWAITING_SLOT_CONFIRMATION",
        proposedDurationMinutes: input.durationMinutes,
      },
    });

    return {
      success: true,
      outcome: "AWAITING_SLOT_CONFIRMATION",
      responseMessage: generateResponseMessage("AWAITING_SLOT_CONFIRMATION"),
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await createBookedTimeSlots(tx, {
        intakeRequestId: request.id,
        artistId: request.artistId,
        startTime: requestedStartTime,
        durationMinutes: input.durationMinutes,
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
    outcome: "APPROVED",
    responseMessage: generateResponseMessage("APPROVED"),
  };
}
