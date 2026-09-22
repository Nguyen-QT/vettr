import { prisma } from "@/lib/prisma";

import {
  APPOINTMENT_NOT_YET_DUE_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { MarkAppointmentNoShowInput, MarkAppointmentNoShowResult } from "../types";
import { applyCancellationStrike } from "./applyCancellationStrike";

const NOT_APPROVED_ERROR_MESSAGE =
  "Only an approved appointment can be marked as a no-show.";

// Artist marks a past-dated APPROVED appointment as a no-show (CLAUDE.md
// 5.6) -- "past-dated" means every one of its BOOKED TimeSlots has
// already started, same due-check as getPastDueAppointments, so an
// artist can't pre-emptively flag a client before the appointment time
// has even arrived. Applies a cancellation strike (CLAUDE.md 5.6/the
// project's "Flagging Mechanism") since a no-show is at least as costly
// to the artist as a late cancellation. TimeSlot rows are left BOOKED
// rather than released -- their time has passed, so they can never
// conflict with a future booking, and they're useful history of what
// was actually scheduled.
export async function markAppointmentNoShow(
  input: MarkAppointmentNoShowInput
): Promise<MarkAppointmentNoShowResult> {
  const request = await prisma.intakeRequest.findUnique({
    where: { id: input.intakeRequestId },
    include: { timeSlots: { where: { status: "BOOKED" } } },
  });

  if (!request) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.status !== "APPROVED") {
    return { success: false, error: NOT_APPROVED_ERROR_MESSAGE };
  }

  const hasFutureSlot = request.timeSlots.some(
    (slot) => slot.startTime.getTime() >= Date.now()
  );
  if (hasFutureSlot) {
    return { success: false, error: APPOINTMENT_NOT_YET_DUE_ERROR_MESSAGE };
  }

  await prisma.$transaction(async (tx) => {
    await tx.intakeRequest.update({
      where: { id: request.id },
      data: { status: "NO_SHOW" },
    });
    await applyCancellationStrike(tx, request.clientId);
  });

  return { success: true };
}
