import { cancelDepositPaymentIntent } from "@/domains/billing/services/cancelDepositPaymentIntent";
import { insertDepositRefundIntent } from "@/domains/billing/services/insertDepositRefundIntent";
import { refundDeposit } from "@/domains/billing/services/refundDeposit";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  CANCEL_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
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
//
// Never throws (28.8.2.3): useClientBookingActions has no try/catch
// around the action, so an escaped throw replaces the whole page with
// Next's default error screen instead of showing an inline message.
export async function cancelBookingRequest(
  input: CancelBookingRequestInput
): Promise<CancelBookingRequestResult> {
  let cancelled: { depositPaid: boolean; stripePaymentIntentId: string | null };
  try {
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

    cancelled = await prisma.$transaction(async (tx) => {
      await releaseBookedTimeSlots(tx, request.id);
      const updated = await tx.bookingRequest.update({
        where: { id: request.id },
        data: { status: "CANCELLED_BY_CLIENT" },
        select: { depositPaid: true, stripePaymentIntentId: true },
      });
      // The owed refund commits with the cancel or not at all (56.7), so a
      // crash after the commit or a failed refund call below leaves a
      // PENDING intent for the retry sweep instead of nothing.
      if (updated.depositPaid && updated.stripePaymentIntentId) {
        await insertDepositRefundIntent(tx, request.id, updated.stripePaymentIntentId);
      }
      if (wasApproved) {
        await applyCancellationStrike(tx, request.clientId);
      }
      return updated;
    });
  } catch (error) {
    // Nothing has committed: a throw from the read or anywhere in the
    // transaction (which rolls back whole) gets the same generic message,
    // so "try again" is accurate. The log is a fixed allowlist -- the
    // opaque request id and the typed Prisma code only (architecture.md
    // §8.B).
    const errorCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    console.error({
      operation: "cancelBookingRequest",
      reason: "unexpected_failure",
      bookingRequestId: input.bookingRequestId,
      errorCode,
    });
    return { success: false, error: CANCEL_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE };
  }

  // Refunds in full -- this cancellation only ever reaches here outside
  // the CANCELLATION_WINDOW_HOURS check above (CLAUDE.md 7.3). Deliberately
  // outside the transaction: refundDeposit makes an external Stripe call,
  // which shouldn't hold a DB transaction open for the duration of that
  // network round-trip. The cancellation and its refund intent have
  // already committed by this point, so a refund failure is logged rather
  // than reported back as a cancellation failure -- the booking is
  // genuinely cancelled either way. A thrown refundDeposit (its booking
  // read is outside its own try/catch) is logged the same as a failed
  // result (28.8.2.3, architecture.md §6.2). The deposit-refund retry
  // sweep (56.7) retries the intent, which stays PENDING with no refund
  // id; the refund webhooks (syncDepositRefundStatus) only reconcile a
  // refund Stripe actually created. depositPaid and stripePaymentIntentId
  // are read back from the status update above, not the earlier read
  // (56.2, 56.4), so a payment confirmed or a PaymentIntent stored in
  // between is still seen.
  if (cancelled.depositPaid) {
    let refunded: boolean;
    try {
      refunded = (await refundDeposit(input.bookingRequestId)).success;
    } catch {
      refunded = false;
    }
    if (!refunded) {
      console.error({
        operation: "cancelBookingRequest",
        reason: "deposit_refund_failed",
        severity: "warning",
        bookingRequestId: input.bookingRequestId,
        paymentIntentId: cancelled.stripePaymentIntentId,
      });
    }
  } else if (cancelled.stripePaymentIntentId) {
    // Unpaid: cancel the stored PaymentIntent so a tab with the deposit
    // form still open can't pay it (56.4). An optimisation, not the
    // guarantee -- if this fails, or the process dies before it, 56.2
    // refunds a payment that lands on the cancelled booking.
    // cancelDepositPaymentIntent never throws and logs its own failure, so
    // its result changes nothing here.
    await cancelDepositPaymentIntent(cancelled.stripePaymentIntentId);
  }

  return { success: true };
}
