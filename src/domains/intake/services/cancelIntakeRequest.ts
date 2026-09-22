import { prisma } from "@/lib/prisma";

import {
  CANCELLATION_WINDOW_ERROR_MESSAGE,
  CANCELLATION_WINDOW_HOURS,
  REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { CancelIntakeRequestInput, CancelIntakeRequestResult } from "../types";

const RESOLVED_STATUSES = new Set(["CANCELLED_BY_CLIENT", "DECLINED", "COMPLETED"]);

// Self-service cancellation from the client dashboard (CLAUDE.md 5.4).
// clientProfileId is the trusted session's own id (see
// intake/actions.ts), never client-supplied -- an ownership mismatch is
// reported the same as a missing request, so a cancel attempt can't be
// used to probe whether some other id exists. PENDING/
// AWAITING_SLOT_CONFIRMATION have no locked slot yet, so only APPROVED
// is subject to the cancellation window; cancelling one releases its
// BOOKED TimeSlot rows back to RELEASED so the slot frees up again in
// getAvailableSlots.
export async function cancelIntakeRequest(
  input: CancelIntakeRequestInput
): Promise<CancelIntakeRequestResult> {
  const request = await prisma.intakeRequest.findUnique({
    where: { id: input.intakeRequestId },
    include: { timeSlots: true },
  });

  if (!request || request.clientId !== input.clientProfileId) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (RESOLVED_STATUSES.has(request.status)) {
    return { success: false, error: REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE };
  }

  if (request.status === "APPROVED") {
    const earliestStart = request.timeSlots.reduce(
      (earliest, slot) => (slot.startTime < earliest ? slot.startTime : earliest),
      request.timeSlots[0]?.startTime ?? new Date()
    );
    const windowMs = CANCELLATION_WINDOW_HOURS * 60 * 60_000;
    if (earliestStart.getTime() - Date.now() < windowMs) {
      return { success: false, error: CANCELLATION_WINDOW_ERROR_MESSAGE };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.timeSlot.updateMany({
      where: { intakeRequestId: request.id, status: "BOOKED" },
      data: { status: "RELEASED" },
    });
    await tx.intakeRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED_BY_CLIENT" },
    });
  });

  return { success: true };
}
