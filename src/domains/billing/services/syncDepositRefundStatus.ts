import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import type { SyncDepositRefundStatusInput } from "../types";
import { advanceDepositRefundStatus } from "./advanceDepositRefundStatus";

// Domain Service (56.6): called from the Stripe webhook route for every
// refund.created, refund.updated and refund.failed, whatever its status.
// Replaces confirmDepositRefund, and reads only billing's DepositRefund
// table. It finds the booking's row, then moves it through
// advanceDepositRefundStatus, which alone decides what the status means
// and whether the row may move. A row matches when:
// - it already holds this refund id, or
// - it is the id-less intent row for this refund's PaymentIntent and the
//   refund's metadata.bookingRequestId names its booking. That is the case
//   where refundDeposit reached Stripe but its own write was lost.
// Both are one read, so a refundDeposit write that lands between two
// separate reads can't make its own refund look unmatched. A refund with
// no metadata (a Dashboard refund, partial or full) never takes an intent
// row, and a second refund on a PaymentIntent whose row holds another id
// matches nothing. Both are logged critical with ids only and never
// recorded: every Stripe charge on this account is a deposit, and the
// route still answers 200 because a retry can't create a match. Returns
// whether it wrote. Database errors aren't caught, so the route answers
// 500 and Stripe redelivers.
export async function syncDepositRefundStatus(
  input: SyncDepositRefundStatusInput
): Promise<boolean> {
  const {
    stripeRefundId,
    stripePaymentIntentId,
    metadataBookingRequestId,
    stripeStatus,
    failureReason,
  } = input;

  // Built only when both ids are present: Prisma drops an undefined filter,
  // so a refund with no metadata would otherwise match any id-less row on
  // its PaymentIntent.
  const intentMatch: Prisma.DepositRefundWhereInput[] =
    metadataBookingRequestId && stripePaymentIntentId
      ? [
          {
            bookingRequestId: metadataBookingRequestId,
            stripePaymentIntentId,
            stripeRefundId: null,
          },
        ]
      : [];

  const row = await prisma.depositRefund.findFirst({
    where: { OR: [{ stripeRefundId }, ...intentMatch] },
    select: { bookingRequestId: true },
  });

  if (!row) {
    console.error({
      operation: "syncDepositRefundStatus",
      reason: "refund_unmatched",
      severity: "critical",
      stripeRefundId,
      paymentIntentId: stripePaymentIntentId,
      bookingRequestId: metadataBookingRequestId,
    });
    return false;
  }

  return advanceDepositRefundStatus({
    bookingRequestId: row.bookingRequestId,
    stripeRefundId,
    stripeStatus,
    failureReason,
  });
}
