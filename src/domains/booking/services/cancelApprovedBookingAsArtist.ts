import { cancelDepositPaymentIntent } from "@/domains/billing/services/cancelDepositPaymentIntent";
import { insertDepositRefundIntent } from "@/domains/billing/services/insertDepositRefundIntent";
import { refundDeposit } from "@/domains/billing/services/refundDeposit";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";
import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type {
  CancelApprovedBookingAsArtistInput,
  CancelApprovedBookingAsArtistResult,
} from "../types";

const NOT_APPROVED_ERROR_MESSAGE = "Only an approved booking can be cancelled.";

// Artist-initiated cancellation of an already-APPROVED booking (CLAUDE.md
// 5.6). Unlike cancelBookingRequest (5.4, client-initiated), this never
// applies a cancellation strike -- it's the artist's own call to cancel,
// never the client's fault. Releases the BOOKED TimeSlot(s) back to
// RELEASED, same as the client-side cancel.
export async function cancelApprovedBookingAsArtist(
  input: CancelApprovedBookingAsArtistInput
): Promise<CancelApprovedBookingAsArtistResult> {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: input.bookingRequestId },
  });

  if (!request) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.status !== "APPROVED") {
    return { success: false, error: NOT_APPROVED_ERROR_MESSAGE };
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    await releaseBookedTimeSlots(tx, request.id);
    const updated = await tx.bookingRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED_BY_ARTIST" },
      select: { depositPaid: true, stripePaymentIntentId: true },
    });
    // The owed refund commits with the cancel or not at all (56.7), same
    // as cancelBookingRequest's identical step.
    if (updated.depositPaid && updated.stripePaymentIntentId) {
      await insertDepositRefundIntent(tx, request.id, updated.stripePaymentIntentId);
    }
    return updated;
  });

  // Refunds in full, unconditionally on timing -- an artist-initiated
  // cancellation is never the client's fault (CLAUDE.md 7.3). Deliberately
  // outside the transaction and logged-not-thrown-on-failure, same
  // reasoning as cancelBookingRequest's identical refund step: the
  // deposit-refund retry sweep (56.7), not the webhook, retries a failed
  // refund call. depositPaid and stripePaymentIntentId are read back from
  // the status update above, not the earlier read (56.2, 56.4), so a
  // payment confirmed or a PaymentIntent stored in between is still seen.
  if (cancelled.depositPaid) {
    const refundResult = await refundDeposit(request.id);
    if (!refundResult.success) {
      console.error({
        operation: "cancelApprovedBookingAsArtist",
        reason: "deposit_refund_failed",
        severity: "warning",
        bookingRequestId: request.id,
        paymentIntentId: cancelled.stripePaymentIntentId,
      });
    }
  } else if (cancelled.stripePaymentIntentId) {
    // Unpaid: cancel the stored PaymentIntent, same optimisation as
    // cancelBookingRequest's identical step (56.4).
    await cancelDepositPaymentIntent(cancelled.stripePaymentIntentId);
  }

  return { success: true };
}
