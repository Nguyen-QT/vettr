import { getBookingRequestByPaymentIntentId } from "@/domains/booking/services/getBookingRequestByPaymentIntentId";
import { markDepositPaid } from "@/domains/booking/services/markDepositPaid";

import {
  DEPOSIT_PAYMENT_ACTION_BY_STATUS,
  DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { ConfirmDepositPaymentResult } from "../types";
import { refundDeposit } from "./refundDeposit";

// Domain Service (CLAUDE.md 7.1.4, migrated in 7.2.4, status policy
// 56.2): called from the Stripe webhook handler once a PaymentIntent
// succeeds. Records the payment, then acts on the status the booking was
// in when it landed (DEPOSIT_PAYMENT_ACTION_BY_STATUS). That status comes
// from markDepositPaid's own update rather than the read above it, so a
// cancel or decline that committed in between is seen -- Postgres row
// locks serialise this update with each cancel path's, so exactly one
// side sees the other's write and refunds.
// A cancelled/declined booking is refunded in full on every delivery,
// redeliveries of an already-paid event included: refundDeposit no-ops
// once a refund exists (the booking's DepositRefund row holds a refund
// id, FAILED included -- recovering a failed refund is manual, 56.11),
// so redeliveries stop retrying once Stripe has a refund instead of
// failing forever. A refund that fails before Stripe makes one throws,
// so the webhook route answers 500 and Stripe redelivers to retry it. A
// newly paid
// COMPLETED/NO_SHOW booking only raises a critical alert (ids only) for
// manual reconciliation.
// A PaymentIntent that matches no booking (56.4) can only be state left
// from before 56.4, a bug, or not a deposit at all. It is logged (ids
// only) with the event's metadata.bookingRequestId: critical when that is
// set (a deposit payment that wasn't recorded), a warning when it isn't.
// The metadata is never used to find or change a booking, so nothing
// moves money on it, and a retry can't create a match, so the webhook
// still answers 200. To recover by hand: fix the row, then resend the
// event from the Stripe Dashboard or CLI.
// Reads/writes BookingRequest through booking's narrow deposit functions
// (7.2.3) rather than prisma.bookingRequest directly -- billing never
// queries booking's table (CLAUDE.md's Domain Boundary Isolation rule).
export async function confirmDepositPayment(
  paymentIntentId: string,
  metadataBookingRequestId?: string
): Promise<ConfirmDepositPaymentResult> {
  const request = await getBookingRequestByPaymentIntentId(paymentIntentId);

  if (!request) {
    console.error({
      operation: "confirmDepositPayment",
      reason: "payment_intent_unmatched",
      severity: metadataBookingRequestId ? "critical" : "warning",
      paymentIntentId,
      bookingRequestId: metadataBookingRequestId,
    });
    return { success: false, error: DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE };
  }

  const newlyPaid = !request.depositPaid;
  const status = newlyPaid ? await markDepositPaid(request.id) : request.status;
  const action = DEPOSIT_PAYMENT_ACTION_BY_STATUS[status];

  if (action === "REFUND") {
    const refundResult = await refundDeposit(request.id);
    if (!refundResult.success) {
      throw new Error(
        `Late deposit refund failed for booking request ${request.id}: ${refundResult.error}`
      );
    }
  } else if (action === "ALERT" && newlyPaid) {
    console.error({
      operation: "confirmDepositPayment",
      reason: "deposit_paid_on_unpayable_status",
      severity: "critical",
      bookingRequestId: request.id,
      paymentIntentId,
      status,
    });
  }

  return { success: true };
}
