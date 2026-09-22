import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositRefund } from "@/domains/booking/services/recordDepositRefund";
import { stripe } from "@/lib/stripe";

import {
  DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
  DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE,
  DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { RefundDepositResult } from "../types";

// Domain Service (CLAUDE.md 7.3.3): issues a full refund of a paid
// deposit via Stripe. Callers (booking's cancelBookingRequest/
// cancelApprovedBookingAsArtist, 7.3.4) both refund in full regardless
// of cancellation timing -- self-cancel is only ever reachable outside
// the existing 48-hour window, and an artist-cancel is never the
// client's fault -- so there's no partial-refund calculation here. A
// no-show forfeits the deposit simply by never calling this function.
// Idempotent: depositRefunded already true returns success without a
// second Stripe call. Reads/writes BookingRequest through booking's
// narrow deposit functions (7.2.3/7.3.2) rather than prisma directly
// -- billing never queries booking's table (CLAUDE.md's Domain
// Boundary Isolation rule).
export async function refundDeposit(
  bookingRequestId: string
): Promise<RefundDepositResult> {
  const request = await getBookingRequestForDeposit(bookingRequestId);

  if (!request) {
    return { success: false, error: DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.depositRefunded) {
    return { success: true };
  }

  if (!request.depositPaid) {
    return { success: false, error: DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE };
  }

  if (!request.stripePaymentIntentId) {
    return {
      success: false,
      error: DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
    };
  }

  const refund = await stripe.refunds.create({
    payment_intent: request.stripePaymentIntentId,
  });

  await recordDepositRefund(bookingRequestId, refund.id);

  return { success: true };
}
