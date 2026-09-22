import { prisma } from "@/lib/prisma";

import {
  APPOINTMENT_NOT_YET_DUE_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type {
  MarkAppointmentCompletedInput,
  MarkAppointmentCompletedResult,
} from "../types";

const NOT_APPROVED_ERROR_MESSAGE =
  "Only an approved appointment can be marked as completed.";

// Artist marks a past-dated APPROVED appointment as completed (CLAUDE.md
// 5.6) -- same due-check as markAppointmentNoShow/getPastDueAppointments.
// No cancellation strike here, unlike the no-show/cancel transitions.
export async function markAppointmentCompleted(
  input: MarkAppointmentCompletedInput
): Promise<MarkAppointmentCompletedResult> {
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

  await prisma.intakeRequest.update({
    where: { id: request.id },
    data: { status: "COMPLETED" },
  });

  return { success: true };
}
