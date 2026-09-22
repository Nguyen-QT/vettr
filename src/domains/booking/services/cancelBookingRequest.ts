import { refundDeposit } from "@/domains/billing/services/refundDeposit";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";
import { prisma } from "@/lib/prisma";

import {
  CANCELLATION_WINDOW_ERROR_MESSAGE,
  CANCELLATION_WINDOW_HOURS,
  REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { CancelBookingRequestInput, CancelBookingRequestResult } from "../types";
import { applyCancellationStrike } from "./applyCancellationStrike";

const RESOLVED_STATUSES = new Set(["CANCELLED_BY_CLIENT", "DECLINED", "COMPLETED"]);

// Self-service cancellation from the client dashboard (CLAUDE.md 5.4).
// clientProfileId is the trusted session's own id (see
// booking/actions.ts), never client-supplied -- an ownership mismatch is
// reported the same as a missing request, so a cancel attempt can't be
// used to probe whether some other id exists. PENDING/
// AWAITING_SLOT_CONFIRMATION have no locked slot yet, so only APPROVED
// is subject to the cancellation window; cancelling one releases its
// BOOKED TimeSlot rows back to RELEASED so the slot frees up again in
// getAvailableSlots, and applies a cancellation strike (CLAUDE.md 5.6)
// since it cost the artist a real, already-locked slot.
export async function cancelBookingRequest(
  input: CancelBookingRequestInput
): Promise<CancelBookingRequestResult> {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: input.bookingRequestId },
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

  const wasApproved = request.status === "APPROVED";

  await prisma.$transaction(async (tx) => {
    await releaseBookedTimeSlots(tx, request.id);
    await tx.bookingRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED_BY_CLIENT" },
    });
    if (wasApproved) {
      await applyCancellationStrike(tx, request.clientId);
    }
  });

  // Refunds in full -- this cancellation only ever reaches here outside
  // the CANCELLATION_WINDOW_HOURS check above (CLAUDE.md 7.3). Deliberately
  // outside the transaction: refundDeposit makes an external Stripe call,
  // which shouldn't hold a DB transaction open for the duration of that
  // network round-trip. The cancellation has already committed by this
  // point, so a refund failure is logged rather than reported back as a
  // cancellation failure -- the booking is genuinely cancelled either way,
  // and refundDeposit's own webhook backstop (confirmDepositRefund)
  // reconciles a transient failure independently.
  if (request.depositPaid) {
    const refundResult = await refundDeposit(request.id);
    if (!refundResult.success) {
      console.error(
        `Deposit refund failed for cancelled booking request ${request.id}:`,
        refundResult.error
      );
    }
  }

  return { success: true };
}
